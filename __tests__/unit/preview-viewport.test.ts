import {
  PREVIEW_DEVICES,
  getPreviewGeometry,
  getPreviewLayerStyle,
  sanitizePreviewDevice,
} from '@/lib/document-editor/preview-viewport';

describe('sanitizePreviewDevice', () => {
  it('accepts the known devices', () => {
    expect(sanitizePreviewDevice('mobile')).toBe('mobile');
    expect(sanitizePreviewDevice('desktop')).toBe('desktop');
  });

  it('falls back to mobile for anything else', () => {
    expect(sanitizePreviewDevice('tablet')).toBe('mobile');
    expect(sanitizePreviewDevice(undefined)).toBe('mobile');
    expect(sanitizePreviewDevice(42)).toBe('mobile');
  });
});

describe('getPreviewGeometry', () => {
  const stage = { width: 324, height: 300 };

  it('fits a phone by height and letterboxes it horizontally', () => {
    const geometry = getPreviewGeometry('mobile', stage);

    expect(geometry.scale).toBeCloseTo(300 / PREVIEW_DEVICES.mobile.height, 5);
    expect(geometry.renderedHeight).toBeCloseTo(300, 5);
    expect(geometry.renderedWidth).toBeLessThan(stage.width);
    expect(geometry.offsetX).toBeGreaterThan(0);
    expect(geometry.offsetY).toBeCloseTo(0, 5);
  });

  it('fits a desktop viewport by width and letterboxes it vertically', () => {
    const geometry = getPreviewGeometry('desktop', stage);

    expect(geometry.scale).toBeCloseTo(324 / PREVIEW_DEVICES.desktop.width, 5);
    expect(geometry.renderedWidth).toBeCloseTo(324, 5);
    expect(geometry.renderedHeight).toBeLessThan(stage.height);
    expect(geometry.offsetY).toBeGreaterThan(0);
    expect(geometry.offsetX).toBeCloseTo(0, 5);
  });

  it('never upscales past maxScale', () => {
    const geometry = getPreviewGeometry('mobile', { width: 4000, height: 4000 });
    expect(geometry.scale).toBe(1);
  });

  it('honours an explicit maxScale above 1', () => {
    const geometry = getPreviewGeometry('mobile', { width: 780, height: 1688 }, { maxScale: 2 });
    expect(geometry.scale).toBeCloseTo(2, 5);
  });

  it('degrades to zero scale on a collapsed stage rather than NaN', () => {
    const geometry = getPreviewGeometry('mobile', { width: 0, height: 0 });
    expect(geometry.scale).toBe(0);
    expect(Number.isNaN(geometry.renderedWidth)).toBe(false);
  });
});

describe('getPreviewLayerStyle', () => {
  it('centers the unscaled device so center-origin scaling lands centered', () => {
    const stage = { width: 324, height: 300 };
    const geometry = getPreviewGeometry('mobile', stage);
    const style = getPreviewLayerStyle(geometry);

    expect(style.width).toBe(PREVIEW_DEVICES.mobile.width);
    expect(style.height).toBe(PREVIEW_DEVICES.mobile.height);
    expect(style.transform).toEqual([{ scale: geometry.scale }]);

    // The scaled result must be centered on the stage in both axes.
    const centerX = style.left + PREVIEW_DEVICES.mobile.width / 2;
    const centerY = style.top + PREVIEW_DEVICES.mobile.height / 2;
    expect(centerX).toBeCloseTo(stage.width / 2, 5);
    expect(centerY).toBeCloseTo(stage.height / 2, 5);
  });
});
