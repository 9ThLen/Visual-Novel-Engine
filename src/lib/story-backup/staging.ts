import { Platform } from 'react-native';

import {
  createMediaBlobUri,
  deleteMediaBlob,
  getMediaBlob,
  getMediaBlobStorageKey,
  hasMediaBlob,
  putMediaBlob,
} from '@/lib/idb-storage';
import type { StoryArchiveObjectSink } from '@/lib/story-backup/extract';
import type { StoryBackupAsset } from '@/lib/story-backup/types';

export interface StagedStoryBackupObject {
  sha256: string;
  stagedUri: string;
  mimeType: string;
  originalExtension?: string;
}

export interface PromotedStoryBackupObject {
  sha256: string;
  uri: string;
  created: boolean;
}

function safeExtension(value: string | undefined): string {
  return value && /^\.[a-z0-9]{1,12}$/i.test(value) ? value.toLowerCase() : '.bin';
}

class WebStagingSink implements StoryArchiveObjectSink<StagedStoryBackupObject> {
  private readonly chunks: Uint8Array[] = [];

  constructor(
    private readonly storageKey: string,
    private readonly asset: StoryBackupAsset,
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk.slice());
  }

  async close(): Promise<StagedStoryBackupObject> {
    await putMediaBlob(this.storageKey, new Blob(this.chunks, { type: this.asset.mimeType }));
    this.chunks.length = 0;
    return {
      sha256: this.asset.sha256,
      stagedUri: createMediaBlobUri(this.storageKey),
      mimeType: this.asset.mimeType,
      originalExtension: this.asset.originalExtension,
    };
  }

  async abort(): Promise<void> {
    this.chunks.length = 0;
    await deleteMediaBlob(this.storageKey).catch(() => undefined);
  }
}

class NativeStagingSink implements StoryArchiveObjectSink<StagedStoryBackupObject> {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(
    private readonly file: InstanceType<typeof import('expo-file-system').File>,
    private readonly asset: StoryBackupAsset,
  ) {
    this.writer = file.writableStream().getWriter();
  }

  async write(chunk: Uint8Array): Promise<void> {
    await this.writer.write(chunk);
  }

  async close(): Promise<StagedStoryBackupObject> {
    await this.writer.close();
    if (this.file.size !== this.asset.size) {
      if (this.file.exists) this.file.delete();
      throw new Error(`Cannot verify staged story asset: ${this.asset.assetId}`);
    }
    return {
      sha256: this.asset.sha256,
      stagedUri: this.file.uri,
      mimeType: this.asset.mimeType,
      originalExtension: this.asset.originalExtension,
    };
  }

  async abort(): Promise<void> {
    await this.writer.abort().catch(() => undefined);
    if (this.file.exists) this.file.delete();
  }
}

export async function createStoryBackupStagingSink(
  importId: string,
  asset: StoryBackupAsset,
): Promise<StoryArchiveObjectSink<StagedStoryBackupObject>> {
  if (Platform.OS === 'web') {
    return new WebStagingSink(`story-import-${importId}-${asset.sha256}`, asset);
  }

  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.cache, 'vne-story-import', importId);
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, `${asset.sha256}${safeExtension(asset.originalExtension)}`);
  file.create({ overwrite: true });
  return new NativeStagingSink(file, asset);
}

export async function discardStagedStoryBackupObjects(
  objects: Iterable<StagedStoryBackupObject>,
): Promise<void> {
  if (Platform.OS === 'web') {
    await Promise.all(Array.from(objects, (object) => {
      const key = getMediaBlobStorageKey(object.stagedUri);
      return key ? deleteMediaBlob(key) : Promise.resolve();
    }));
    return;
  }
  const { File } = await import('expo-file-system');
  for (const object of objects) {
    const file = new File(object.stagedUri);
    if (file.exists) file.delete();
  }
}

export async function promoteStagedStoryBackupObjects(
  objects: Iterable<StagedStoryBackupObject>,
): Promise<Map<string, PromotedStoryBackupObject>> {
  const promoted = new Map<string, PromotedStoryBackupObject>();
  try {
    if (Platform.OS === 'web') {
      for (const object of objects) {
        const stagedKey = getMediaBlobStorageKey(object.stagedUri);
        const blob = stagedKey ? await getMediaBlob(stagedKey) : null;
        if (!blob) throw new Error(`Missing staged story asset: ${object.sha256}`);
        const created = !await hasMediaBlob(object.sha256);
        if (created) await putMediaBlob(object.sha256, blob);
        promoted.set(object.sha256, {
          sha256: object.sha256,
          uri: createMediaBlobUri(object.sha256),
          created,
        });
        await deleteMediaBlob(stagedKey!);
      }
      return promoted;
    }

    const { Directory, File, Paths } = await import('expo-file-system');
    const directory = new Directory(Paths.document, 'media-library', 'story-imports');
    if (!directory.exists) directory.create({ intermediates: true });
    for (const object of objects) {
      const staged = new File(object.stagedUri);
      const objectDirectory = new Directory(directory, object.sha256);
      const existing = objectDirectory.exists
        ? objectDirectory.list().find((entry) => entry instanceof File)
        : undefined;
      const created = !existing;
      if (!objectDirectory.exists) objectDirectory.create({ intermediates: true });
      const target = existing ?? new File(
        objectDirectory,
        `content${safeExtension(object.originalExtension)}`,
      );
      if (created) staged.move(target);
      else if (staged.exists) staged.delete();
      promoted.set(object.sha256, { sha256: object.sha256, uri: target.uri, created });
    }
    return promoted;
  } catch (error) {
    await rollbackPromotedStoryBackupObjects(promoted.values());
    throw error;
  }
}

export async function rollbackPromotedStoryBackupObjects(
  objects: Iterable<PromotedStoryBackupObject>,
): Promise<void> {
  const created = Array.from(objects).filter((object) => object.created);
  if (Platform.OS === 'web') {
    await Promise.all(created.map((object) => deleteMediaBlob(object.sha256).catch(() => undefined)));
    return;
  }
  const { File } = await import('expo-file-system');
  for (const object of created) {
    const file = new File(object.uri);
    if (file.exists) file.delete();
  }
}
