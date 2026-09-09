import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Upload } from 'tus-js-client';

import { binaryFromBlob, readBlobText, type BackupBinary } from '@/lib/backup-binary';
import type { BackupAsset, BackupManifest, BackupTransport } from '@/lib/backup-service';
import { createPersistentStorage } from '@/lib/persistent-storage';

export const BACKUP_BUCKET = 'user-backups';
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;

export interface CloudBackupSummary {
  backupId: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
}

function readSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** Cloud backup is optional: without an env the app must still run, just locally. */
export function isSupabaseBackupConfigured(): boolean {
  return readSupabaseEnv() !== null;
}

export function supabaseProjectUrl(): string {
  const env = readSupabaseEnv();
  if (!env) throw new Error('Supabase environment is not configured');
  return env.url;
}

export function createVneSupabaseClient(): SupabaseClient {
  const env = readSupabaseEnv();
  if (!env) throw new Error('Supabase environment is not configured');
  const { url, key } = env;
  return createClient(url, key, {
    auth: {
      storage: createPersistentStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });
}

function unwrap<T>(result: { data: T | null; error: Error | null }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

/** Content-addressed assets are immutable, so a name clash is the same bytes. */
function isAlreadyExists(error: unknown): boolean {
  const status = (error as { statusCode?: string | number } | null)?.statusCode;
  return String(status) === '409';
}

export class SupabaseBackupTransport implements BackupTransport {
  constructor(private readonly client: SupabaseClient, private readonly projectUrl: string) {}

  /**
   * Read from the live session every time rather than caching: a sign-out and
   * sign-in on the same instance must not keep writing to the previous user's
   * prefix. The session is held locally, so this costs no round trip.
   */
  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Sign in before creating a cloud backup');
    return data.session.user.id;
  }

  async listBackups(): Promise<CloudBackupSummary[]> {
    const rows = unwrap(await this.client.from('backup_snapshots')
      .select('id, created_at, app_version, schema_version')
      .eq('user_id', await this.userId())
      .eq('status', 'complete')
      .order('created_at', { ascending: false }));

    return rows.map((row) => ({
      backupId: row.id as string,
      createdAt: row.created_at as string,
      appVersion: row.app_version as string,
      schemaVersion: row.schema_version as number,
    }));
  }

  async hasAsset(sha256: string): Promise<boolean> {
    const files = unwrap(await this.client.storage.from(BACKUP_BUCKET)
      .list(`users/${await this.userId()}/assets`, { limit: 1, search: sha256 }));
    return files.some((file) => file.name === sha256);
  }

  async uploadAsset(asset: BackupAsset, binary: BackupBinary): Promise<void> {
    const path = `users/${await this.userId()}/assets/${asset.sha256}`;
    const bytes = await binary.bytes();

    // Resumable uploads need a Blob, which React Native cannot build from bytes,
    // so native falls back to a single request. Web keeps resumability for the
    // large assets that most need it.
    if (bytes.byteLength > RESUMABLE_THRESHOLD && Platform.OS === 'web') {
      await this.uploadResumable(path, new Blob([bytes], { type: asset.mimeType }), asset);
      return;
    }

    const { error } = await this.client.storage.from(BACKUP_BUCKET).upload(path, bytes, {
      contentType: asset.mimeType,
      upsert: false,
    });
    if (error && !isAlreadyExists(error)) throw error;
  }

  private async uploadResumable(path: string, blob: Blob, asset: BackupAsset): Promise<void> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Supabase session expired during backup');

    const storageHost = new URL(this.projectUrl).hostname
      .replace('.supabase.co', '.storage.supabase.co');
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(blob, {
        endpoint: `https://${storageHost}/storage/v1/upload/resumable`,
        chunkSize: RESUMABLE_THRESHOLD,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${data.session.access_token}` },
        metadata: { bucketName: BACKUP_BUCKET, objectName: path, contentType: asset.mimeType },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        onError: (uploadError) => {
          if (isAlreadyExists(uploadError)) resolve();
          else reject(uploadError);
        },
        onSuccess: () => resolve(),
      });
      void upload.findPreviousUploads().then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(reject);
    });
  }

  async uploadManifest(manifest: BackupManifest): Promise<void> {
    const path = `users/${await this.userId()}/backups/${manifest.backupId}/manifest.json`;
    unwrap(await this.client.storage.from(BACKUP_BUCKET).upload(
      path,
      new TextEncoder().encode(JSON.stringify(manifest)),
      { contentType: 'application/json', upsert: false },
    ));
  }

  async downloadManifest(backupId: string): Promise<unknown> {
    const path = `users/${await this.userId()}/backups/${backupId}/manifest.json`;
    const blob = unwrap(await this.client.storage.from(BACKUP_BUCKET).download(path));
    return JSON.parse(await readBlobText(blob)) as unknown;
  }

  async downloadAsset(asset: BackupAsset): Promise<BackupBinary> {
    const path = `users/${await this.userId()}/assets/${asset.sha256}`;
    const blob = unwrap(await this.client.storage.from(BACKUP_BUCKET).download(path));
    return binaryFromBlob(blob, asset.mimeType);
  }

  async markComplete(manifest: BackupManifest): Promise<void> {
    const result = await this.client.from('backup_snapshots').insert({
      id: manifest.backupId,
      user_id: await this.userId(),
      created_at: manifest.createdAt,
      app_version: manifest.appVersion,
      schema_version: manifest.schemaVersion,
      status: 'complete',
    });
    if (result.error) throw result.error;
  }

  /**
   * Assets are content-addressed and therefore shared between snapshots, so a
   * delete has to sweep: an asset may only go once no surviving manifest names
   * it. Anything unreadable — the target's own manifest, or a survivor's —
   * makes the sweep bail out and leave the bytes behind. Orphaned bytes cost
   * storage; bytes deleted out from under a healthy backup cost the backup.
   *
   * The snapshot row goes first, so a failure midway leaves an unlistable,
   * unrestorable backup rather than a listed one whose bytes are half gone.
   */
  async deleteBackup(backupId: string): Promise<void> {
    const userId = await this.userId();
    const doomed = await this.readManifestHashes(backupId);

    const deletion = await this.client.from('backup_snapshots')
      .delete().eq('id', backupId).eq('user_id', userId);
    if (deletion.error) throw deletion.error;

    const paths = [`users/${userId}/backups/${backupId}/manifest.json`];
    if (doomed) {
      const survivors = await this.survivingAssetHashes();
      if (survivors) {
        for (const sha256 of doomed) {
          if (!survivors.has(sha256)) paths.push(`users/${userId}/assets/${sha256}`);
        }
      }
    }
    unwrap(await this.client.storage.from(BACKUP_BUCKET).remove(paths));
  }

  /** null when the manifest cannot be read — the caller must not sweep on a guess. */
  private async readManifestHashes(backupId: string): Promise<Set<string> | null> {
    try {
      const manifest = await this.downloadManifest(backupId) as Partial<BackupManifest>;
      if (!Array.isArray(manifest?.assets)) return null;
      const hashes = manifest.assets.map((asset) => asset?.sha256);
      if (hashes.some((sha256) => typeof sha256 !== 'string')) return null;
      return new Set(hashes as string[]);
    } catch {
      return null;
    }
  }

  private async survivingAssetHashes(): Promise<Set<string> | null> {
    const survivors = new Set<string>();
    for (const backup of await this.listBackups()) {
      const hashes = await this.readManifestHashes(backup.backupId);
      if (!hashes) return null;
      for (const sha256 of hashes) survivors.add(sha256);
    }
    return survivors;
  }
}
