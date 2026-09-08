/**
 * The still that stands in for a clip in the grid.
 *
 * jsdom decodes no video, so the frame grab is substituted wholesale — the
 * same seam `thumbnails` uses. What is tested here is everything around it:
 * that one clip is decoded once, that a refusal is remembered, and that no
 * failure reaches the tile as anything but "show the glyph".
 */
import {
  getVideoPosterSource,
  posterDimensions,
  resetVideoPostersForTests,
  setPosterGrabberForTests,
} from '@/lib/video-poster';

/**
 * What a grab hands back: the web makes an object URL of its canvas frame, a
 * phone hands over a native image reference. The cache only has to keep
 * whatever it was given, so a string stands in for both here.
 */
const frame = (name = 'blob:poster') => name;

// jsdom implements no object URLs at all, so they are installed rather than
// spied on; the identity of each is what the tests read.
const originalCreate = globalThis.URL.createObjectURL;
const originalRevoke = globalThis.URL.revokeObjectURL;

beforeEach(() => {
  resetVideoPostersForTests();
  let created = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:poster-${(created += 1)}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  setPosterGrabberForTests();
  resetVideoPostersForTests();
  globalThis.URL.createObjectURL = originalCreate;
  globalThis.URL.revokeObjectURL = originalRevoke;
});

describe('poster dimensions', () => {
  it('fits inside the square without upscaling', () => {
    expect(posterDimensions(1920, 1080, 320)).toEqual({ width: 320, height: 180 });
    expect(posterDimensions(1080, 1920, 320)).toEqual({ width: 180, height: 320 });
    // Already smaller: a copy would only cost memory.
    expect(posterDimensions(160, 90, 320)).toEqual({ width: 160, height: 90 });
  });

  it('has an answer for a clip that reports no size', () => {
    expect(posterDimensions(0, 0)).toEqual({ width: 0, height: 0 });
    expect(posterDimensions(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('poster cache', () => {
  it('decodes a clip once, however many tiles ask', async () => {
    const grab = vi.fn(async () => frame('blob:poster-1'));
    setPosterGrabberForTests(grab);

    const first = await getVideoPosterSource('blob:clip');
    const second = await getVideoPosterSource('blob:clip');

    expect(first).toBe('blob:poster-1');
    expect(second).toBe('blob:poster-1');
    expect(grab).toHaveBeenCalledTimes(1);
  });

  it('shares one decode between callers that ask at the same time', async () => {
    const grab = vi.fn(async () => frame());
    setPosterGrabberForTests(grab);

    const [first, second] = await Promise.all([
      getVideoPosterSource('blob:clip'),
      getVideoPosterSource('blob:clip'),
    ]);

    expect(first).toBe(second);
    expect(grab).toHaveBeenCalledTimes(1);
  });

  // A clip that will not give up a frame will not give one up on the next
  // scroll past it either, and asking again means decoding again.
  it('remembers a refusal instead of retrying it', async () => {
    const grab = vi.fn(async () => null);
    setPosterGrabberForTests(grab);

    expect(await getVideoPosterSource('blob:silent')).toBeNull();
    expect(await getVideoPosterSource('blob:silent')).toBeNull();
    expect(grab).toHaveBeenCalledTimes(1);
  });

  it('turns a thrown decode into no poster rather than a broken tile', async () => {
    // The module says so in development on purpose; the test only needs the
    // answer, not the notice.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setPosterGrabberForTests(async () => { throw new Error('tainted canvas'); });

    await expect(getVideoPosterSource('blob:cross-origin')).resolves.toBeNull();
    warn.mockRestore();
  });

  it('says no to nothing at all', async () => {
    const grab = vi.fn(async () => frame());
    setPosterGrabberForTests(grab);

    expect(await getVideoPosterSource('')).toBeNull();
    expect(grab).not.toHaveBeenCalled();
  });
});
