import {
  CAMERA_PRESETS,
  CHARACTER_PRESETS,
  EFFECT_PRESETS,
  applyCameraPreset,
  applyCharacterPreset,
  applyEffectPreset,
} from '@/lib/engine/animation-presets';
import { createCameraStep, createCharacterStep, createEffectStep } from '@/lib/engine/event-factory';
import type { CameraBlockData, CharacterBlockData, EffectBlockData } from '@/lib/engine/types';

describe('animation presets', () => {
  it('only ever writes canonical block fields', () => {
    // The runtime never learns a preset was used, so a preset must not leave a
    // marker of its own behind.
    const base = createEffectStep().data as EffectBlockData;
    const allowed = new Set(Object.keys(base).concat(['durationMode', 'fadeIn', 'fadeOut', 'rain', 'snow', 'fog']));

    EFFECT_PRESETS.forEach((preset) => {
      Object.keys(preset.patch).forEach((key) => {
        expect(allowed.has(key)).toBe(true);
      });
    });
  });

  it('fills a storm without disturbing unrelated fields', () => {
    const data = { ...(createEffectStep().data as EffectBlockData), characterId: 'hero' };

    const applied = applyEffectPreset(data, 'storm');

    expect(applied).toMatchObject({
      effectType: 'rain',
      intensity: 75,
      durationMode: 'scene',
      rain: { variant: 'storm', lightning: true },
    });
    expect(applied.characterId).toBe('hero');
  });

  it('keeps the camera target a focus preset was pointed at', () => {
    const data = { ...(createCameraStep().data as CameraBlockData), target: 'hero' };

    const applied = applyCameraPreset(data, 'focusSpeaker');

    expect(applied.action).toBe('focus');
    expect(applied.zoomLevel).toBe(1.4);
    expect(applied.target).toBe('hero');
  });

  it('leaves data untouched for an unknown preset id', () => {
    const data = createCharacterStep().data as CharacterBlockData;

    expect(applyCharacterPreset(data, 'no-such-preset')).toEqual(data);
  });

  it('gives every preset a unique id within its group', () => {
    [EFFECT_PRESETS, CHARACTER_PRESETS, CAMERA_PRESETS].forEach((group) => {
      const ids = group.map((preset) => preset.id);
      expect(new Set(ids).size).toBe(ids.length);
      group.forEach((preset) => expect(preset.label.trim().length).toBeGreaterThan(0));
    });
  });
});
