import {
  COMIC_BACKGROUND_BOX,
  COMIC_SPRITE_MAX_HEIGHT,
  comicDisplaySize,
} from '@/lib/comic/comic-picture-size';

// How large a copy of a picture the comic frame is given. The frame's WebView
// decodes whatever it gets at full size, so the copy is as large as a panel
// draws the picture and no larger — and none is made when the original is
// already about that size.

describe('the size of a picture the comic frame is given', () => {
  it('makes a demo background just large enough to cover the panel', () => {
    // 2508×1672 is 3:2, a panel 16:10: the width decides.
    expect(comicDisplaySize('background', 2508, 1672)).toEqual({ width: 1600, height: 1067 });
  });

  it('covers by the height when a background is wider than the panel', () => {
    expect(comicDisplaySize('background', 4000, 1500)).toEqual({ width: 2667, height: 1000 });
  });

  it('covers by the width when a background stands upright', () => {
    expect(comicDisplaySize('background', 2000, 3000)).toEqual({ width: 1600, height: 2400 });
  });

  it('makes a sprite no taller than its limit, whatever its width', () => {
    expect(comicDisplaySize('sprite', 1024, 1536)).toEqual({ width: 800, height: COMIC_SPRITE_MAX_HEIGHT });
    expect(comicDisplaySize('sprite', 3000, 2000)).toEqual({ width: 1800, height: COMIC_SPRITE_MAX_HEIGHT });
  });

  it('makes no copy of a picture already that small', () => {
    expect(comicDisplaySize('background', COMIC_BACKGROUND_BOX.width, COMIC_BACKGROUND_BOX.height)).toBeNull();
    expect(comicDisplaySize('background', 1254, 1254)).toBeNull();
    expect(comicDisplaySize('sprite', 529, 896)).toBeNull();
  });

  it('makes no copy that would hardly be smaller', () => {
    // A sprite 1300 tall would shrink to 0.92 of its size: a decode and a lossy encode for 15 % of its pixels.
    expect(comicDisplaySize('sprite', 866, 1300)).toBeNull();
    expect(comicDisplaySize('sprite', 1000, 1400)).toEqual({ width: 857, height: 1200 });
  });

  it('makes a picture drawn both ways for the way that needs it larger', () => {
    // As a sprite 2508×1672 would be 1800 wide, as a background 1600: the sprite wins.
    expect(comicDisplaySize(['background', 'sprite'], 2508, 1672)).toEqual({ width: 1800, height: 1200 });
    // Upright, the background needs it whole.
    expect(comicDisplaySize(['background', 'sprite'], 1024, 1536)).toBeNull();
  });

  it('makes nothing of a picture with no size, or of no use', () => {
    expect(comicDisplaySize('background', 0, 0)).toBeNull();
    expect(comicDisplaySize('sprite', Number.NaN, 10)).toBeNull();
    expect(comicDisplaySize([], 2508, 1672)).toBeNull();
  });
});
