import { binaryFromBytes } from '@/lib/backup-binary';
import {
  BACKUP_SCHEMA_VERSION,
  BackupService,
  validateBackupManifest,
  type BackupData,
  type BackupManifest,
  type BackupTransport,
  type LocalRepository,
} from '@/lib/backup-service';

const HASH = 'a'.repeat(64);
const EMPTY_DATA: BackupData = {
  stories: [],
  scenes: {},
  libraries: {
    characters: {},
    audio: {},
    imageAssetIdsByStory: {},
    media: [{ id: 'asset-1', type: 'image', uri: 'idb://media/local-key', name: 'asset.png', addedAt: 1 }],
  },
};

function setup(assetAlreadyUploaded = false) {
  const binary = binaryFromBytes(new Uint8Array([1, 2, 3, 4, 5]), 'image/png');
  const repository: LocalRepository = {
    captureBackupData: vi.fn().mockResolvedValue(EMPTY_DATA),
    listBackupAssets: vi.fn().mockResolvedValue([
      { assetId: 'asset-1', storageKey: 'local-key', mimeType: 'image/png', size: binary.size },
    ]),
    getAssetBinary: vi.fn().mockResolvedValue(binary),
    stageBackupAsset: vi.fn(async (_backupId, asset) => ({ ...asset, stagedUri: 'staged://asset' })),
    activateBackup: vi.fn().mockResolvedValue(undefined),
    discardStagedBackup: vi.fn().mockResolvedValue(undefined),
  };
  const order: string[] = [];
  const transport: BackupTransport = {
    hasAsset: vi.fn().mockResolvedValue(assetAlreadyUploaded),
    uploadAsset: vi.fn(async () => { order.push('asset'); }),
    uploadManifest: vi.fn(async () => { order.push('manifest'); }),
    markComplete: vi.fn(async () => { order.push('complete'); }),
    downloadManifest: vi.fn(),
    downloadAsset: vi.fn().mockResolvedValue(binary),
  };
  const sha256 = vi.fn().mockResolvedValue(HASH);
  const service = new BackupService({
    repository,
    transport,
    sha256,
    appVersion: '1.0.0',
    now: () => new Date('2026-07-14T10:00:00.000Z'),
    createBackupId: () => 'backup-1',
  });
  return { service, repository, transport, order, sha256 };
}

describe('BackupService', () => {
  it('uploads assets before the immutable manifest and completion marker', async () => {
    const { service, order } = setup();
    const manifest = await service.createBackup();

    expect(order).toEqual(['asset', 'manifest', 'complete']);
    expect(manifest).toMatchObject({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      backupId: 'backup-1',
      appVersion: '1.0.0',
      assets: [{ assetId: 'asset-1', sha256: HASH }],
    });
  });

  it('deduplicates cloud assets by sha256', async () => {
    const { service, transport, order } = setup(true);
    await service.createBackup();
    expect(transport.uploadAsset).not.toHaveBeenCalled();
    expect(order).toEqual(['manifest', 'complete']);
  });

  it('does not publish a manifest when an asset changes during capture', async () => {
    const { service, repository, transport } = setup();
    vi.mocked(repository.getAssetBinary).mockResolvedValue(
      binaryFromBytes(new Uint8Array([1, 2]), 'image/png'),
    );
    await expect(service.createBackup()).rejects.toThrow('Backup asset size changed');
    expect(transport.uploadManifest).not.toHaveBeenCalled();
  });

  it('validates every asset before activating a restore', async () => {
    const { service, repository, transport } = setup();
    const manifest = await service.createBackup();
    vi.mocked(transport.downloadManifest).mockResolvedValue(manifest);

    await expect(service.restoreBackup(manifest.backupId)).resolves.toEqual(manifest);
    expect(repository.stageBackupAsset).toHaveBeenCalledOnce();
    expect(repository.activateBackup).toHaveBeenCalledWith(
      manifest,
      [expect.objectContaining({ assetId: 'asset-1', stagedUri: 'staged://asset' })],
    );
  });

  it('discards staging and leaves live data untouched on a hash mismatch', async () => {
    const { service, repository, transport, sha256 } = setup();
    const manifest = await service.createBackup();
    vi.mocked(transport.downloadManifest).mockResolvedValue(manifest);
    sha256.mockResolvedValue('b'.repeat(64));

    await expect(service.restoreBackup(manifest.backupId)).rejects.toThrow();
    expect(repository.activateBackup).not.toHaveBeenCalled();
    expect(repository.discardStagedBackup).toHaveBeenCalledWith(manifest.backupId, []);
  });

  it('refuses to publish a backup whose scenes were never captured', async () => {
    const { service, repository, transport } = setup();
    vi.mocked(repository.captureBackupData).mockResolvedValue({
      ...EMPTY_DATA,
      stories: [{ id: 'story-1', title: 'Story' } as BackupData['stories'][number]],
      scenes: {},
    });

    await expect(service.createBackup()).rejects.toThrow(
      'Backup is missing scenes for story: story-1',
    );
    expect(transport.uploadManifest).not.toHaveBeenCalled();
  });
});

describe('validateBackupManifest', () => {
  const base: BackupManifest = {
    ...EMPTY_DATA,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId: 'backup-1',
    createdAt: '2026-07-14T10:00:00.000Z',
    appVersion: '1.0.0',
    assets: [{ assetId: 'asset-1', storageKey: 'local-key', sha256: HASH, mimeType: 'image/png', size: 5 }],
  };

  it('rejects unknown schema versions', () => {
    expect(() => validateBackupManifest({ schemaVersion: 99 })).toThrow(
      'Unsupported backup schema version',
    );
  });

  it('rejects local media that carries no bytes', () => {
    expect(() => validateBackupManifest({ ...base, assets: [] })).toThrow(
      'Backup is missing bytes for media: asset-1',
    );
  });

  it('accepts bundled media without bytes', () => {
    expect(() => validateBackupManifest({
      ...base,
      assets: [],
      libraries: {
        ...base.libraries,
        media: [{ id: 'bundled', type: 'image', uri: 'assets/bg.png', name: 'bg.png', addedAt: 1 }],
      },
    })).not.toThrow();
  });

  it('requires bytes for remote media', () => {
    expect(() => validateBackupManifest({
      ...base,
      assets: [],
      libraries: {
        ...base.libraries,
        media: [{ id: 'remote', type: 'image', uri: 'https://example.com/bg.png', name: 'bg.png', addedAt: 1 }],
      },
    })).toThrow('Backup is missing bytes for media: remote');
  });

  it('rejects a story with no scenes entry', () => {
    expect(() => validateBackupManifest({
      ...base,
      stories: [{ id: 'story-1', title: 'Story' } as BackupManifest['stories'][number]],
    })).toThrow('Backup is missing scenes for story: story-1');
  });

  it('rejects duplicate stories and scenes for unknown stories', () => {
    const story = { id: 'story-1', title: 'Story' } as BackupManifest['stories'][number];
    expect(() => validateBackupManifest({
      ...base,
      stories: [story, story],
      scenes: { 'story-1': {} },
    })).toThrow('Duplicate backup story: story-1');
    expect(() => validateBackupManifest({
      ...base,
      stories: [story],
      scenes: { 'story-1': {}, orphan: {} },
    })).toThrow('Backup scenes reference unknown story: orphan');
  });

  it('rejects scene records whose IDs do not match their manifest keys', () => {
    const story = { id: 'story-1', title: 'Story' } as BackupManifest['stories'][number];
    expect(() => validateBackupManifest({
      ...base,
      stories: [story],
      scenes: {
        'story-1': {
          'scene-1': { id: 'different-scene', storyId: 'story-1' },
        },
      },
    })).toThrow('Invalid backup scene: story-1/scene-1');
  });
});
