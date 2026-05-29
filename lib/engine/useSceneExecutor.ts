import { useState, useRef, useCallback, useEffect } from 'react';
import type { TimelineStep, SceneState, BackgroundBlockData, CharacterBlockData, DialogueBlockData, ChoiceBlockData, EffectBlockData, MusicBlockData, VariableBlockData, TransitionBlockData } from './types';
import { createEmptySceneState, conditionsMet } from './conditionUtils';

const YIELDING_BLOCK_TYPES = new Set(['text', 'dialogue', 'choice', 'transition']);

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

function evaluateVariable(
  variables: Record<string, string | number | boolean>,
  varName: string,
  operation: 'set' | 'add' | 'subtract' | 'multiply' | 'toggle',
  value: string | number | boolean,
): Record<string, string | number | boolean> {
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
  const [sceneState, setSceneState] = useState<SceneState>(() => ({
    ...createEmptySceneState(),
    variables: options?.initialVariables ?? {},
  }));
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);

  const internalIndexRef = useRef(0);
  const isHaltedRef = useRef(false);
  const timelineRef = useRef(timeline);
  const advanceGuardRef = useRef(false);
  const initialVariablesRef = useRef(options?.initialVariables);

  timelineRef.current = timeline;
  initialVariablesRef.current = options?.initialVariables;

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
          // Choice always halts processing — steps after a choice in the same
          // timeline are not executed. The caller must handle scene transitions.
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
          break;
        case 'camera':
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
          break;
      }
    } catch {
      return { nextState: currentState, result: 'continue' };
    }

    const yielding = YIELDING_BLOCK_TYPES.has(step.blockType);
    return { nextState, result: yielding ? 'halt' : 'continue' };
  }, []);

  const processNext = useCallback(() => {
    const steps = timelineRef.current;
    let halted = false;
    let haltType: string | undefined;

    setSceneState((prev) => {
      let currentState = prev;
      let idx = internalIndexRef.current;

      while (idx < steps.length) {
        const step = steps[idx];
        const { nextState, result } = executeStep(step, currentState);
        currentState = nextState;

        if (result === 'halt') {
          halted = true;
          haltType = step.blockType;
          internalIndexRef.current = idx;
          return currentState;
        }

        idx++;
      }

      internalIndexRef.current = idx;
      return currentState;
    });

    if (halted && haltType) {
      isHaltedRef.current = true;
      setCurrentStepIndex(internalIndexRef.current);
      if (haltType === 'text' || haltType === 'dialogue') {
        setIsTyping(true);
        setCanAdvance(true);
      } else {
        setCanAdvance(haltType !== 'choice');
      }
    } else {
      isHaltedRef.current = false;
      setCurrentStepIndex(internalIndexRef.current);
      setCanAdvance(false);
    }
  }, [executeStep]);

  useEffect(() => {
    internalIndexRef.current = 0;
    isHaltedRef.current = false;
    advanceGuardRef.current = false;
    setSceneState({
      ...createEmptySceneState(),
      variables: initialVariablesRef.current ?? {},
    });
    setCurrentStepIndex(0);
    setIsTyping(false);
    setCanAdvance(false);
    processNext();
  }, [timeline, processNext]);

  const advance = useCallback(() => {
    if (advanceGuardRef.current) return;
    advanceGuardRef.current = true;
    try {
      if (isTyping) {
        setIsTyping(false);
        // Reader UI finishes visible typing separately, so the next tap still needs
        // to be accepted as a real advance for this halted text/dialogue step.
        setCanAdvance(true);
        return;
      }

      if (sceneState.currentChoices) {
        return;
      }

      if (!isHaltedRef.current) {
        return;
      }

      isHaltedRef.current = false;
      setSceneState((prev) => ({ ...prev, currentChoices: null }));
      internalIndexRef.current = internalIndexRef.current + 1;
      setCurrentStepIndex(internalIndexRef.current);
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

    setSceneState((prev) => ({
      ...prev,
      variables: evaluateVariable(prev.variables, '_last_choice', 'set', optionId),
      currentChoices: null,
      isTransitioning: true,
      transitionTarget: selected.targetSceneId,
    }));

    isHaltedRef.current = false;
    setCanAdvance(false);
    internalIndexRef.current = internalIndexRef.current + 1;
    setCurrentStepIndex(internalIndexRef.current);
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
