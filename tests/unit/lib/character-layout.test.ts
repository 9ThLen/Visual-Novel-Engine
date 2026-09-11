import {
  CHARACTER_STAGE_HEIGHT_FRACTION,
  DEFAULT_CHARACTER_ASPECT_RATIO,
  characterMaxWidthFraction,
  getCharacterSpriteSize,
} from '@/lib/character-layout';

const PHONE = { stageWidth: 390, stageHeight: 526 };
const DESKTOP = { stageWidth: 1920, stageHeight: 780 };

describe('getCharacterSpriteSize', () => {
  it('fills the stage height, not the window width', () => {
    const { height } = getCharacterSpriteSize({ ...PHONE, aspectRatio: 9 / 16 });

    expect(height).toBeCloseTo(526 * CHARACTER_STAGE_HEIGHT_FRACTION, 5);
  });

  it('keeps the sprite proportions instead of forcing a 9:16 box', () => {
    const { width, height } = getCharacterSpriteSize({ ...DESKTOP, aspectRatio: 3 / 4 });

    expect(width / height).toBeCloseTo(3 / 4, 5);
  });

  it('keeps the composition when the same aspect ratio gains pixels', () => {
    const at720 = getCharacterSpriteSize({ stageWidth: 1280, stageHeight: 520, aspectRatio: 9 / 16 });
    const at1440 = getCharacterSpriteSize({ stageWidth: 2560, stageHeight: 1040, aspectRatio: 9 / 16 });

    expect(at1440.height / 1040).toBeCloseTo(at720.height / 520, 5);
    expect(at1440.width / 2560).toBeCloseTo(at720.width / 1280, 5);
  });

  it('narrows a wide sprite that would not fit across the stage', () => {
    const { width, height } = getCharacterSpriteSize({ ...PHONE, aspectRatio: 1 });

    expect(width).toBeCloseTo(390 * characterMaxWidthFraction(1), 5);
    expect(height).toBeCloseTo(width, 5);
  });

  it('leaves less width to each character as the cast grows', () => {
    const alone = getCharacterSpriteSize({ ...PHONE, aspectRatio: 1, characterCount: 1 });
    const crowd = getCharacterSpriteSize({ ...PHONE, aspectRatio: 1, characterCount: 3 });

    expect(crowd.width).toBeLessThan(alone.width);
    expect(crowd.height).toBeLessThan(alone.height);
  });

  it('falls back to full-body proportions before the sprite has loaded', () => {
    const { width, height } = getCharacterSpriteSize({ ...DESKTOP });

    expect(width / height).toBeCloseTo(DEFAULT_CHARACTER_ASPECT_RATIO, 5);
  });

  it('draws nothing while the stage has no size yet', () => {
    expect(getCharacterSpriteSize({ stageWidth: 0, stageHeight: 0 })).toEqual({ width: 0, height: 0 });
  });
});
