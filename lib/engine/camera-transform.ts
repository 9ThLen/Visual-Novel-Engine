import { characterPositionCenterFraction } from '@/lib/character-position';
import type { CameraRuntimeState, RuntimeCameraEasing } from '@/lib/engine/runtime-types';

/**
 * What the camera needs to know about a character to frame them. Narrower than
 * CharacterRuntimeState so the reader can pass the sprites it actually renders
 * and the preview can pass runtime state.
 */
export interface CameraFocusCharacter {
  characterId: string;
  position: string;
  /** Absent means rendered; only explicit `false` hides a character. */
  visible?: boolean;
}

export interface CameraTransformValues {
  translateX: number;
  translateY: number;
  scale: number;
}

export const IDENTITY_CAMERA_TRANSFORM: CameraTransformValues = {
  translateX: 0,
  translateY: 0,
  scale: 1,
};

/**
 * Pan is authored in percent but has always been applied as `-2 * panX`
 * pixels. Existing stories are tuned against that number, so it stays.
 */
const PAN_PIXELS_PER_UNIT = -2;

/** Negating zero yields -0, which is only ever noise in a transform. */
function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function easeCameraProgress(easing: RuntimeCameraEasing | undefined, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - (1 - t) ** 3;
    case 'ease-in-out':
    default:
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

/**
 * Horizontal offset that brings a character slot to the middle of the screen.
 *
 * The transform list is `[translateX, translateY, scale]`, which maps a point
 * at distance `d` from centre to `d * scale + translate`. Centring therefore
 * needs the translation to carry the zoom, otherwise a focus at 1.4× lands the
 * character short of the middle.
 */
export function focusTranslateX(centerFraction: number, width: number, scale: number): number {
  return withoutNegativeZero(-(centerFraction - 0.5) * width * scale);
}

function visibleCharacterPosition(
  characters: CameraFocusCharacter[],
  characterId: string | undefined,
): string | null {
  if (!characterId) return null;
  const match = characters.find((character) => character.characterId === characterId);
  if (!match || match.visible === false) return null;
  return match.position;
}

export interface CameraTargetOptions {
  /** Width the camera transform is applied over, in the same units as the sprites. */
  width: number;
  characters?: CameraFocusCharacter[];
}

/**
 * Where the camera should end up for a runtime state. Pure so both the reader
 * and the editor preview can share it, and so the numbers can be asserted
 * without mounting anything.
 */
export function cameraTargetTransform(
  camera: CameraRuntimeState | null | undefined,
  options: CameraTargetOptions,
): CameraTransformValues {
  if (!camera) return IDENTITY_CAMERA_TRANSFORM;
  const scale = Number.isFinite(camera.zoomLevel) && camera.zoomLevel > 0 ? camera.zoomLevel : 1;
  const panX = Number.isFinite(camera.panX) ? camera.panX : 0;
  const panY = Number.isFinite(camera.panY) ? camera.panY : 0;

  const focusPosition = camera.action === 'focus'
    ? visibleCharacterPosition(options.characters ?? [], camera.target)
    : null;

  // A resolved focus replaces the pan rather than adding to it: the author
  // named a character, so a pan left over from an earlier step must not drag
  // them back off centre. An unresolved target degrades to a plain zoom.
  if (focusPosition !== null && options.width > 0) {
    return {
      translateX: focusTranslateX(characterPositionCenterFraction(focusPosition), options.width, scale),
      translateY: withoutNegativeZero(panY * PAN_PIXELS_PER_UNIT),
      scale,
    };
  }

  return {
    translateX: withoutNegativeZero(panX * PAN_PIXELS_PER_UNIT),
    translateY: withoutNegativeZero(panY * PAN_PIXELS_PER_UNIT),
    scale,
  };
}

export function interpolateCameraTransform(
  from: CameraTransformValues,
  to: CameraTransformValues,
  progress: number,
): CameraTransformValues {
  const t = Math.min(1, Math.max(0, progress));
  return {
    translateX: from.translateX + (to.translateX - from.translateX) * t,
    translateY: from.translateY + (to.translateY - from.translateY) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

export function cameraTransformsEqual(a: CameraTransformValues, b: CameraTransformValues): boolean {
  return a.translateX === b.translateX && a.translateY === b.translateY && a.scale === b.scale;
}
