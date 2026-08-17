import {
  cameraTargetTransform,
  easeCameraProgress,
  focusTranslateX,
  IDENTITY_CAMERA_TRANSFORM,
  interpolateCameraTransform,
} from '@/lib/engine/camera-transform';
import { CHARACTER_POSITION_CENTER_FRACTION } from '@/lib/character-position';
import type { CameraRuntimeState } from '@/lib/engine/runtime-types';

const WIDTH = 1000;

function camera(overrides: Partial<CameraRuntimeState>): CameraRuntimeState {
  return {
    action: 'zoom',
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    duration: 1,
    easing: 'ease-in-out',
    ...overrides,
  };
}

describe('cameraTargetTransform', () => {
  it('leaves the picture alone without a camera state', () => {
    expect(cameraTargetTransform(null, { width: WIDTH })).toEqual(IDENTITY_CAMERA_TRANSFORM);
  });

  it('keeps the shipped pan contract of -2 pixels per unit', () => {
    // Existing stories are tuned against this number; changing it would move
    // every authored pan.
    expect(cameraTargetTransform(camera({ action: 'pan', panX: 10, panY: -5 }), { width: WIDTH }))
      .toEqual({ translateX: -20, translateY: 10, scale: 1 });
  });

  it('centres the focused character, carrying the zoom', () => {
    const result = cameraTargetTransform(
      camera({ action: 'focus', zoomLevel: 1.4, target: 'char_1' }),
      { width: WIDTH, characters: [{ characterId: 'char_1', position: 'right' }] },
    );

    // A sprite at 75% of the width sits 250px right of centre; at 1.4x that is
    // 350px, so the camera has to travel exactly that far back.
    expect(result.translateX).toBeCloseTo(-350, 5);
    expect(result.scale).toBe(1.4);
  });

  it('replaces a stale pan instead of adding to it', () => {
    // The executor carries panX forward across steps. Adding it would drag the
    // character the author just named back off centre.
    const result = cameraTargetTransform(
      camera({ action: 'focus', zoomLevel: 1, panX: 40, target: 'char_1' }),
      { width: WIDTH, characters: [{ characterId: 'char_1', position: 'center' }] },
    );
    expect(result.translateX).toBe(0);
  });

  it('degrades to a plain zoom when the target is not on screen', () => {
    const offScreen = cameraTargetTransform(
      camera({ action: 'focus', zoomLevel: 1.4, panX: 5, target: 'char_missing' }),
      { width: WIDTH, characters: [{ characterId: 'char_1', position: 'left' }] },
    );
    expect(offScreen).toEqual({ translateX: -10, translateY: 0, scale: 1.4 });

    const hidden = cameraTargetTransform(
      camera({ action: 'focus', zoomLevel: 1.4, target: 'char_1' }),
      { width: WIDTH, characters: [{ characterId: 'char_1', position: 'left', visible: false }] },
    );
    expect(hidden.translateX).toBe(0);
  });

  it('ignores a focus target for every other action', () => {
    const result = cameraTargetTransform(
      camera({ action: 'zoom', zoomLevel: 2, panX: 10, target: 'char_1' }),
      { width: WIDTH, characters: [{ characterId: 'char_1', position: 'far-right' }] },
    );
    expect(result.translateX).toBe(-20);
  });

  it('survives a zero width and a broken zoom', () => {
    const noWidth = cameraTargetTransform(
      camera({ action: 'focus', target: 'char_1' }),
      { width: 0, characters: [{ characterId: 'char_1', position: 'right' }] },
    );
    expect(noWidth.translateX).toBe(0);

    const brokenZoom = cameraTargetTransform(
      camera({ zoomLevel: Number.NaN, panX: Number.NaN }),
      { width: WIDTH },
    );
    expect(brokenZoom).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });
});

describe('focusTranslateX', () => {
  it('is zero for the centre slot at any zoom', () => {
    expect(focusTranslateX(CHARACTER_POSITION_CENTER_FRACTION.center, WIDTH, 2)).toBe(0);
  });

  it('mirrors around the centre', () => {
    const left = focusTranslateX(CHARACTER_POSITION_CENTER_FRACTION['far-left'], WIDTH, 1);
    const right = focusTranslateX(CHARACTER_POSITION_CENTER_FRACTION['far-right'], WIDTH, 1);
    expect(left).toBeCloseTo(-right, 5);
  });
});

describe('easeCameraProgress', () => {
  it('pins both ends for every curve', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(easeCameraProgress(easing, 0)).toBe(0);
      expect(easeCameraProgress(easing, 1)).toBe(1);
    }
  });

  it('clamps input outside the unit range', () => {
    expect(easeCameraProgress('linear', -1)).toBe(0);
    expect(easeCameraProgress('linear', 4)).toBe(1);
  });

  it('starts slow when easing in and fast when easing out', () => {
    expect(easeCameraProgress('ease-in', 0.5)).toBeLessThan(0.5);
    expect(easeCameraProgress('ease-out', 0.5)).toBeGreaterThan(0.5);
    expect(easeCameraProgress('linear', 0.5)).toBe(0.5);
  });
});

describe('interpolateCameraTransform', () => {
  it('walks from one frame to the other', () => {
    const from = { translateX: 0, translateY: 0, scale: 1 };
    const to = { translateX: 100, translateY: -50, scale: 2 };
    expect(interpolateCameraTransform(from, to, 0)).toEqual(from);
    expect(interpolateCameraTransform(from, to, 1)).toEqual(to);
    expect(interpolateCameraTransform(from, to, 0.5)).toEqual({ translateX: 50, translateY: -25, scale: 1.5 });
  });
});
