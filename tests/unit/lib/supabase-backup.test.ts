import type { SupabaseClient } from '@supabase/supabase-js';

import { BACKUP_BUCKET, SupabaseBackupTransport } from '@/lib/supabase-backup';

const USER = 'user-1';

function manifestJson(assetHashes: string[]): string {
  return JSON.stringify({ assets: assetHashes.map((sha256) => ({ sha256 })) });
}

/**
 * Enough of the Postgrest/Storage surface for the delete path: a chainable,
 * awaitable query builder over an in-memory table and object store.
 */
function createFakeClient() {
  let rows = [
    { id: 'backup-1', created_at: '2026-07-14T10:00:00.000Z', app_version: '1.0.0', schema_version: 1 },
    { id: 'backup-2', created_at: '2026-07-13T10:00:00.000Z', app_version: '1.0.0', schema_version: 1 },
  ];
  const objects = new Map<string, string>([
    [`users/${USER}/backups/backup-1/manifest.json`, manifestJson(['hash-1', 'hash-shared'])],
    [`users/${USER}/backups/backup-2/manifest.json`, manifestJson(['hash-shared', 'hash-2'])],
    [`users/${USER}/assets/hash-1`, 'bytes'],
    [`users/${USER}/assets/hash-2`, 'bytes'],
    [`users/${USER}/assets/hash-shared`, 'bytes'],
  ]);

  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: USER } } }, error: null }),
    },
    from: () => {
      let deleting = false;
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        delete: () => { deleting = true; return builder; },
        eq: (column: string, value: string) => {
          if (deleting && column === 'id') rows = rows.filter((row) => row.id !== value);
          return builder;
        },
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve(resolve({ data: rows, error: null })),
      };
      return builder;
    },
    storage: {
      from: () => ({
        download: (path: string) => Promise.resolve(objects.has(path)
          ? { data: new Blob([objects.get(path) as string]), error: null }
          : { data: null, error: new Error(`missing: ${path}`) }),
        remove: (paths: string[]) => {
          paths.forEach((path) => objects.delete(path));
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };

  return {
    transport: new SupabaseBackupTransport(client as unknown as SupabaseClient, 'https://p.supabase.co'),
    objects,
    rowIds: () => rows.map((row) => row.id),
    dropManifest: (backupId: string) =>
      objects.delete(`users/${USER}/backups/${backupId}/manifest.json`),
  };
}

describe('SupabaseBackupTransport.deleteBackup', () => {
  it('uses the right bucket', () => {
    expect(BACKUP_BUCKET).toBe('user-backups');
  });

  it('sweeps only the assets no surviving backup needs', async () => {
    const cloud = createFakeClient();

    await cloud.transport.deleteBackup('backup-1');

    expect(cloud.rowIds()).toEqual(['backup-2']);
    expect(cloud.objects.has(`users/${USER}/backups/backup-1/manifest.json`)).toBe(false);
    expect(cloud.objects.has(`users/${USER}/assets/hash-1`)).toBe(false);
    // Still named by backup-2's manifest — deleting it would gut a healthy backup.
    expect(cloud.objects.has(`users/${USER}/assets/hash-shared`)).toBe(true);
    expect(cloud.objects.has(`users/${USER}/assets/hash-2`)).toBe(true);
  });

  it('keeps every asset when a surviving manifest cannot be read', async () => {
    const cloud = createFakeClient();
    cloud.dropManifest('backup-2');

    await cloud.transport.deleteBackup('backup-1');

    expect(cloud.rowIds()).toEqual(['backup-2']);
    // Unreadable survivor means unknown references: orphaned bytes beat lost ones.
    expect(cloud.objects.has(`users/${USER}/assets/hash-1`)).toBe(true);
    expect(cloud.objects.has(`users/${USER}/assets/hash-shared`)).toBe(true);
  });

  it('deletes a backup whose own manifest is unreadable', async () => {
    const cloud = createFakeClient();
    cloud.dropManifest('backup-1');

    await expect(cloud.transport.deleteBackup('backup-1')).resolves.toBeUndefined();

    expect(cloud.rowIds()).toEqual(['backup-2']);
    expect(cloud.objects.has(`users/${USER}/assets/hash-1`)).toBe(true);
  });
});
