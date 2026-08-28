/**
 * Thumbnails for the media grid.
 *
 * The arithmetic is tested directly; the drawing is not, because jsdom has no
 * canvas. What matters around the drawing is that one source is decoded once,
 * that a source which cannot produce a thumbnail is not retried forever, and
 * that every failure returns null so the caller falls back to the original.
 */
import {
  getThumbnailUri,
  resetThumbnailsForTests,
  setThumbnailGeneratorForTests,
  thumbnailDimensions,
  THUMBNAIL_MAX_SIDE,
} from '@/lib/thumbnails';

const originalFetch = globalThis.fetch;

/**
 * A real `Response` is the wrong stub here: Node 20 refuses to build one out of
 * jsdom's Blob (`object.stream is not a function`) while Node 22+ accepts it,
 * and `getThumbnailUri` turns every throw into null — so the same suite passed
 * locally and failed on CI for a reason no assertion could show. The module
 * reads `ok` and `blob()` and nothing else, so that is all a stub owes it.
 */
function fakeResponse({ ok = true }: { ok?: boolean } = {}): Response {
  return { ok, blob: async () => new Blob(['x']) } as unknown as Response;
}

function stubFetch(impl?: () => Promise<Response>) {
  const fetchMock = vi.fn(impl ?? (async () => fakeResponse()));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  resetThumbnailsForTests();
  let counter = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:thumb-${(counter += 1)}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  resetThumbnailsForTests();
  globalThis.fetch = originalFetch;
});

describe('thumbnailDimensions', () => {
  it('fits the long side and keeps the aspect ratio', () => {
    expect(thumbnailDimensions(4000, 2250, 320)).toEqual({ width: 320, height: 180 });
    expect(thumbnailDimensions(1000, 2000, 320)).toEqual({ width: 160, height: 320 });
  });

  it('never upscales', () => {
    expect(thumbnailDimensions(120, 80, 320)).toEqual({ width: 120, height: 80 });
  });

  it('keeps a sliver of an extreme ratio visible', () => {
    expect(thumbnailDimensions(8000, 10, 320)).toEqual({ width: 320, height: 1 });
  });

  it('answers zero for a source with no dimensions', () => {
    expect(thumbnailDimensions(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it('defaults to the grid’s long side', () => {
    expect(thumbnailDimensions(1000, 1000)).toEqual({
      width: THUMBNAIL_MAX_SIDE,
      height: THUMBNAIL_MAX_SIDE,
    });
  });
});

describe('getThumbnailUri', () => {
  it('produces one object URL per source', async () => {
    stubFetch();
    setThumbnailGeneratorForTests(async () => new Blob(['small']));

    await expect(getThumbnailUri('file://a.png')).resolves.toBe('blob:thumb-1');
    await expect(getThumbnailUri('file://b.png')).resolves.toBe('blob:thumb-2');
  });

  // The whole point is to decode a file once. A grid mounts, unmounts and
  // remounts tiles constantly as it scrolls.
  it('decodes a source once and serves the rest from cache', async () => {
    const fetchMock = stubFetch();
    const generator = vi.fn(async () => new Blob(['small']));
    setThumbnailGeneratorForTests(generator);

    await getThumbnailUri('file://a.png');
    await getThumbnailUri('file://a.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it('shares one decode between callers that ask at the same time', async () => {
    const fetchMock = stubFetch();
    setThumbnailGeneratorForTests(async () => new Blob(['small']));

    const [first, second] = await Promise.all([
      getThumbnailUri('file://a.png'),
      getThumbnailUri('file://a.png'),
    ]);

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Null is the caller's signal to show the original, so every way of failing
  // has to arrive there rather than throwing into a render.
  it('returns null when the source cannot be fetched', async () => {
    stubFetch(async () => { throw new Error('offline'); });
    setThumbnailGeneratorForTests(async () => new Blob(['small']));

    await expect(getThumbnailUri('file://a.png')).resolves.toBeNull();
  });

  it('returns null for a response the fetch rejected', async () => {
    stubFetch(async () => fakeResponse({ ok: false }));
    setThumbnailGeneratorForTests(async () => new Blob(['small']));

    await expect(getThumbnailUri('file://a.png')).resolves.toBeNull();
  });

  it('returns null when there is nothing to gain, as for an already small image', async () => {
    stubFetch();
    setThumbnailGeneratorForTests(async () => null);

    await expect(getThumbnailUri('file://small.png')).resolves.toBeNull();
  });

  // A source that refused once refuses for the same reason next time, and
  // asking again means decoding a large file again.
  it('does not retry a source that could not be thumbnailed', async () => {
    const fetchMock = stubFetch();
    setThumbnailGeneratorForTests(async () => null);

    await getThumbnailUri('file://small.png');
    await getThumbnailUri('file://small.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an empty source', async () => {
    const fetchMock = stubFetch();
    await expect(getThumbnailUri('')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Without a canvas there is no thumbnail to make, which is the case on every
  // platform but web — and the caller must be no worse off than before.
  it('returns null where no canvas exists', async () => {
    stubFetch();
    await expect(getThumbnailUri('file://a.png')).resolves.toBeNull();
  });
});
