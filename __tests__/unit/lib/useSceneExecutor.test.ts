import { act, renderHook, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

import { createEffectStep } from '@/lib/engine/event-factory';
import { SCENE_BOUND_END_TIME } from '@/lib/engine/effect-duration';

describe('useSceneExecutor', () => {
  it('stays advanceable after text typing is completed so the next tap can continue', async () => {
    const timeline: TimelineStep[] = [
      { id: 'step-1', blockType: 'text', data: { content: 'First line', typewriterSpeed: 0.5, anchorTo: 'background' }, collapsed: false, enabled: true } as TimelineStep,
      { id: 'step-2', blockType: 'transition', data: { targetSceneId: 'scene-2', transitionType: 'fade', duration: 0.4 }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.isTyping).toBe(true);
      expect(result.current.canAdvance).toBe(true);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.isTyping).toBe(false);
      expect(result.current.canAdvance).toBe(true);
      expect(result.current.currentStepIndex).toBe(0);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.canAdvance).toBe(true);
      expect(result.current.sceneState.isTransitioning).toBe(false);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionTarget).toBe('scene-2');
    });
  });

  it('sets last choice variable and transition target when a choice is selected', async () => {
    const timeline: TimelineStep[] = [
      { id: 'choice-1', blockType: 'choice', data: { options: [
        { id: 'choice-a', text: 'Go A', targetSceneId: 'scene-a' },
        { id: 'choice-b', text: 'Go B', targetSceneId: null },
      ] }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.currentChoices?.length).toBe(2);
      expect(result.current.canAdvance).toBe(false);
    });

    act(() => {
      result.current.selectChoice('choice-a');
    });

    await waitFor(() => {
      expect(result.current.sceneState.currentChoices).toBeNull();
      expect(result.current.sceneState.variables._last_choice).toBe('choice-a');
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionTarget).toBe('scene-a');
    });
  });

  it('halts on transition blocks without transitioning until the player confirms', async () => {
    const timeline: TimelineStep[] = [
      { id: 'transition-1', blockType: 'transition', data: { targetSceneId: 'scene-2', transitionType: 'fade', duration: 0.4 }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.canAdvance).toBe(true);
      expect(result.current.sceneState.isTransitioning).toBe(false);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionTarget).toBe('scene-2');
    });
  });

  it('ignores a duplicate advance() call after a transition is already confirmed', async () => {
    // Regression test: RN Web can dispatch a press twice for a single tap.
    // A stray second advance() call right after the transition-confirming
    // one used to fall through to the "move to next step" path (since
    // isHaltedRef was never cleared), pushing the internal index past the
    // end of the timeline and marking the executor spuriously "complete" —
    // which fired a second, competing transition.
    const timeline: TimelineStep[] = [
      { id: 'transition-1', blockType: 'transition', data: { targetSceneId: 'scene-2', transitionType: 'fade', duration: 0.4 }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.canAdvance).toBe(true);
    });

    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
    });

    act(() => {
      result.current.advance();
    });

    expect(result.current.isComplete).toBe(false);
    expect(result.current.sceneState.transitionTarget).toBe('scene-2');
  });

  it('skips disabled and condition-false steps', async () => {
    const disabled = { id: 'disabled', blockType: 'text' as const, data: { content: 'Disabled', typewriterSpeed: 0.5, anchorTo: 'background' as const }, collapsed: false, enabled: false };
    const conditionFalse: TimelineStep = {
      id: 'condition-false', blockType: 'text', data: { content: 'Condition false', typewriterSpeed: 0.5, anchorTo: 'background' }, collapsed: false, enabled: true,
      conditions: [{ variableName: 'flag', operator: '==', value: true }],
    } as TimelineStep;
    const visible = { id: 'visible', blockType: 'text' as const, data: { content: 'Visible', typewriterSpeed: 0.5, anchorTo: 'background' as const }, collapsed: false, enabled: true };
    const timeline: TimelineStep[] = [disabled, conditionFalse, visible] as TimelineStep[];

    const { result } = renderHook(() => useSceneExecutor(
      timeline,
      { initialVariables: { flag: false } },
    ));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(2);
      expect(result.current.isTyping).toBe(true);
      expect(result.current.canAdvance).toBe(true);
    });
  });

  it('evaluates step conditions against seeded initial variables', async () => {
    const visible: TimelineStep = {
      id: 'condition-true',
      blockType: 'text',
      data: { content: 'Visible from saved state', typewriterSpeed: 0.5, anchorTo: 'background' },
      collapsed: false,
      enabled: true,
      conditions: [{ variableName: 'flag', operator: '==', value: true }],
    } as TimelineStep;
    const fallback = {
      id: 'fallback',
      blockType: 'text' as const,
      data: { content: 'Fallback', typewriterSpeed: 0.5, anchorTo: 'background' as const },
      collapsed: false,
      enabled: true,
    };

    const { result } = renderHook(() => useSceneExecutor(
      [visible, fallback] as TimelineStep[],
      { initialVariables: { flag: true } },
    ));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.sceneState.variables.flag).toBe(true);
      expect(result.current.isTyping).toBe(true);
    });
  });

  it('resets when middle step data changes without changing first or last id', async () => {
    const makeTimeline = (content: string): TimelineStep[] => [
      { id: 'background-1', blockType: 'background', data: { assetId: 'bg-1', transition: 'fade', duration: 500 }, collapsed: false, enabled: true } as TimelineStep,
      { id: 'text-1', blockType: 'text', data: { content, typewriterSpeed: 0.5, anchorTo: 'background' }, collapsed: false, enabled: true } as TimelineStep,
      { id: 'transition-1', blockType: 'transition', data: { targetSceneId: 'scene-2', transitionType: 'fade', duration: 0.4 }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result, rerender } = renderHook(
      ({ timeline }) => useSceneExecutor(timeline),
      { initialProps: { timeline: makeTimeline('Old text') } },
    );

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.isTyping).toBe(true);
    });

    act(() => {
      result.current.advance();
    });
    act(() => {
      result.current.advance();
    });
    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.sceneState.isTransitioning).toBe(true);
    });

    rerender({ timeline: makeTimeline('New text') });

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.isTyping).toBe(true);
      expect(result.current.sceneState.isTransitioning).toBe(false);
    });
  });

  it('marks a final text-only timeline complete after typing and advancing past it', async () => {
    const timeline: TimelineStep[] = [
      { id: 'text-1', blockType: 'text', data: { content: 'The end', typewriterSpeed: 0.5, anchorTo: 'background' }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.isTyping).toBe(true);
      expect(result.current.isComplete).toBe(false);
    });

    act(() => {
      result.current.advance();
    });
    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true);
      expect(result.current.canAdvance).toBe(false);
    });
  });

  it('executes sound, camera, and interactive object blocks into scene state', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'sound-1',
        blockType: 'sound',
        data: {
          mode: 'track',
          assetId: 'sfx-door',
          volume: 0.5,
          loop: false,
          fadeIn: 0,
          fadeOut: 0.8,
          pitchVariation: 0.2,
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'camera-1',
        blockType: 'camera',
        data: { action: 'pan', panX: 15, panY: -5, zoomLevel: 1.4, duration: 0.6, easing: 'ease-out' },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'object-1',
        blockType: 'interactive_object',
        data: {
          objectId: 'door',
          name: 'Door',
          assetId: 'door-image',
          position: { x: 40, y: 30, width: 20, height: 40 },
          actions: [{ type: 'scene_transition', targetSceneId: 'hall' }],
          oneTimeOnly: true,
          pulseAnimation: false,
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.soundEvents?.[0]).toMatchObject({
        assetId: 'sfx-door',
        mode: 'track',
        volume: 0.5,
      });
      expect(result.current.sceneState.cameraState).toMatchObject({
        action: 'pan',
        panX: 15,
        panY: -5,
        zoomLevel: 1.4,
      });
      expect(result.current.sceneState.interactiveObjects?.[0]).toMatchObject({
        id: 'door',
        imageUri: 'door-image',
        oneTimeOnly: true,
      });
    });
  });

  it('passes effect intensity, target, fade, and weather options into active effects', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'effect-rain',
        blockType: 'effect',
        data: {
          effectType: 'rain',
          target: 'background',
          characterId: 'char-masha',
          intensity: 72,
          duration: 4,
          fadeIn: 0.5,
          fadeOut: 0.75,
          rain: {
            variant: 'storm',
            color: '#9fd7ff',
            opacity: 0.6,
            density: 120,
            speed: 2.4,
            wind: 12,
            angle: -10,
            dropLength: 32,
            dropWidth: 2,
            splash: true,
            lightning: true,
          },
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'effect-snow',
        blockType: 'effect',
        data: {
          effectType: 'snow',
          target: 'screen',
          intensity: 35,
          duration: 3,
          snow: {
            color: '#ffffff',
            snowflakeCount: 90,
            radius: [0.5, 2.5],
            speed: [0.6, 1.8],
            wind: [-0.5, 1],
            changeFrequency: 160,
            rotationSpeed: [-1, 1],
            opacity: [0.5, 0.9],
            enable3DRotation: true,
            imageUris: ['file://flake.png'],
          },
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'effect-fog',
        blockType: 'effect',
        data: {
          effectType: 'fog',
          target: 'screen',
          intensity: 40,
          duration: 8,
          fog: {
            variant: 'dense',
          },
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeEffects).toHaveLength(3);
      expect(result.current.sceneState.activeEffects[0]).toMatchObject({
        effectType: 'rain',
        target: 'background',
        characterId: 'char-masha',
        intensity: 72,
        fadeIn: 0.5,
        fadeOut: 0.75,
        rain: {
          variant: 'storm',
          density: 120,
          splash: true,
          lightning: true,
        },
      });
      expect(result.current.sceneState.activeEffects[1]).toMatchObject({
        effectType: 'snow',
        target: 'screen',
        intensity: 35,
        snow: {
          snowflakeCount: 90,
          enable3DRotation: true,
          imageUris: ['file://flake.png'],
        },
      });
      expect(result.current.sceneState.activeEffects[2]).toMatchObject({
        effectType: 'fog',
        target: 'screen',
        fog: {
          variant: 'dense',
        },
      });
    });
  });

  it('normalizes zero and invalid effect durations before activating effects', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'effect-rain-zero-duration',
        blockType: 'effect',
        data: {
          effectType: 'rain',
          target: 'screen',
          intensity: 60,
          duration: 0,
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'effect-flash-invalid-duration',
        blockType: 'effect',
        data: {
          effectType: 'flash',
          target: 'screen',
          intensity: 80,
          duration: Number.NaN,
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeEffects).toHaveLength(2);
    });

    const [rain, flash] = result.current.sceneState.activeEffects;
    expect(rain).toMatchObject({
      durationMode: 'scene',
      sceneBound: true,
      endTime: SCENE_BOUND_END_TIME,
    });
    expect(flash.endTime - flash.startTime).toBe(350);
  });

  it('supports explicitly timed weather effects', async () => {
    const timeline = [
      createEffectStep({
        effectType: 'rain',
        target: 'screen',
        intensity: 60,
        duration: 3,
        durationMode: 'timed',
      }),
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeEffects).toHaveLength(1);
    });

    const [rain] = result.current.sceneState.activeEffects;
    expect(rain.sceneBound).toBe(false);
    expect(rain.durationMode).toBe('timed');
    expect(rain.endTime - rain.startTime).toBe(3000);
  });

  it('keeps choices interactive when rain runs before a choice block', async () => {
    const timeline: TimelineStep[] = [
      createEffectStep({
        effectType: 'rain',
        target: 'screen',
        intensity: 60,
      }),
      {
        id: 'choice-after-rain',
        blockType: 'choice',
        data: {
          options: [
            { id: 'stay', text: 'Stay', targetSceneId: null },
            { id: 'go', text: 'Go', targetSceneId: 'scene-next' },
          ],
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeEffects[0]).toMatchObject({
        effectType: 'rain',
        target: 'screen',
      });
      expect(result.current.sceneState.currentChoices).toHaveLength(2);
      expect(result.current.canAdvance).toBe(false);
      expect(result.current.isComplete).toBe(false);
    });
  });

  it('preloads blocking weather immediately after dialogue while the dialogue is displayed', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'dialogue-before-snow',
        blockType: 'dialogue',
        data: {
          currentEntryIndex: 0,
          entries: [
            {
              id: 'entry-before-snow',
              characterId: 'narrator',
              speakerName: 'Narrator',
              spriteId: '',
              text: 'Snow starts here.',
            },
          ],
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      createEffectStep({
        effectType: 'snow',
        target: 'screen',
        intensity: 70,
        snow: { snowflakeCount: 96 },
      }),
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.isComplete).toBe(false);
      expect(result.current.sceneState.activeEffects).toHaveLength(1);
      expect(result.current.sceneState.activeEffects[0]).toMatchObject({
        effectType: 'snow',
        target: 'screen',
        snow: { snowflakeCount: 96 },
      });
    });
  });

  it('does not preload short effects after dialogue', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'dialogue-before-flash',
        blockType: 'dialogue',
        data: {
          currentEntryIndex: 0,
          entries: [
            {
              id: 'entry-before-flash',
              characterId: 'narrator',
              speakerName: 'Narrator',
              spriteId: '',
              text: 'Flash happens after this line.',
            },
          ],
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      createEffectStep({
        effectType: 'flash',
        target: 'screen',
        intensity: 90,
      }),
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.sceneState.activeEffects).toHaveLength(0);
    });
  });

  it('does not replay a preloaded weather effect on advance', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'dialogue-before-rain',
        blockType: 'dialogue',
        data: {
          currentEntryIndex: 0,
          entries: [
            {
              id: 'entry-before-rain',
              characterId: 'narrator',
              speakerName: 'Narrator',
              spriteId: '',
              text: 'Rain starts now.',
            },
          ],
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      createEffectStep({
        effectType: 'rain',
        target: 'screen',
        intensity: 60,
        rain: { density: 120 },
      }),
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.activeEffects).toHaveLength(1);
    });

    act(() => {
      result.current.advance();
    });
    act(() => {
      result.current.advance();
    });

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true);
      expect(result.current.sceneState.activeEffects.filter((effect) => effect.effectType === 'rain')).toHaveLength(1);
    });
  });

  it('creates weather effect steps with scene-bound defaults', () => {
    const rainStep = createEffectStep({ effectType: 'rain' });
    const fogStep = createEffectStep({ effectType: 'fog' });
    const timedRainStep = createEffectStep({ effectType: 'rain', duration: 3 });
    const blurStep = createEffectStep({ effectType: 'blur' });
    const shakeStep = createEffectStep();

    expect(rainStep.data).toMatchObject({
      effectType: 'rain',
      duration: 8,
      durationMode: 'scene',
    });
    expect(fogStep.data).toMatchObject({
      effectType: 'fog',
      duration: 8,
      durationMode: 'scene',
    });
    expect(timedRainStep.data).toMatchObject({
      effectType: 'rain',
      duration: 3,
      durationMode: 'timed',
    });
    expect(blurStep.data).toMatchObject({
      effectType: 'blur',
      duration: 0.8,
      durationMode: 'timed',
    });
    expect(shakeStep.data).toMatchObject({
      effectType: 'shake',
      duration: 0.8,
      durationMode: 'timed',
    });
  });

  it('applies character action steps without replaying show semantics for sprite and move changes', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'char-show',
        blockType: 'character',
        data: { characterId: 'masha', spriteId: 'sprite-happy', action: 'show', position: 'left' },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'char-sprite',
        blockType: 'character',
        data: { characterId: 'masha', spriteId: 'sprite-sad', action: 'change_sprite' },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'char-move',
        blockType: 'character',
        data: { characterId: 'masha', action: 'move', position: 'right' },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
      {
        id: 'text',
        blockType: 'text',
        data: { content: 'pause', typewriterSpeed: 0.5, anchorTo: 'background' },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.characters).toHaveLength(1);
      expect(result.current.sceneState.characters[0]).toMatchObject({
        characterId: 'masha',
        spriteId: 'sprite-sad',
        position: 'right',
        visible: true,
      });
    });
  });

  it('tracks active dialogue speaker focus using display name separately from character id', async () => {
    const timeline: TimelineStep[] = [
      {
        id: 'dialogue',
        blockType: 'dialogue',
        data: {
          currentEntryIndex: 0,
          speakerFocus: { characterId: 'char-masha', enabled: true, scale: 1.08, dimOthers: true },
          entries: [
            {
              id: 'entry-1',
              characterId: 'char-masha',
              speakerName: 'Маша',
              spriteId: 'sprite-masha',
              text: 'Привіт',
            },
          ],
        },
        collapsed: false,
        enabled: true,
      } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.dialogueHistory[0]).toMatchObject({
        characterId: 'char-masha',
        characterName: 'Маша',
        text: 'Привіт',
      });
      expect(result.current.sceneState.activeSpeakerCharacterId).toBe('char-masha');
      expect(result.current.sceneState.activeSpeakerFocusScale).toBe(1.08);
      expect(result.current.sceneState.dimNonSpeakerCharacters).toBe(true);
    });
  });

  it('limits dialogue history to the most recent 500 entries', async () => {
    const timeline: TimelineStep[] = Array.from({ length: 501 }, (_, index) => ({
      id: `dialogue-${index}`,
      blockType: 'dialogue',
      data: {
        currentEntryIndex: 0,
        entries: [
          {
            id: `entry-${index}`,
            characterId: 'narrator',
            speakerName: 'Narrator',
            text: `Line ${index}`,
          },
        ],
      },
      collapsed: false,
      enabled: true,
    } as TimelineStep));

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.sceneState.dialogueHistory).toHaveLength(1);
    });

    for (let index = 1; index < 501; index++) {
      act(() => {
        result.current.advance();
      });
      act(() => {
        result.current.advance();
      });
    }

    await waitFor(() => {
      expect(result.current.sceneState.dialogueHistory).toHaveLength(500);
      expect(result.current.sceneState.dialogueHistory[0]).toMatchObject({
        text: 'Line 1',
      });
      expect(result.current.sceneState.dialogueHistory[499]).toMatchObject({
        text: 'Line 500',
      });
    });
  });
});
