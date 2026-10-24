import { Image, Platform } from 'react-native';

import { comicFrameUrlFor } from '@/components/comic/comic-image-urls';

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
