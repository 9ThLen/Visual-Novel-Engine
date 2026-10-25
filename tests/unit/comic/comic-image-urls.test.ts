import { Image, Platform } from 'react-native';

import { acquireComicPicture, comicFrameUrlFor } from '@/components/comic/comic-image-urls';
import { setPackagedDisplayCopyMap } from '@/lib/asset-resolver';
import { resetDisplayCopiesForTests, setDisplayCopyGeneratorForTests } from '@/lib/display-copies';
import { resetImageDecodeSlotsForTests } from '@/lib/image-scaling';

// The URL the comic frame's own document loads a picture from. On Android a
// release build keeps bundled art as drawable resources, and both ways a
// bundled picture reaches the frame — a module number, or the bare name the
// asset resolver hands back — must end up as an android_res URL: left bare,
// the frame reads the name against its own page and draws nothing.

const platform = Platform as { OS: string };
const image = Image as unknown as { resolveAssetSource: (source: number) => { uri: string } | null };

describe('a picture for the comic frame', () => {
  const realOS = platform.OS;
  const realResolve = image.resolveAssetSource;

  afterEach(() => {
    platform.OS = realOS;
    image.resolveAssetSource = realResolve;
  });

  it('is nothing for no picture', () => {
    expect(comicFrameUrlFor(null)).toBeNull();
    expect(comicFrameUrlFor('')).toBeNull();
  });

  describe('on Android', () => {
    beforeEach(() => {
      platform.OS = 'android';
    });

    it('reads a bundled picture the resolver names bare out of the APK', () => {
      expect(comicFrameUrlFor('assets_background_bgancientlibrary'))
        .toBe('file:///android_res/drawable/assets_background_bgancientlibrary.png');
    });

    it('reads a bundled module out of the APK in a release build, and from Metro in a dev build', () => {
      image.resolveAssetSource = () => ({ uri: 'assets_background_bggrandhall' });
      expect(comicFrameUrlFor(42)).toBe('file:///android_res/drawable/assets_background_bggrandhall.png');

      image.resolveAssetSource = () => ({ uri: 'http://10.0.2.2:8081/assets/background/bg-grand-hall.png' });
      expect(comicFrameUrlFor(42)).toBe('http://10.0.2.2:8081/assets/background/bg-grand-hall.png');
    });

    it('keeps a URL that names its scheme', () => {
      expect(comicFrameUrlFor('file:///data/user/0/app/files/media/cover.png')).toBe('file:///data/user/0/app/files/media/cover.png');
      expect(comicFrameUrlFor('https://example.com/art.png')).toBe('https://example.com/art.png');
    });
  });

  it('makes a path absolute on the web, and keeps blob: and data: as they are', () => {
    expect(comicFrameUrlFor('/assets/bg.png')).toBe(new URL('/assets/bg.png', window.location.href).href);
    expect(comicFrameUrlFor('blob:http://localhost/123')).toBe('blob:http://localhost/123');
  });
});

// And not the original when it is much larger than the frame draws it: on the
// web the host gives the frame a copy it made; a native release, the copy it
// was staged with. Where there is none, the original, as before.
describe('the picture the comic frame is given', () => {
  const realOS = platform.OS;
  const realResolve = image.resolveAssetSource;
  const realFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDisplayCopiesForTests();
    resetImageDecodeSlotsForTests();
    setPackagedDisplayCopyMap(null);
    fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['original']) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    let counter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:copy-${(counter += 1)}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    platform.OS = realOS;
    image.resolveAssetSource = realResolve;
    globalThis.fetch = realFetch;
    setPackagedDisplayCopyMap(null);
    resetDisplayCopiesForTests();
  });

  it('is a copy the host made at the size the panel draws it, on the web', async () => {
    const sizes: unknown[] = [];
    setDisplayCopyGeneratorForTests(async (_blob, sizeFor) => {
      sizes.push(sizeFor(2508, 1672));
      return new Blob(['small']);
    });

    const picture = await acquireComicPicture('blob:http://localhost/hall', ['background']);
    expect(picture.url).toBe('blob:copy-1');
    expect(fetchMock).toHaveBeenCalledWith('blob:http://localhost/hall');
    expect(sizes).toEqual([{ width: 1600, height: 1067 }]);
    picture.release();
  });

  it('is sized for a sprite by its height', async () => {
    const sizes: unknown[] = [];
    setDisplayCopyGeneratorForTests(async (_blob, sizeFor) => {
      sizes.push(sizeFor(1024, 1536));
      return new Blob(['small']);
    });
    await acquireComicPicture('/assets/oracle.png', ['sprite']);
    expect(sizes).toEqual([{ width: 800, height: 1200 }]);
  });

  it('is the original on the web when no copy is wanted or can be had', async () => {
    setDisplayCopyGeneratorForTests(async () => null);
    const small = await acquireComicPicture('/assets/small.png', ['sprite']);
    expect(small.url).toBe(new URL('/assets/small.png', window.location.href).href);
  });

  it('is the copy a native release was staged with, read out of the APK', async () => {
    platform.OS = 'android';
    setPackagedDisplayCopyMap({ 'idb-media://hall': 'assets_displaymedia_abc' });

    const picture = await acquireComicPicture('idb-media://hall', ['background']);
    expect(picture.url).toBe('file:///android_res/drawable/assets_displaymedia_abc.png');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is the original on Android when the release carries no copy of it', async () => {
    platform.OS = 'android';
    setPackagedDisplayCopyMap({ 'idb-media://other': 'assets_displaymedia_other' });

    const picture = await acquireComicPicture('assets_media_def', ['background']);
    expect(picture.url).toBe('file:///android_res/drawable/assets_media_def.png');
    // A phone makes no copies of its own.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
