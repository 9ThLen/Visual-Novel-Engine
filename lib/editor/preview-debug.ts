import type { TimelineStep } from '@/lib/engine/types';
import type { ActiveEffect, RuntimeChoiceOption, RuntimeCondition, SceneState } from '@/lib/engine/runtime-types';
import { SCENE_BOUND_END_TIME } from '@/lib/engine/effect-duration';

export type PreviewDebugValueKind = 'boolean' | 'number' | 'string';

export interface PreviewDebugVariableRow {
  name: string;
  kind: PreviewDebugValueKind;
  display: string;
}

export interface PreviewDebugChoiceRow {
  id: string;
  text: string;
  targetLabel: 'next' | string;
  conditionText: string | null;
}

export interface PreviewDebugEffectRow {
  effectType: ActiveEffect['effectType'];
  intensity: number;
  remainingSeconds: number | null;
}

export interface PreviewDebugPosition {
  stepNumber: number;
  totalSteps: number;
  blockType: string | null;
  isTyping: boolean;
  isComplete: boolean;
}

export interface PreviewDebugMusic {
  trackLabel: string;
  playing: boolean;
  volume: number;
}

export interface PreviewDebugTransition {
  target: string | null;
  mode: string | null;
  type: string | null;
}

export interface PreviewDebugModel {
  position: PreviewDebugPosition;
  variables: PreviewDebugVariableRow[];
  choices: PreviewDebugChoiceRow[];
  effects: PreviewDebugEffectRow[];
  music: PreviewDebugMusic;
  transition: PreviewDebugTransition | null;
}

function describeVariable(value: string | number | boolean): PreviewDebugVariableRow['kind'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function formatVariableValue(value: string | number | boolean): string {
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function formatCondition(condition: RuntimeCondition): string {
  return `${condition.variableName} ${condition.operator} ${formatVariableValue(condition.value)}`;
}

function buildChoiceRow(option: RuntimeChoiceOption): PreviewDebugChoiceRow {
  return {
    id: option.id,
    text: option.text,
    targetLabel: option.targetSceneId ?? 'next',
    conditionText: option.condition ? formatCondition(option.condition) : null,
  };
}

function buildEffectRow(effect: ActiveEffect, now: number): PreviewDebugEffectRow {
  const isSceneBound =
    effect.sceneBound === true || effect.durationMode === 'scene' || effect.endTime >= SCENE_BOUND_END_TIME;
  const remainingMs = effect.endTime - now;
  return {
    effectType: effect.effectType,
    intensity: effect.intensity,
    remainingSeconds: !isSceneBound && Number.isFinite(effect.endTime) ? Math.max(0, remainingMs / 1000) : null,
  };
}

export function buildPreviewDebugModel(
  sceneState: SceneState,
  timeline: TimelineStep[],
  currentStepIndex: number,
  now: number,
  isTyping: boolean,
  isComplete: boolean,
): PreviewDebugModel {
  const enabledSteps = timeline.filter((step) => step.enabled);
  const currentStep = timeline[currentStepIndex];
  const stepNumber = currentStep
    ? timeline.slice(0, currentStepIndex + 1).filter((step) => step.enabled).length
    : 0;

  const variables: PreviewDebugVariableRow[] = Object.entries(sceneState.variables)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({
      name,
      kind: describeVariable(value),
      display: formatVariableValue(value),
    }));

  const choices = (sceneState.currentChoices ?? []).map(buildChoiceRow);
  const effects = sceneState.activeEffects.map((effect) => buildEffectRow(effect, now));

  const music: PreviewDebugMusic = {
    trackLabel: sceneState.musicMode === 'silence' || !sceneState.musicTrackId ? 'none' : sceneState.musicTrackId,
    playing: sceneState.musicPlaying,
    volume: sceneState.musicVolume,
  };

  const hasTransition = !!sceneState.transitionTarget || !!sceneState.transitionMode;
  const transition: PreviewDebugTransition | null = hasTransition
    ? {
        target: sceneState.transitionTarget,
        mode: sceneState.transitionMode ?? null,
        type: sceneState.transitionType ?? null,
      }
    : null;

  return {
    position: {
      stepNumber,
      totalSteps: enabledSteps.length,
      blockType: currentStep?.blockType ?? null,
      isTyping,
      isComplete,
    },
    variables,
    choices,
    effects,
    music,
    transition,
  };
}
