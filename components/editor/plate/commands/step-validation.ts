import type { TimelineStep } from '@/lib/engine/types';

export function isValidTimelineStep(value: unknown): value is TimelineStep {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TimelineStep>;
  return typeof candidate.id === 'string' &&
    typeof candidate.blockType === 'string' &&
    Boolean(candidate.data) &&
    typeof candidate.collapsed === 'boolean' &&
    typeof candidate.enabled === 'boolean';
}
