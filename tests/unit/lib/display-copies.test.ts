/**
 * Display copies for the comic frame, made by the host on the web and the
 * desktop.
 *
 * jsdom has no canvas, so the drawing is substituted; what is tested is around
 * it: one original is decoded once per size, a copy the frame was given stays
 * loadable for as long as it is held, a picture that needs no copy is not
 * decoded again, and every failure leaves the caller with the original.
 */
import {
  acquireDisplayCopy,
  resetDisplayCopiesForTests,
  setDisplayCopyGeneratorForTests,
} from '@/lib/display-copies';
import { resetImageDecodeSlotsForTests } from '@/lib/image-scaling';

const originalFetch = globalThis.fetch;

/** `ok` and `blob()` are all the module reads (see thumbnails.test.ts for why not a real Response). */
function fakeResponse({ ok = true }: { ok?: boolean } = {}): Response {
  return { ok, blob: async () => new Blob(['original']) } as unknown as Response;
}

function stubFetch(impl?: () => Promise<Response>) {
  const fetchMock = vi.fn(impl ?? (async () => fakeResponse()));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const half = (width: number, height: number) => ({ width: width / 2, height: height / 2 });

beforeEach(() => {
  resetDisplayCopiesForTests();
  resetImageDecodeSlotsForTests();
  let counter = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:copy-${(counter += 1)}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  resetDisplayCopiesForTests();
  globalThis.fetch = originalFetch;
});

describe('a display copy of a picture', () => {
  it('is made once, and handed to everyone who asks for that size', async () => {
    const fetchMock = stubFetch();
    const generator = vi.fn(async () => new Blob(['small']));
    setDisplayCopyGeneratorForTests(generator);

    const [first, second] = await Promise.all([
      acquireDisplayCopy('blob:hall', 'background', half),
      acquireDisplayCopy('blob:hall', 'background', half),
    ]);
    const third = await acquireDisplayCopy('blob:hall', 'background', half);

    expect(first.uri).toBe('blob:copy-1');
    expect(second.uri).toBe('blob:copy-1');
    expect(third.uri).toBe('blob:copy-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it('is made again for another size of the same picture', async () => {
    stubFetch();
    setDisplayCopyGeneratorForTests(async () => new Blob(['small']));

    const background = await acquireDisplayCopy('blob:hall', 'background', half);
    const sprite = await acquireDisplayCopy('blob:hall', 'sprite', half);
    expect(background.uri).toBe('blob:copy-1');
    expect(sprite.uri).toBe('blob:copy-2');
  });

  it('is drawn at the size the rule gives the original', async () => {
    stubFetch();
    const sizes: unknown[] = [];
    setDisplayCopyGeneratorForTests(async (_blob, sizeFor) => {
      sizes.push(sizeFor(2508, 1672));
      return new Blob(['small']);
    });
    await acquireDisplayCopy('blob:hall', 'background', half);
    expect(sizes).toEqual([{ width: 1254, height: 836 }]);
  });

  it('is none for a picture that needs no copy, and that picture is not decoded again', async () => {
    const fetchMock = stubFetch();
    setDisplayCopyGeneratorForTests(async () => null);

    expect((await acquireDisplayCopy('blob:small', 'sprite', half)).uri).toBeNull();
    expect((await acquireDisplayCopy('blob:small', 'sprite', half)).uri).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is none when the original cannot be read back, and is tried again later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // A page opened from file:// cannot fetch its own pictures.
      const fetchMock = stubFetch(async () => { throw new TypeError('Failed to fetch'); });
      setDisplayCopyGeneratorForTests(async () => new Blob(['small']));

      expect((await acquireDisplayCopy('file:///story/media/hall.png', 'background', half)).uri).toBeNull();
      expect((await acquireDisplayCopy('file:///story/media/hall.png', 'background', half)).uri).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 31_000);
      stubFetch();
      expect((await acquireDisplayCopy('file:///story/media/hall.png', 'background', half)).uri).toBe('blob:copy-1');
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is none when the original is not there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(async () => fakeResponse({ ok: false }));
    setDisplayCopyGeneratorForTests(async () => new Blob(['small']));
    expect((await acquireDisplayCopy('blob:gone', 'background', half)).uri).toBeNull();
    warn.mockRestore();
  });

  it('stays loadable while held, however many others come after it', async () => {
    stubFetch();
    setDisplayCopyGeneratorForTests(async () => new Blob(['small']));

    const held = await acquireDisplayCopy('blob:picture-0', 'background', half);
    for (let index = 1; index <= 80; index += 1) {
      (await acquireDisplayCopy(`blob:picture-${index}`, 'background', half)).release();
    }

    const revoked = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => url);
    expect(revoked).not.toContain(held.uri);
    // Of the 80 let go, all but the 64 most recent are revoked.
    expect(revoked).toHaveLength(80 - 64);
    expect(revoked[0]).toBe('blob:copy-2');

    held.release();
    held.release();
    const again = await acquireDisplayCopy('blob:picture-0', 'background', half);
    expect(again.uri).toBe(held.uri);
  });
});
