import { normalizeTransitionData, normalizeTransitionType } from '@/lib/engine/transition-utils';

describe('normalizeTransitionData', () => {
  it('keeps a valid modern payload as-is', () => {
    expect(normalizeTransitionData({
      mode: 'scene',
      targetSceneId: 'scene_2',
      transitionType: 'slide',
      duration: 1.5,
    })).toEqual({
      mode: 'scene',
      targetSceneId: 'scene_2',
      transitionType: 'slide',
      duration: 1.5,
    });
  });

  it('migrates legacy data with a target to mode "scene"', () => {
    expect(normalizeTransitionData({
      targetSceneId: 'scene_2',
      transitionType: 'dissolve',
      duration: 1,
    })).toEqual({
      mode: 'scene',
      targetSceneId: 'scene_2',
      transitionType: 'fade',
      duration: 1,
    });
  });

  it('migrates legacy data without a target to mode "next" (matches old runtime behavior)', () => {
    const normalized = normalizeTransitionData({
      targetSceneId: null,
      transitionType: 'slide-left',
      duration: 0.8,
    });
    expect(normalized.mode).toBe('next');
    expect(normalized.targetSceneId).toBeNull();
    expect(normalized.transitionType).toBe('slide');
  });

  it('drops the target when mode is not "scene"', () => {
    expect(normalizeTransitionData({
      mode: 'end',
      targetSceneId: 'scene_2',
      transitionType: 'fade',
      duration: 1,
    }).targetSceneId).toBeNull();
  });

  it('falls back to defaults for garbage input', () => {
    expect(normalizeTransitionData(undefined)).toEqual({
      mode: 'next',
      targetSceneId: null,
      transitionType: 'fade',
      duration: 0.5,
    });
    expect(normalizeTransitionData({ duration: -3, transitionType: 'warp' })).toMatchObject({
      transitionType: 'fade',
      duration: 0.5,
    });
  });
});

describe('normalizeTransitionType', () => {
  it('collapses legacy variants onto the implemented set', () => {
    expect(normalizeTransitionType('wipe')).toBe('fade');
    expect(normalizeTransitionType('dissolve')).toBe('fade');
    expect(normalizeTransitionType('slide-up')).toBe('slide');
    expect(normalizeTransitionType('cut')).toBe('instant');
    expect(normalizeTransitionType('instant')).toBe('instant');
    expect(normalizeTransitionType(undefined)).toBe('fade');
  });
});
