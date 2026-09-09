import { act, renderHook, waitFor } from '@testing-library/react';
import { useSceneImages, type SceneImageState } from '@/hooks/useSceneImages';
import { resolveAssetUri } from '@/lib/asset-resolver';

describe('scene background loading', () => {
  afterEach(() => vi.mocked(resolveAssetUri).mockReset());

  it('clears the previous background while loading and after a failure', async () => {
    vi.mocked(resolveAssetUri).mockResolvedValueOnce('first.png');
    const scene: SceneImageState = { id: 'first', backgroundImageUri: 'first.png', characters: [] };
    const { result, rerender } = renderHook(({ value }) => useSceneImages(value), { initialProps: { value: scene } });
    await waitFor(() => expect(result.current.bgSource).toEqual({ uri: 'first.png' }));
    let reject!: (error: Error) => void;
    vi.mocked(resolveAssetUri).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    rerender({ value: { ...scene, id: 'second', backgroundImageUri: 'missing.png' } });
    expect(result.current.bgSource).toBeNull();
    await act(async () => reject(new Error('Missing asset')));
    expect(result.current.bgSource).toBeNull();
  });

  it('ignores a late background from the previous scene', async () => {
    let resolve!: (uri: string) => void;
    vi.mocked(resolveAssetUri).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const scene: SceneImageState = { id: 'first', backgroundImageUri: 'first.png', characters: [] };
    const { result, rerender } = renderHook(({ value }) => useSceneImages(value), { initialProps: { value: scene } });
    vi.mocked(resolveAssetUri).mockResolvedValueOnce('second.png');
    rerender({ value: { ...scene, id: 'second', backgroundImageUri: 'second.png' } });
    await waitFor(() => expect(result.current.bgSource).toEqual({ uri: 'second.png' }));
    await act(async () => resolve('first.png'));
    expect(result.current.bgSource).toEqual({ uri: 'second.png' });
  });
});
