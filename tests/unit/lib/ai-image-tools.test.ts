import { executeRemoveBackground, getStoryImageBinary } from '@/lib/ai/image-tools';
import { MAX_DECODED_IMAGE_BYTES } from '@/lib/bridge-protocol';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { useAppStore } from '@/stores/use-app-store';

const asset = { id: 'image-1', type: 'image' as const, uri: 'blob:source', name: 'hero.png', addedAt: 1 };

describe('AI image tools', () => {
  beforeEach(() => {
    useAppStore.setState({ mediaLibrary: [asset], imageAssetIdsByStory: { story: [asset.id], other: [] } });
    vi.mocked(resolveAssetUri).mockResolvedValue('blob:resolved');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['abc'], { type: 'image/png' }) })));
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'removed-1') });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:result'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('returns binary only for an image owned by the active story', async () => {
    await expect(getStoryImageBinary('other', asset.id)).resolves.toMatchObject({ ok: false, errorCode: 'VALIDATION_FAILED' });
    const result = await getStoryImageBinary('story', asset.id);
    expect(result).toMatchObject({ ok: true, binaryTool: true, result: { mimeType: 'image/png', base64: 'YWJj' } });
  });

  it('returns a structured size error when an oversized image cannot be downscaled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array(MAX_DECODED_IMAGE_BYTES + 1)], { type: 'image/png' }) })));
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(getStoryImageBinary('story', asset.id)).resolves.toMatchObject({
      ok: false, errorCode: 'VALIDATION_FAILED', details: { reason: 'IMAGE_TOO_LARGE', limitBytes: MAX_DECODED_IMAGE_BYTES },
    });
  });

  it('blocks background removal without loading ISNet', async () => {
    const remove = vi.fn();
    const result = await executeRemoveBackground('story', asset.id, 'blocked', vi.fn(), remove, vi.fn());
    expect(result).toMatchObject({ ok: false, errorCode: 'PERMISSION_DENIED', details: { reason: 'USER_BLOCKED' } });
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not start removal until confirmation and maps decline to a denial', async () => {
    const remove = vi.fn();
    const declined = await executeRemoveBackground('story', asset.id, 'confirm', async () => false, remove, vi.fn());
    expect(declined).toMatchObject({ ok: false, errorCode: 'PERMISSION_DENIED', details: { reason: 'USER_DECLINED' } });
    expect(remove).not.toHaveBeenCalled();

    let decide!: (allowed: boolean) => void;
    const decision = new Promise<boolean>(resolve => { decide = resolve; });
    const acceptedPromise = executeRemoveBackground(
      'story', asset.id, 'confirm', () => decision,
      vi.fn(async () => 'data:image/png;base64,YWJj'), vi.fn(),
    );
    await Promise.resolve();
    decide(true);
    await expect(acceptedPromise).resolves.toMatchObject({ ok: true, result: { requestId: 'removed-1' } });
  });

  it('runs background removal immediately in auto mode and emits a card result', async () => {
    const remove = vi.fn(async () => 'data:image/png;base64,YWJj');
    const onResult = vi.fn();
    await expect(executeRemoveBackground('story', asset.id, 'auto', vi.fn(), remove, onResult)).resolves.toMatchObject({ ok: true });
    expect(remove).toHaveBeenCalledWith('blob:resolved');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'background-removed', blobUrl: 'blob:result' }));
  });
});
