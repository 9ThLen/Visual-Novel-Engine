import { useEffect, useRef, useState } from 'react';
import {
  cameraTargetTransform,
  cameraTransformsEqual,
  easeCameraProgress,
  interpolateCameraTransform,
  type CameraFocusCharacter,
  type CameraTransformValues,
} from '@/lib/engine/camera-transform';
import type { CameraRuntimeState } from '@/lib/engine/runtime-types';

/**
 * Drives the camera toward the state's target over its own `duration` and
 * `easing`.
 *
 * Plain numbers, like useShakeOffset, so the same values work in a reanimated
 * style and in a plain RN one. The tween always starts from what is currently
 * on screen rather than from the previous target, so a camera step that
 * interrupts another one continues from where the picture actually is.
 */
export function useCameraTransform(
  camera: CameraRuntimeState | null | undefined,
  characters: CameraFocusCharacter[],
  width: number,
): CameraTransformValues {
  const target = cameraTargetTransform(camera, { width, characters });
  const [value, setValue] = useState<CameraTransformValues>(target);
  const valueRef = useRef(value);
  valueRef.current = value;
  const mountedRef = useRef(false);

  const duration = Math.max(0, Number(camera?.duration) || 0);
  const easing = camera?.easing;

  useEffect(() => {
    const to = { translateX: target.translateX, translateY: target.translateY, scale: target.scale };
    const from = valueRef.current;

    // The first frame is wherever the story starts; animating into it would
    // zoom out of nothing on scene load.
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (!cameraTransformsEqual(from, to)) setValue(to);
      return undefined;
    }

    if (cameraTransformsEqual(from, to)) return undefined;
    if (duration <= 0) {
      setValue(to);
      return undefined;
    }

    const durationMs = duration * 1000;
    const startedAt = Date.now();
    let frame = requestAnimationFrame(function step() {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= durationMs) {
        setValue(to);
        return;
      }
      setValue(interpolateCameraTransform(from, to, easeCameraProgress(easing, elapsed / durationMs)));
      frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
    // The target numbers are the trigger: the runtime state object is rebuilt
    // on every executor pass, and animating on identity would restart the move
    // on unrelated updates.
  }, [target.translateX, target.translateY, target.scale, duration, easing]);

  return value;
}
