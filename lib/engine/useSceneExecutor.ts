import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { TimelineStep, SceneState, BackgroundBlockData, CharacterBlockData, DialogueBlockData, ChoiceBlockData, EffectBlockData, MusicBlockData, VariableBlockData, TransitionBlockData } from './types';
import { createEmptySceneState, conditionsMet } from './conditionUtils';

const YIELDING_BLOCK_TYPES = new Set(['text', 'dialogue', 'choice', 'transition']);

interface ExecutorState {
  sceneState: SceneState;
  currentStepIndex: number;
  isTyping: boolean;
  canAdvance: boolean;
}

export interface UseSceneExecutorOptions {
  initialVariables?: Record<string, string | number | boolean>;
}

export interface UseSceneExecutorReturn {
  sceneState: SceneState;
  currentStepIndex: number;
  isComplete: boolean;
  isTyping: boolean;
  canAdvance: boolean;
  advance: () => void;
  selectChoice: (optionId: string) => void;
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function evaluateVariable(
  variables: Record<string, string | number | boolean>,
  varName: string,
  operation: 'set' | 'add' | 'subtract' | 'multiply' | 'toggle',
  value: string | number | boolean,
): Record<string, string | number | boolean> {
  if (RESERVED_KEYS.has(varName)) {
    console.warn('[useSceneExecutor] attempted to set reserved variable key:', varName);
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
  const [execState, setExecState] = useState<ExecutorState>(() => ({
    sceneState: {
      ...createEmptySceneState(),
      variables: options?.initialVariables ?? {},
    },
    currentStepIndex: 0,
    isTyping: false,
    canAdvance: false,
  }));

  const internalIndexRef = useRef(0);
  const isHaltedRef = useRef(false);
  const timelineRef = useRef(timeline);
  const advanceGuardRef = useRef(false);
  const initialVariablesRef = useRef(options?.initialVariables);

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
          const existingIdx = nextState.characters.findIndex((c) => c.characterId === d.characterId);
          const charState = {
            characterId: d.characterId,
            spriteId: d.spriteId,
            position: d.position,
            visible: true,
            opacity: 1,
            scale: 1,
            zIndex: 1,
          };
          if (existingIdx >= 0) {
            const nextChars = [...nextState.characters];
            nextChars[existingIdx] = charState;
            nextState.characters = nextChars;
          } else {
            nextState.characters = [...nextState.characters, charState];
          }
          break;
        }
        case 'text':
        case 'dialogue': {
          if (step.blockType === 'dialogue') {
            const d = step.data as DialogueBlockData;
            const entry = d.entries?.[d.currentEntryIndex ?? 0];
            if (entry) {
              nextState.dialogueHistory = [
                ...nextState.dialogueHistory,
                {
                  characterId: entry.characterId,
                  characterName: entry.characterId,
                  text: entry.text,
                  timestamp: Date.now(),
                },
              ];
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
          nextState.activeEffects = [
            ...nextState.activeEffects,
            {
              effectType: d.effectType,
              target: d.target,
              startTime: now,
              endTime: now + d.duration * 1000,
            },
          ];
          break;
        }
        case 'music': {
          const d = step.data as MusicBlockData;
          nextState.musicTrackId = d.assetId;
          nextState.musicPlaying = d.action === 'play';
          nextState.musicVolume = d.volume;
          break;
        }
        case 'sound':
          if (__DEV__) console.warn('[useSceneExecutor] no-op block type: sound', step.id);
          break;
        case 'camera':
          if (__DEV__) console.warn('[useSceneExecutor] no-op block type: camera', step.id);
          break;
        case 'variable': {
          const d = step.data as VariableBlockData;
          nextState.variables = evaluateVariable(nextState.variables, d.variableName, d.operation, d.value);
          break;
        }
        case 'transition': {
          nextState.isTransitioning = true;
          nextState.transitionTarget = (step.data as TransitionBlockData).targetSceneId;
          break;
        }
        case 'interactive_object':
          if (__DEV__) console.warn('[useSceneExecutor] no-op block type: interactive_object', step.id);
          break;
      }
    } catch (err) {
      console.warn('[useSceneExecutor] executeStep: failed to process step', step.blockType, step.id, err);
      return { nextState: currentState, result: 'continue' };
    }

    const yielding = YIELDING_BLOCK_TYPES.has(step.blockType);
    return { nextState, result: yielding ? 'halt' : 'continue' };
  }, []);

  const processNext = useCallback(() => {
    const steps = timelineRef.current;

    setExecState((prev) => {
      let currentState: SceneState = { ...prev.sceneState, currentChoices: null };
      let idx = internalIndexRef.current;

      while (idx < steps.length) {
        const step = steps[idx];
        const { nextState, result } = executeStep(step, currentState);
        currentState = nextState;

        if (result === 'halt') {
          internalIndexRef.current = idx;
          isHaltedRef.current = true;
          const typing = step.blockType === 'text' || step.blockType === 'dialogue';
          return {
            ...prev,
            sceneState: currentState,
            currentStepIndex: idx,
            isTyping: typing,
            canAdvance: step.blockType !== 'choice',
          };
        }

        idx++;
      }

      internalIndexRef.current = idx;
      isHaltedRef.current = false;
      return {
        ...prev,
        sceneState: currentState,
        isTyping: false,
        canAdvance: false,
      };
    });
  }, [executeStep]);

  useEffect(() => {
    internalIndexRef.current = 0;
    isHaltedRef.current = false;
    advanceGuardRef.current = false;
    setExecState({
      sceneState: {
        ...createEmptySceneState(),
        variables: initialVariablesRef.current ?? {},
      },
      currentStepIndex: 0,
      isTyping: false,
      canAdvance: false,
    });
    try {
      processNext();
    } catch (e) {
      console.warn('[useSceneExecutor] processNext error:', e);
    }

  }, [timelineKey, processNext]);

  const advance = useCallback(() => {
    if (advanceGuardRef.current) return;
    advanceGuardRef.current = true;
    try {
      if (isTyping) {
        setExecState((prev) => ({ ...prev, isTyping: false, canAdvance: true }));
        return;
      }

      if (sceneState.currentChoices) {
        return;
      }

      if (!isHaltedRef.current) {
        return;
      }

      isHaltedRef.current = false;
      internalIndexRef.current = internalIndexRef.current + 1;
      processNext();
    } finally {
      advanceGuardRef.current = false;
    }
  }, [isTyping, sceneState.currentChoices, processNext]);

  const selectChoice = useCallback((optionId: string) => {
    const currentChoices = sceneState.currentChoices;
    if (!currentChoices || currentChoices.length === 0) return;

    const selected = currentChoices.find((o) => o.id === optionId);
    if (!selected) return;

    isHaltedRef.current = false;
    internalIndexRef.current = internalIndexRef.current + 1;
    setExecState((prev) => ({
      ...prev,
      sceneState: {
        ...prev.sceneState,
        variables: evaluateVariable(prev.sceneState.variables, '_last_choice', 'set', optionId),
        currentChoices: null,
        isTransitioning: true,
        transitionTarget: selected.targetSceneId,
      },
      canAdvance: false,
      currentStepIndex: internalIndexRef.current,
    }));
  }, [sceneState.currentChoices]);

  return {
    sceneState,
    currentStepIndex,
    isComplete,
    isTyping,
    canAdvance,
    advance,
    selectChoice,
  };
}
