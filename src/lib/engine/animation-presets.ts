import type {
  CameraBlockData,
  CharacterBlockData,
  EffectBlockData,
} from './types';

/**
 * Named bundles of canonical values.
 *
 * A preset is authoring sugar only: it fills fields that already exist on the
 * block and is never stored. Once applied, a step is indistinguishable from one
 * tuned by hand, so round-trips, the runtime and Story Doctor stay unaware that
 * presets exist. The patch is plain data on purpose — the embedded editor
 * inlines these definitions as JSON, and a function would not survive that.
 */
export interface AnimationPreset<TData> {
  id: string;
  /** Ukrainian label, matching the rest of the embedded editor. */
  label: string;
  hint?: string;
  patch: Partial<TData>;
}

export const EFFECT_PRESETS: AnimationPreset<EffectBlockData>[] = [
  {
    id: 'drizzle',
    label: 'Мряка',
    hint: 'Тихий дрібний дощ',
    patch: {
      effectType: 'rain',
      target: 'screen',
      intensity: 25,
      durationMode: 'scene',
      fadeIn: 1.5,
      fadeOut: 1.5,
      rain: { variant: 'drizzle', lightning: false },
    },
  },
  {
    id: 'storm',
    label: 'Гроза',
    hint: 'Злива з блискавками',
    patch: {
      effectType: 'rain',
      target: 'screen',
      intensity: 75,
      durationMode: 'scene',
      fadeIn: 1,
      fadeOut: 2,
      rain: { variant: 'storm', lightning: true, splash: true },
    },
  },
  {
    id: 'snowfall',
    label: 'Снігопад',
    patch: {
      effectType: 'snow',
      target: 'screen',
      intensity: 45,
      durationMode: 'scene',
      fadeIn: 2,
      fadeOut: 2,
    },
  },
  {
    id: 'mist',
    label: 'Легкий туман',
    patch: {
      effectType: 'fog',
      target: 'screen',
      intensity: 35,
      durationMode: 'scene',
      fadeIn: 2.5,
      fadeOut: 2.5,
      fog: { variant: 'light' },
    },
  },
  {
    id: 'heavyFog',
    label: 'Щільний туман',
    patch: {
      effectType: 'fog',
      target: 'screen',
      intensity: 70,
      durationMode: 'scene',
      fadeIn: 3,
      fadeOut: 3,
      fog: { variant: 'dense' },
    },
  },
  {
    id: 'glitch',
    label: 'Гліч',
    hint: 'Коротке спотворення',
    patch: {
      effectType: 'glitch',
      target: 'screen',
      intensity: 60,
      durationMode: 'timed',
      duration: 1.2,
      fadeIn: 0,
      fadeOut: 0.3,
    },
  },
  {
    id: 'impact',
    label: 'Удар',
    hint: 'Різка тряска',
    patch: {
      effectType: 'shake',
      target: 'screen',
      intensity: 80,
      durationMode: 'timed',
      duration: 0.6,
      fadeIn: 0,
      fadeOut: 0.2,
    },
  },
  {
    id: 'flash',
    label: 'Спалах',
    patch: {
      effectType: 'flash',
      target: 'screen',
      intensity: 90,
      durationMode: 'timed',
      duration: 0.4,
      fadeIn: 0,
      fadeOut: 0.3,
    },
  },
];

export const CHARACTER_PRESETS: AnimationPreset<CharacterBlockData>[] = [
  { id: 'fadeIn', label: 'Проявлення', patch: { action: 'show', transition: 'fade', delay: 0 } },
  { id: 'slideIn', label: 'Вихід збоку', patch: { action: 'show', transition: 'slide-left', delay: 0.2 } },
  { id: 'zoomIn', label: 'Наближення', patch: { action: 'show', transition: 'zoom', delay: 0 } },
  {
    id: 'shake',
    label: 'Здригання',
    patch: { action: 'show', effect: { type: 'shake', intensity: 60, duration: 0.5 } },
  },
  {
    id: 'pulse',
    label: 'Пульс',
    hint: 'Коротке збільшення',
    patch: { action: 'show', effect: { type: 'scale', targetScale: 1.08, duration: 0.45 } },
  },
];

export const CAMERA_PRESETS: AnimationPreset<CameraBlockData>[] = [
  {
    id: 'slowPan',
    label: 'Повільна панорама',
    patch: { action: 'pan', panX: 12, panY: 0, duration: 3, easing: 'ease-in-out' },
  },
  { id: 'pushIn', label: 'Наїзд', patch: { action: 'zoom', zoomLevel: 1.25, duration: 2, easing: 'ease-out' } },
  {
    id: 'focusSpeaker',
    label: 'Фокус на персонажі',
    // `target` is deliberately absent: the preset must not clear the character
    // the author already picked.
    patch: { action: 'focus', zoomLevel: 1.4, duration: 1.2, easing: 'ease-in-out' },
  },
  {
    id: 'reset',
    label: 'Скинути камеру',
    patch: { action: 'reset', zoomLevel: 1, panX: 0, panY: 0, duration: 1, easing: 'ease-in-out' },
  },
];

function applyPreset<TData>(
  presets: AnimationPreset<TData>[],
  data: TData,
  presetId: string,
): TData {
  const preset = presets.find((item) => item.id === presetId);
  return preset ? { ...data, ...preset.patch } : data;
}

export function applyEffectPreset(data: EffectBlockData, presetId: string): EffectBlockData {
  return applyPreset(EFFECT_PRESETS, data, presetId);
}

export function applyCharacterPreset(data: CharacterBlockData, presetId: string): CharacterBlockData {
  return applyPreset(CHARACTER_PRESETS, data, presetId);
}

export function applyCameraPreset(data: CameraBlockData, presetId: string): CameraBlockData {
  return applyPreset(CAMERA_PRESETS, data, presetId);
}
