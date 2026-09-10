import {
  MAX_DIALOGUE_RESERVE_FRACTION,
  READER_TOP_PRESET_OFFSET,
  readerDialogueReservedHeight,
  readerStageInsets,
} from '@/lib/reader-stage';

/** 16px dialogue text at the reader's 1.65 line-height multiplier. */
const LINE_HEIGHT = 26.4;

describe('readerStageInsets', () => {
  it('reserves the panel at the bottom in landscape, where it is actually drawn', () => {
    const insets = readerStageInsets({
      stageWidth: 1920,
      stageHeight: 1080,
      layoutPreset: 'classic',
      lineHeight: LINE_HEIGHT,
    });

    expect(insets.bottom).toBeGreaterThan(0);
    expect(insets.bottom).toBeCloseTo(
      readerDialogueReservedHeight({ lineHeight: LINE_HEIGHT, panelWidth: 1920 }),
      5,
    );
    expect(insets.top).toBe(0);
  });

  it('reserves the same band in portrait', () => {
    const portrait = readerStageInsets({
      stageWidth: 390, stageHeight: 844, layoutPreset: 'classic', lineHeight: LINE_HEIGHT,
    });

    expect(portrait.bottom).toBeCloseTo(
      readerDialogueReservedHeight({ lineHeight: LINE_HEIGHT, panelWidth: 390 }),
      5,
    );
  });

  it('reserves a wider band where the controls wrap onto two rows', () => {
    const narrow = readerDialogueReservedHeight({ lineHeight: LINE_HEIGHT, panelWidth: 390 });
    const wide = readerDialogueReservedHeight({ lineHeight: LINE_HEIGHT, panelWidth: 1920 });

    expect(narrow).toBeGreaterThan(wide);
  });

  it('moves the reserve to the top for the top preset, below where it is pinned', () => {
    const insets = readerStageInsets({
      stageWidth: 1280, stageHeight: 720, layoutPreset: 'top', lineHeight: LINE_HEIGHT,
    });

    expect(insets.bottom).toBe(0);
    expect(insets.top).toBeGreaterThan(READER_TOP_PRESET_OFFSET);
  });

  it('stops the reserve from eating a landscape phone, where the panel is most of the screen', () => {
    const insets = readerStageInsets({
      stageWidth: 844, stageHeight: 390, layoutPreset: 'classic', lineHeight: LINE_HEIGHT,
    });

    expect(insets.bottom).toBeCloseTo(390 * MAX_DIALOGUE_RESERVE_FRACTION, 5);
    expect(390 - insets.bottom).toBeGreaterThan(200);
  });

  it('grows the reserve with the reader font, which is what makes the panel taller', () => {
    const small = readerDialogueReservedHeight({ lineHeight: 20, panelWidth: 1280 });
    const large = readerDialogueReservedHeight({ lineHeight: 40, panelWidth: 1280 });

    expect(large - small).toBeCloseTo((40 - 20) * 3, 5);
  });
});
