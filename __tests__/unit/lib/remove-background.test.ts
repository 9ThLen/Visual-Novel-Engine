import {
  isBackgroundRemovalSupported,
  removeImageBackground,
  setBackgroundRemovalModuleLoaderForTests,
} from '@/lib/remove-background.web';

type RemoveBackgroundFn = (typeof import('@imgly/background-removal'))['removeBackground'];

const removeBackgroundMock = vi.fn();

function stubModule() {
  setBackgroundRemovalModuleLoaderForTests(() =>
    Promise.resolve({ removeBackground: removeBackgroundMock as unknown as RemoveBackgroundFn } as typeof import('@imgly/background-removal')),
  );
}

describe('remove-background (web)', () => {
  beforeEach(() => {
    removeBackgroundMock.mockReset();
    stubModule();
  });

  it('reports supported only when Workers exist (jsdom has none)', () => {
    expect(isBackgroundRemovalSupported()).toBe(false);

    vi.stubGlobal('Worker', class {});
    try {
      expect(isBackgroundRemovalSupported()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns the model output as a PNG data: URI', async () => {
    removeBackgroundMock.mockResolvedValue(new Blob(['fake-png'], { type: 'image/png' }));

    const result = await removeImageBackground('data:image/jpeg;base64,AAAA');

    expect(removeBackgroundMock).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAAA',
      expect.objectContaining({ output: { format: 'image/png' }, proxyToWorker: false }),
    );
    expect(result.startsWith('data:')).toBe(true);
    expect(atob(result.split(',')[1])).toBe('fake-png');
  });

  it('forwards the progress callback to the model config', async () => {
    const onProgress = vi.fn();
    removeBackgroundMock.mockImplementation(async (_src: string, config: { progress?: (k: string, c: number, t: number) => void }) => {
      config.progress?.('fetch:model', 1, 2);
      return new Blob(['x'], { type: 'image/png' });
    });

    await removeImageBackground('data:image/png;base64,AAAA', onProgress);

    expect(onProgress).toHaveBeenCalledWith('fetch:model', 1, 2);
  });

  it('propagates inference failures to the caller', async () => {
    removeBackgroundMock.mockRejectedValue(new Error('model exploded'));

    await expect(removeImageBackground('data:image/png;base64,AAAA')).rejects.toThrow('model exploded');
  });

  it('retries loading the module after a failed load', async () => {
    let attempts = 0;
    setBackgroundRemovalModuleLoaderForTests(() => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('offline'));
      return Promise.resolve({ removeBackground: removeBackgroundMock as unknown as RemoveBackgroundFn } as typeof import('@imgly/background-removal'));
    });
    removeBackgroundMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));

    await expect(removeImageBackground('data:image/png;base64,AAAA')).rejects.toThrow('offline');
    await expect(removeImageBackground('data:image/png;base64,AAAA')).resolves.toContain('data:');
    expect(attempts).toBe(2);
  });
});

describe('remove-background (native stub)', () => {
  it('reports unsupported and rejects removal', async () => {
    const stub = await import('@/lib/remove-background');
    expect(stub.isBackgroundRemovalSupported()).toBe(false);
    await expect(stub.removeImageBackground('data:image/png;base64,AAAA')).rejects.toThrow(/only available on web/);
  });
});
