import { normalizeCameraData } from '@/lib/engine/camera-utils';

describe('normalizeCameraData', () => {
  it('falls back to a usable zoom step for junk input', () => {
    expect(normalizeCameraData(null)).toEqual({ action: 'zoom', duration: 1, easing: 'ease-in-out' });
    expect(normalizeCameraData({ action: 'orbit', easing: 'bounce' }))
      .toEqual({ action: 'zoom', duration: 1, easing: 'ease-in-out' });
  });

  it('keeps optional fields absent instead of defaulting them', () => {
    // The executor reads `d.zoomLevel ?? current`, so filling a default here
    // would turn "hold the current zoom" into "reset it to 1".
    const data = normalizeCameraData({ action: 'pan', panX: 12, duration: 3 });
    expect(data).toEqual({ action: 'pan', panX: 12, duration: 3, easing: 'ease-in-out' });
    expect('zoomLevel' in data).toBe(false);
    expect('panY' in data).toBe(false);
  });

  it('clamps zoom, pan and duration into their ranges', () => {
    expect(normalizeCameraData({ action: 'zoom', zoomLevel: 12 }).zoomLevel).toBe(3);
    expect(normalizeCameraData({ action: 'zoom', zoomLevel: 0.01 }).zoomLevel).toBe(0.5);
    expect(normalizeCameraData({ action: 'pan', panX: 500, panY: -500 }))
      .toMatchObject({ panX: 100, panY: -100 });
    expect(normalizeCameraData({ action: 'zoom', duration: -4 }).duration).toBe(0);
    expect(normalizeCameraData({ action: 'zoom', duration: 900 }).duration).toBe(60);
  });

  it('repairs without deleting fields the chosen action ignores', () => {
    // Round-trip fidelity comes first: a zoom step that carries a pan from an
    // earlier edit keeps it, and only the editor drops it — where the author
    // can see that happening.
    expect(normalizeCameraData({ action: 'reset', zoomLevel: 2, panX: 30, target: 'char_1', duration: 2 }))
      .toEqual({ action: 'reset', duration: 2, easing: 'ease-in-out', zoomLevel: 2, panX: 30, target: 'char_1' });
  });

  it('keeps a usable focus target and drops a blank one', () => {
    expect(normalizeCameraData({ action: 'focus', target: ' char_1 ' }).target).toBe('char_1');
    expect(normalizeCameraData({ action: 'focus', target: '   ' }).target).toBeUndefined();
    expect(normalizeCameraData({ action: 'focus', target: 42 }).target).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = normalizeCameraData({ action: 'focus', target: 'char_1', zoomLevel: 1.4, duration: 1.2, easing: 'ease-out' });
    expect(normalizeCameraData(once)).toEqual(once);
  });
});
