/**
 * Reporting whether the browser will keep the stories.
 *
 * Web storage is best-effort by default: an origin can be evicted whole under
 * disk pressure. The app cannot make the promise itself, so what it owes the
 * author is an honest answer — including "the browser said no".
 */
import {
  formatBytes,
  readStorageDurability,
  requestStorageDurability,
} from '@/lib/storage-durability';

const realStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

function withStorageManager(manager: unknown) {
  Object.defineProperty(navigator, 'storage', { value: manager, configurable: true });
}

afterEach(() => {
  if (realStorage) Object.defineProperty(navigator, 'storage', realStorage);
  else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'storage');
});

describe('reading durability', () => {
  it('reports a browser that has promised not to evict', async () => {
    withStorageManager({
      persisted: async () => true,
      estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
    });

    await expect(readStorageDurability()).resolves.toEqual({
      kind: 'persisted',
      used: 5 * 1024 * 1024,
      quota: 100 * 1024 * 1024,
    });
  });

  it('reports best effort otherwise', async () => {
    withStorageManager({ persisted: async () => false, estimate: async () => ({ usage: 1024 }) });

    await expect(readStorageDurability()).resolves.toEqual({ kind: 'best-effort', used: 1024 });
  });

  it('calls a browser without the API unsupported rather than guessing', async () => {
    withStorageManager({});

    await expect(readStorageDurability()).resolves.toEqual({ kind: 'unsupported' });
  });

  // An estimate is a nicety. Failing to read one says nothing about whether the
  // origin can be evicted, so it must not turn into "unsupported".
  it('still answers when the estimate cannot be read', async () => {
    withStorageManager({
      persisted: async () => true,
      estimate: async () => { throw new Error('denied'); },
    });

    await expect(readStorageDurability()).resolves.toEqual({ kind: 'persisted' });
  });

  it('treats a failed check as evictable, which is the safe reading', async () => {
    withStorageManager({
      persisted: async () => { throw new Error('denied'); },
      estimate: async () => ({ usage: 10 }),
    });

    await expect(readStorageDurability()).resolves.toEqual({ kind: 'best-effort', used: 10 });
  });
});

describe('requesting durability', () => {
  it('reports what the browser granted, not what was asked', async () => {
    const persist = vi.fn(async () => false);
    withStorageManager({ persist, persisted: async () => false, estimate: async () => ({}) });

    await expect(requestStorageDurability()).resolves.toEqual({ kind: 'best-effort' });
    expect(persist).toHaveBeenCalled();
  });

  it('reports the grant when the browser agrees', async () => {
    let granted = false;
    withStorageManager({
      persist: async () => { granted = true; return true; },
      persisted: async () => granted,
      estimate: async () => ({}),
    });

    await expect(requestStorageDurability()).resolves.toEqual({ kind: 'persisted' });
  });

  // A refusal arrives as a rejection in some browsers. It is an answer, not a
  // crash, and the state read afterwards is what the author is shown.
  it('survives a browser that rejects the request outright', async () => {
    withStorageManager({
      persist: async () => { throw new Error('denied'); },
      persisted: async () => false,
      estimate: async () => ({}),
    });

    await expect(requestStorageDurability()).resolves.toEqual({ kind: 'best-effort' });
  });

  it('falls back to reading when the browser cannot be asked', async () => {
    withStorageManager({ persisted: async () => false, estimate: async () => ({}) });

    await expect(requestStorageDurability()).resolves.toEqual({ kind: 'best-effort' });
  });
});

describe('formatting sizes', () => {
  it('uses whole units an author can read', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  // Anything stored at all should read as stored, not as nothing.
  it('never rounds a real file down to nothing', () => {
    expect(formatBytes(300)).toBe('1 KB');
  });
});
