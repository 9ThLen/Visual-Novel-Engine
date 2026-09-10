import { createPersistentStorage } from '@/lib/persistent-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

describe('persistent web storage fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the async StorageLike contract when IndexedDB is unavailable', async () => {
    const storage = createPersistentStorage();

    await storage.setItem('vne_test', 'value');

    await expect(storage.getItem('vne_test')).resolves.toBe('value');
    await storage.removeItem('vne_test');
    await expect(storage.getItem('vne_test')).resolves.toBeNull();
  });

  it('backs up an invalid app-state envelope before removing it', async () => {
    localStorage.setItem(STORAGE_KEYS.APP_STATE, '{invalid');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createPersistentStorage();

    await expect(storage.getItem(STORAGE_KEYS.APP_STATE)).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.APP_STATE)).toBeNull();
    const backupKey = Object.keys(localStorage).find((key) =>
      key.startsWith(`${STORAGE_KEYS.APP_STATE}__corrupt_backup_`),
    );
    expect(backupKey).toBeTruthy();
    expect(localStorage.getItem(backupKey!)).toBe('{invalid');
    warnSpy.mockRestore();
  });
});
