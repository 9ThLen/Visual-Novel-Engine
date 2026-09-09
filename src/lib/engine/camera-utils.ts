import type { CameraBlockData } from './types';

export const MIN_CAMERA_ZOOM = 0.5;
export const MAX_CAMERA_ZOOM = 3;
export const MAX_CAMERA_PAN = 100;
export const MAX_CAMERA_DURATION = 60;
export const DEFAULT_CAMERA_DURATION = 1;

/** One definition, so the block summary and the popover never disagree. */
export const CAMERA_ACTION_LABELS: Record<CameraBlockData['action'], string> = {
  zoom: 'Зум',
  pan: 'Панорама',
  focus: 'Фокус',
  reset: 'Скидання',
};

const CAMERA_ACTIONS: CameraBlockData['action'][] = ['zoom', 'pan', 'focus', 'reset'];
const CAMERA_EASINGS: CameraBlockData['easing'][] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function optionalNumber(value: unknown, min: number, max: number): number | undefined {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return undefined;
  return clamp(number, min, max);
}

/**
 * Canonical camera data.
 *
 * Repair only — it clamps and defaults, and never deletes a field the author
 * wrote. Optional fields stay optional on purpose: the executor reads
 * `d.zoomLevel ?? current`, so an absent zoom means "hold the zoom we already
 * have", and filling it with a default would silently rewrite what a pan step
 * does. Pruning a field the chosen action ignores would be just as wrong in the
 * other direction — the value survives a round trip through JSON, an import or
 * an AI edit, and only the editor drops it, where the author asked for it.
 */
export function normalizeCameraData(raw: unknown): CameraBlockData {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const action = CAMERA_ACTIONS.includes(record.action as CameraBlockData['action'])
    ? record.action as CameraBlockData['action']
    : 'zoom';
  const easing = CAMERA_EASINGS.includes(record.easing as CameraBlockData['easing'])
    ? record.easing as CameraBlockData['easing']
    : 'ease-in-out';
  const duration = optionalNumber(record.duration, 0, MAX_CAMERA_DURATION) ?? DEFAULT_CAMERA_DURATION;

  const zoomLevel = optionalNumber(record.zoomLevel, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const panX = optionalNumber(record.panX, -MAX_CAMERA_PAN, MAX_CAMERA_PAN);
  const panY = optionalNumber(record.panY, -MAX_CAMERA_PAN, MAX_CAMERA_PAN);
  const target = typeof record.target === 'string' && record.target.trim()
    ? record.target.trim()
    : undefined;

  return {
    action,
    duration,
    easing,
    ...(zoomLevel === undefined ? {} : { zoomLevel }),
    ...(panX === undefined ? {} : { panX }),
    ...(panY === undefined ? {} : { panY }),
    ...(target === undefined ? {} : { target }),
  };
}
