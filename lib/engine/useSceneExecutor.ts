import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type {
  TimelineStep,
  BackgroundBlockData,
  CharacterBlockData,
  DialogueBlockData,
  ChoiceBlockData,
  EffectBlockData,
  StopEffectBlockData,
  MusicBlockData,
  SoundBlockData,
  InteractiveObjectBlockData,
  CameraBlockData,
  VariableBlockData,
  TransitionBlockData,
  LabelBlockData,
  GotoBlockData,
} from './types';
import type { RuntimeVariables, SceneState } from './runtime-types';
import { createEmptySceneState, conditionsMet } from './conditionUtils';
import { normalizeTransitionData } from './transition-utils';
import {
  isBlockingEffectType,
  normalizeEffectDuration,
  normalizeEffectDurationMode,
  SCENE_BOUND_END_TIME,
} from './effect-duration';

const YIELDING_BLOCK_TYPES = new Set(['text', 'dialogue', 'choice', 'transition']);
const MAX_DIALOGUE_HISTORY_ENTRIES = 500;
const MAX_ROLLBACK_DEPTH = 100;
/**
 * Upper bound on steps executed in one pass. Goto blocks can jump backward,
 * so a mis-authored loop with no yield point in it would otherwise spin
 * forever; hitting the cap ends the scene instead.
 */
const MAX_STEPS_PER_PASS = 1000;

/** Index of the enabled label with the given name, or -1. */
function findLabelIndex(steps: TimelineStep[], name: string): number {
  const normalizedName = name.trim();
  if (!normalizedName) return -1;
  return steps.findIndex(
    (step) =>
      step.blockType === 'label' &&
      step.enabled &&
      (step.data as LabelBlockData).name.trim() === normalizedName,
  );
}

interface ExecutorState {
  sceneState: SceneState;
  currentStepIndex: number;
  isTyping: boolean;
  canAdvance: boolean;
  /** Transition reached but not yet confirmed by the player — see advance(). */
  pendingTransition: TransitionBlockData | null;
}

interface ExecutorStepResult {
  nextState: ExecutorState;
  nextIndex: number;
  isHalted: boolean;
}

/**
 * A halted executor state captured right before the player advances past it.
 * ExecutorState is replaced immutably on every commit, so snapshots hold
 * plain references — restoring one is a single state commit.
 */
interface RollbackSnapshot {
  execState: ExecutorState;
  internalIndex: number;
  stepId: string;
}

type LookaheadAction = 'preload' | 'skip' | 'stop';

export interface UseSceneExecutorOptions {
  initialVariables?: RuntimeVariables;
}

export interface UseSceneExecutorReturn {
  sceneState: SceneState;
  currentStepIndex: number;
  isComplete: boolean;
  isTyping: boolean;
  canAdvance: boolean;
  /** True when rollback() can restore a previous yield point in this scene. */
  canRollback: boolean;
  advance: () => void;
  /** Restore the most recent yield point the player advanced past. */
  rollback: () => void;
  selectChoice: (optionId: string) => void;
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function createInitialExecutorState(
  initialVariables?: RuntimeVariables,
): ExecutorState {
  return {
    sceneState: {
      ...createEmptySceneState(),
      variables: initialVariables ?? {},
    },
    currentStepIndex: 0,
    isTyping: false,
    canAdvance: false,
    pendingTransition: null,
  };
}

function lookaheadActionForStep(step: TimelineStep, state: SceneState): LookaheadAction {
  if (!step.enabled) return 'skip';
  if (!conditionsMet(step.conditions, state.variables)) return 'skip';
  if (step.blockType !== 'effect') return 'stop';

  const data = step.data as EffectBlockData;
  return isBlockingEffectType(data.effectType) ? 'preload' : 'stop';
}

function evaluateVariable(
  variables: RuntimeVariables,
  varName: string,
  operation: 'set' | 'add' | 'subtract' | 'multiply' | 'toggle',
  value: string | number | boolean,
): RuntimeVariables {
  if (RESERVED_KEYS.has(varName)) {
    if (__DEV__) {
      console.warn('[useSceneExecutor] attempted to set reserved variable key:', varName);
    }
    return variables;
  }
  const next = { ...variables };
  const parsed = typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : value;

  switch (operation) {
    case 'set':
      next[varName] = parsed;
      break;
    case 'add':
      next[varName] = ((next[varName] as number) || 0) + (parsed as number);
      break;
    case 'subtract':
      next[varName] = ((next[varName] as number) || 0) - (parsed as number);
      break;
    case 'multiply':
      next[varName] = ((next[varName] as number) || 0) * (parsed as number);
      break;
    case 'toggle':
      next[varName] = !next[varName];
      break;
  }
  return next;
}

export function useSceneExecutor(
  timeline: TimelineStep[],
  options?: UseSceneExecutorOptions,
): UseSceneExecutorReturn {
  const [execState, setExecState] = useState<ExecutorState>(() =>
    createInitialExecutorState(options?.initialVariables),
  );

  const internalIndexRef = useRef(0);
  const isHaltedRef = useRef(false);
  const rollbackStackRef = useRef<RollbackSnapshot[]>([]);
  const timelineRef = useRef(timeline);
  const advanceGuardRef = useRef(false);
  const initialVariablesRef = useRef(options?.initialVariables);
  const execStateRef = useRef(execState);

  timelineRef.current = timeline;
  initialVariablesRef.current = options?.initialVariables;

  const timelineKey = useMemo(
    () => JSON.stringify(timeline.map((step) => ({
      id: step.id,
      blockType: step.blockType,
      enabled: step.enabled,
      conditions: step.conditions ?? null,
      data: step.data,
    }))),
    [timeline],
  );

  const { sceneState, currentStepIndex, isTyping, canAdvance } = execState;
  const isComplete = internalIndexRef.current >= timeline.length;

  const executeStep = useCallback((step: TimelineStep, currentState: SceneState): { nextState: SceneState; result: 'continue' | 'halt' } => {
    if (!step.enabled) {
      return { nextState: currentState, result: 'continue' };
    }
    if (!conditionsMet(step.conditions, currentState.variables)) {
      return { nextState: currentState, result: 'continue' };
    }

    let nextState = { ...currentState };

    try {
      switch (step.blockType) {
        case 'background': {
          const d = step.data as BackgroundBlockData;
          nextState.backgroundAssetId = d.assetId ?? null;
          nextState.backgroundTransition = d.transition;
          break;
        }
        case 'character': {
          const d = step.data as CharacterBlockData;
          const action = d.action || 'show';
          const existingIdx = nextState.characters.findIndex((c) => c.characterId === d.characterId);
          const existing = existingIdx >= 0 ? nextState.characters[existingIdx] : null;
          if (action === 'hide') {
            nextState.characters = nextState.characters.filter((c) => c.characterId !== d.characterId);
            break;
          }
          const charState = {
            characterId: d.characterId,
            spriteId: action === 'move' ? existing?.spriteId ?? d.spriteId : d.spriteId || existing?.spriteId || '',
            position: action === 'change_sprite' ? existing?.position ?? d.position : d.position || existing?.position || 'center',
            visible: true,
            opacity: existing?.opacity ?? 1,
            scale: existing?.scale ?? 1,
            zIndex: existing?.zIndex ?? 1,
          };
          const nextChars = [...nextState.characters];
          if (existingIdx >= 0) {
            nextChars[existingIdx] = charState;
            nextState.characters = nextChars;
          } else if (action === 'show' || action === 'change_sprite' || action === 'move') {
            nextState.characters = [...nextChars, charState];
          }
          break;
        }
        case 'text':
        case 'dialogue': {
          if (step.blockType === 'dialogue') {
            const d = step.data as DialogueBlockData;
            const entry = d.entries?.[d.currentEntryIndex ?? 0];
            nextState.activeSpeakerCharacterId = d.speakerFocus?.enabled ? d.speakerFocus.characterId : entry?.characterId ?? null;
            nextState.activeSpeakerFocusScale = d.speakerFocus?.scale ?? 1.04;
            nextState.dimNonSpeakerCharacters = d.speakerFocus?.dimOthers ?? false;
            if (entry) {
              nextState.dialogueHistory = [
                ...nextState.dialogueHistory,
                {
                  characterId: entry.characterId,
                  characterName: entry.speakerName || entry.characterId,
                  text: entry.text,
                  timestamp: Date.now(),
                },
              ].slice(-MAX_DIALOGUE_HISTORY_ENTRIES);
            }
          }
          break;
        }
        case 'choice': {
          nextState.currentChoices = (step.data as ChoiceBlockData).options ?? null;
          break;
        }
        case 'effect': {
          const d = step.data as EffectBlockData;
          const now = Date.now();
          const durationMode = normalizeEffectDurationMode(d.effectType, d.durationMode, d.duration);
          const sceneBound = durationMode === 'scene';
          const endTime = sceneBound
            ? SCENE_BOUND_END_TIME
            : now + normalizeEffectDuration(d.effectType, d.duration) * 1000;
          nextState.activeEffects = [
            ...nextState.activeEffects,
            {
              effectType: d.effectType,
              target: d.target,
              characterId: d.characterId,
              intensity: d.intensity,
              durationMode,
              sceneBound,
              fadeIn: d.fadeIn,
              fadeOut: d.fadeOut,
              rain: d.rain,
              snow: d.snow,
              fog: d.fog,
              startTime: now,
              endTime,
            },
          ];
          break;
        }
        case 'stop_effect': {
          const d = step.data as StopEffectBlockData;
          nextState.activeEffects = nextState.activeEffects.filter((effect) => {
            const typeMatches = d.effectType === 'all' || effect.effectType === d.effectType;
            const targetMatches = !d.target || d.target === 'all' || effect.target === d.target;
            return !(typeMatches && targetMatches);
          });
          break;
        }
        case 'music': {
          const d = step.data as MusicBlockData;
          nextState.musicMode = d.mode;
          nextState.musicLoop = d.loop;
          nextState.musicFadeIn = d.fadeIn;
          nextState.musicFadeOut = d.fadeOut;
          nextState.musicBoundTo = d.boundTo;
          nextState.musicAutoFadeAfter = d.autoFadeAfter;
          if (d.mode === 'track') {
            nextState.musicTrackId = d.assetId;
            nextState.musicPlaying = !!d.assetId;
            nextState.musicVolume = d.volume;
          } else {
            nextState.musicTrackId = null;
            nextState.musicPlaying = false;
            nextState.musicVolume = d.volume;
          }
          break;
        }
        case 'sound': {
          const d = step.data as SoundBlockData;
          if (d.assetId) {
            nextState.soundEvents = [
              ...(nextState.soundEvents ?? []),
              {
                id: `${step.id}:${Date.now()}`,
                assetId: d.assetId,
                mode: d.mode,
                volume: d.volume,
                loop: d.loop,
                fadeIn: d.fadeIn,
                fadeOut: d.fadeOut,
                pitchVariation: d.pitchVariation,
                boundTo: d.boundTo,
                timestamp: Date.now(),
              },
            ];
          }
          break;
        }
        case 'camera': {
          const d = step.data as CameraBlockData;
          nextState.cameraState = d.action === 'reset'
            ? {
                action: 'reset',
                zoomLevel: 1,
                panX: 0,
                panY: 0,
                duration: d.duration,
                easing: d.easing,
              }
            : {
                action: d.action,
                zoomLevel: d.zoomLevel ?? nextState.cameraState?.zoomLevel ?? 1,
                panX: d.panX ?? nextState.cameraState?.panX ?? 0,
                panY: d.panY ?? nextState.cameraState?.panY ?? 0,
                target: d.target,
                duration: d.duration,
                easing: d.easing,
              };
          break;
        }
        case 'variable': {
          const d = step.data as VariableBlockData;
          nextState.variables = evaluateVariable(nextState.variables, d.variableName, d.operation, d.value);
          break;
        }
        case 'transition': {
          const d = normalizeTransitionData(step.data as TransitionBlockData);
          nextState.isTransitioning = true;
          nextState.transitionTarget = d.targetSceneId;
          nextState.transitionMode = d.mode;
          nextState.transitionType = d.transitionType;
          nextState.transitionDuration = d.duration;
          break;
        }
        case 'interactive_object': {
          const d = step.data as InteractiveObjectBlockData;
          const nextObject = {
            id: d.objectId || step.id,
            name: d.name,
            imageUri: d.assetId ?? undefined,
            position: d.position,
            actions: d.actions,
            oneTimeOnly: d.oneTimeOnly,
            pulseAnimation: d.pulseAnimation,
            highlightOnHover: true,
            isActive: true,
          };
          const currentObjects = nextState.interactiveObjects ?? [];
          const existingIdx = currentObjects.findIndex((object) => object.id === nextObject.id);
          if (existingIdx >= 0) {
            const nextObjects = [...currentObjects];
            nextObjects[existingIdx] = nextObject;
            nextState.interactiveObjects = nextObjects;
          } else {
            nextState.interactiveObjects = [...currentObjects, nextObject];
          }
          break;
        }
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[useSceneExecutor] executeStep: failed to process step', step.blockType, step.id, err);
      }
      return { nextState: currentState, result: 'continue' };
    }

    const yielding = YIELDING_BLOCK_TYPES.has(step.blockType);
    return { nextState, result: yielding ? 'halt' : 'continue' };
  }, []);

  const computeNextExecutorState = useCallback((prev: ExecutorState, startIndex: number, steps: TimelineStep[]): ExecutorStepResult => {
    let currentState: SceneState = { ...prev.sceneState, currentChoices: null };
    let idx = startIndex;
    let executedSteps = 0;

    while (idx < steps.length) {
      if (++executedSteps > MAX_STEPS_PER_PASS) {
        if (__DEV__) {
          console.warn('[useSceneExecutor] step budget exceeded — likely a goto loop with no yield point; ending scene');
        }
        idx = steps.length;
        break;
      }

      const step = steps[idx];

      // Goto is control flow, not scene state: it moves the cursor, so it is
      // resolved here rather than in executeStep. Step-level `conditions`
      // gate the block itself; `data.condition` picks between the two targets.
      if (step.blockType === 'goto') {
        if (step.enabled && conditionsMet(step.conditions, currentState.variables)) {
          const d = step.data as GotoBlockData;
          const passes = !d.condition || conditionsMet([d.condition], currentState.variables);
          const target = passes ? d.targetLabel : d.elseTargetLabel ?? '';
          const targetIdx = findLabelIndex(steps, target);
          if (targetIdx >= 0) {
            idx = targetIdx + 1;
            continue;
          }
          if (__DEV__ && target) {
            console.warn('[useSceneExecutor] goto target label not found, falling through:', target);
          }
        }
        idx++;
        continue;
      }

      const { nextState, result } = executeStep(step, currentState);
      currentState = nextState;

      if (result === 'halt') {
        const typing = step.blockType === 'text' || step.blockType === 'dialogue';
        const isTransitionStep = step.blockType === 'transition';
        let resumeIndex = idx;

        if (typing) {
          let lookaheadIndex = idx + 1;
          while (lookaheadIndex < steps.length) {
            const lookaheadStep = steps[lookaheadIndex];
            const action = lookaheadActionForStep(lookaheadStep, currentState);
            if (action === 'stop') break;

            const executed = executeStep(lookaheadStep, currentState);
            currentState = executed.nextState;
            resumeIndex = lookaheadIndex;
            lookaheadIndex++;
          }
        }

        // A transition block yields for player confirmation (tap/auto-play/turbo
        // via advance()) before it actually navigates — don't commit
        // isTransitioning until then, or the reader jumps scenes on arrival.
        return {
          nextIndex: resumeIndex,
          isHalted: true,
          nextState: {
            ...prev,
            sceneState: isTransitionStep
              ? { ...currentState, isTransitioning: false }
              : currentState,
            currentStepIndex: idx,
            isTyping: typing,
            canAdvance: step.blockType !== 'choice',
            pendingTransition: isTransitionStep
              ? normalizeTransitionData(step.data as TransitionBlockData)
              : null,
          },
        };
      }

      idx++;
    }

    return {
      nextIndex: idx,
      isHalted: false,
      nextState: {
        ...prev,
        sceneState: currentState,
        isTyping: false,
        canAdvance: false,
        pendingTransition: null,
      },
    };
  }, [executeStep]);

  const commitExecutorState = useCallback((nextState: ExecutorState) => {
    execStateRef.current = nextState;
    setExecState(nextState);
  }, []);

  const processNext = useCallback(() => {
    const { nextState, nextIndex, isHalted } = computeNextExecutorState(
      execStateRef.current,
      internalIndexRef.current,
      timelineRef.current,
    );
    internalIndexRef.current = nextIndex;
    isHaltedRef.current = isHalted;
    commitExecutorState(nextState);
  }, [commitExecutorState, computeNextExecutorState]);

  const resetAndProcess = useCallback(() => {
    internalIndexRef.current = 0;
    isHaltedRef.current = false;
    advanceGuardRef.current = false;
    rollbackStackRef.current = [];
    const initialState = createInitialExecutorState(initialVariablesRef.current);
    execStateRef.current = initialState;
    const { nextState, nextIndex, isHalted } = computeNextExecutorState(
      initialState,
      0,
      timelineRef.current,
    );
    internalIndexRef.current = nextIndex;
    isHaltedRef.current = isHalted;
    commitExecutorState(nextState);
  }, [commitExecutorState, computeNextExecutorState]);

  const updateExecutorState = useCallback((updater: (prev: ExecutorState) => ExecutorState) => {
    const nextState = updater(execStateRef.current);
    commitExecutorState(nextState);
  }, [commitExecutorState]);

  useEffect(() => {
    try {
      resetAndProcess();
    } catch (e) {
      if (__DEV__) {
        console.warn('[useSceneExecutor] processNext error:', e);
      }
    }

  }, [timelineKey, resetAndProcess]);

  const advance = useCallback(() => {
    if (advanceGuardRef.current) return;
    advanceGuardRef.current = true;
    try {
      if (isTyping) {
        updateExecutorState((prev) => ({ ...prev, isTyping: false, canAdvance: true }));
        return;
      }

      if (sceneState.currentChoices) {
        return;
      }

      const pending = execStateRef.current.pendingTransition;
      if (pending) {
        // Consuming the pending transition resolves the halt for good — clear
        // isHaltedRef so a duplicate advance() call (RN Web can dispatch a
        // press twice before this state change re-renders) is a no-op instead
        // of falling through to the "move to next step" path below, which
        // would push internalIndexRef past the timeline end and spuriously
        // mark the executor complete.
        isHaltedRef.current = false;
        updateExecutorState((prev) => ({
          ...prev,
          sceneState: {
            ...prev.sceneState,
            isTransitioning: true,
            transitionTarget: pending.targetSceneId,
            transitionMode: pending.mode,
            transitionType: pending.transitionType,
            transitionDuration: pending.duration,
          },
          pendingTransition: null,
          canAdvance: false,
        }));
        return;
      }

      if (!isHaltedRef.current) {
        return;
      }

      // Leaving a yield point — capture it so rollback() can come back here.
      // Choice and transition halts never reach this path (they navigate away
      // and the per-scene executor remounts), so only text/dialogue halts are
      // ever stacked.
      rollbackStackRef.current.push({
        execState: execStateRef.current,
        internalIndex: internalIndexRef.current,
        stepId: timelineRef.current[execStateRef.current.currentStepIndex]?.id ?? '',
      });
      if (rollbackStackRef.current.length > MAX_ROLLBACK_DEPTH) {
        rollbackStackRef.current.shift();
      }

      isHaltedRef.current = false;
      internalIndexRef.current = internalIndexRef.current + 1;
      processNext();
    } finally {
      advanceGuardRef.current = false;
    }
  }, [isTyping, sceneState.currentChoices, processNext, updateExecutorState]);

  const rollback = useCallback(() => {
    const snapshot = rollbackStackRef.current.pop();
    if (!snapshot) return;
    if (timelineRef.current[snapshot.execState.currentStepIndex]?.id !== snapshot.stepId) {
      rollbackStackRef.current = [];
      return;
    }
    // Snapshots are always halted states (advance() only stacks when leaving
    // a halt), so restoring one re-arms the same yield point: the executor
    // waits for the player exactly as it did the first time. Variables,
    // dialogue history, and audio-facing state travel with the snapshot.
    internalIndexRef.current = snapshot.internalIndex;
    isHaltedRef.current = true;
    commitExecutorState(snapshot.execState);
  }, [commitExecutorState]);

  const selectChoice = useCallback((optionId: string) => {
    const currentChoices = execStateRef.current.sceneState.currentChoices;
    if (!currentChoices || currentChoices.length === 0) return;

    const selected = currentChoices.find((o) => o.id === optionId);
    if (!selected) return;

    isHaltedRef.current = false;
    internalIndexRef.current = internalIndexRef.current + 1;
    updateExecutorState((prev) => ({
      ...prev,
      sceneState: {
        ...prev.sceneState,
        variables: evaluateVariable(prev.sceneState.variables, '_last_choice', 'set', optionId),
        currentChoices: null,
        isTransitioning: true,
        transitionTarget: selected.targetSceneId,
        // A choice without an explicit target falls back to the scene's next connection.
        transitionMode: selected.targetSceneId ? 'scene' : 'next',
      },
      canAdvance: false,
      currentStepIndex: internalIndexRef.current,
    }));
  }, [updateExecutorState]);

  return {
    sceneState,
    currentStepIndex,
    isComplete,
    isTyping,
    canAdvance,
    // Every push/pop is paired with a state commit, so this reads fresh on
    // the render that follows each stack change.
    canRollback: rollbackStackRef.current.length > 0,
    advance,
    rollback,
    selectChoice,
  };
}
