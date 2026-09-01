import type { StorageLike } from '@/lib/persistent-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  clearBuildSession,
  loadBuildHelperSettings,
  loadBuildSession,
  normalizeBuildHelperEndpoint,
  saveBuildHelperSettings,
  saveBuildSession,
} from '@/lib/release/build-session';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const request = {
  requestId: 'build_abc_apk',
  releaseId: 'release_one',
  target: 'apk' as const,
  versionCode: 1_002_003,
  payloadHash: 'a'.repeat(64),
};

describe('build helper session persistence', () => {
  it('accepts only credential-free loopback endpoints', () => {
    expect(normalizeBuildHelperEndpoint('http://localhost:8790/')).toBe('http://localhost:8790');
    expect(normalizeBuildHelperEndpoint('http://[::1]:8790')).toBe('http://[::1]:8790');
    expect(() => normalizeBuildHelperEndpoint('https://builder.example')).toThrow('loopback');
    expect(() => normalizeBuildHelperEndpoint('http://name:secret@127.0.0.1:8790')).toThrow('credentials');
  });

  it('normalizes settings and restores a valid job after a reload', async () => {
    const storage = memoryStorage();
    await expect(saveBuildHelperSettings({
      endpoint: 'http://127.0.0.1:8790/path',
      token: '  paired  ',
    }, storage)).resolves.toEqual({ endpoint: 'http://127.0.0.1:8790', token: 'paired' });
    await expect(loadBuildHelperSettings(storage)).resolves.toEqual({
      endpoint: 'http://127.0.0.1:8790',
      token: 'paired',
    });

    await saveBuildSession('story', { request }, storage);
    await expect(loadBuildSession('story', storage)).resolves.toEqual({
      request,
    });
    await clearBuildSession('story', storage);
    await expect(loadBuildSession('story', storage)).resolves.toBeNull();
  });

  it('drops corrupt persisted requests instead of reconnecting to them', async () => {
    const storage = memoryStorage();
    await storage.setItem(STORAGE_KEYS.BUILD_SESSION('story'), JSON.stringify({
      request: { ...request, requestId: '../other-job' },
    }));
    await expect(loadBuildSession('story', storage)).resolves.toBeNull();
  });
});
