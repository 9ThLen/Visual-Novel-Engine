import type { TimelineStep } from '@/lib/engine/types';

const MAX_VALUE_LENGTH = 48;

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/** Short one-line description of a step's content, keyed on its blockType. */
export function summarizeStep(step: TimelineStep): string {
  const data = step.data as unknown as Record<string, unknown>;
  switch (step.blockType) {
    case 'dialogue': {
      const entries = data.entries as Array<{ characterId: string; text: string }> | undefined;
      const first = entries?.[0];
      return first ? `${step.blockType}: ${first.characterId} — ${stringifyValue(first.text)}` : step.blockType;
    }
    case 'text':
      return `${step.blockType}: ${stringifyValue(data.content)}`;
    case 'background':
      return `${step.blockType}: ${stringifyValue(data.assetId)}`;
    case 'character':
      return `${step.blockType}: ${stringifyValue(data.characterId)} (${stringifyValue(data.position)})`;
    case 'choice': {
      const options = data.options as Array<{ text: string }> | undefined;
      return `${step.blockType}: ${options?.length ?? 0} options`;
    }
    default:
      return step.blockType;
  }
}

export interface StepFieldDiff {
  field: string;
  before: string;
  after: string;
}

/** Shallow diff of top-level `data` fields between two steps sharing an id. */
export function diffStepFields(before: TimelineStep, after: TimelineStep): StepFieldDiff[] {
  const beforeData = before.data as unknown as Record<string, unknown>;
  const afterData = after.data as unknown as Record<string, unknown>;
  const fields = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
  const diffs: StepFieldDiff[] = [];
  fields.forEach((field) => {
    const beforeValue = beforeData[field];
    const afterValue = afterData[field];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      diffs.push({ field, before: stringifyValue(beforeValue), after: stringifyValue(afterValue) });
    }
  });
  return diffs;
}
