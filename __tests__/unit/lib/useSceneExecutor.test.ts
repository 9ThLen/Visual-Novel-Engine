import { act, renderHook, waitFor } from '@testing-library/react';
import type { TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';

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

  it('halts on transition blocks and exposes the target scene', async () => {
    const timeline: TimelineStep[] = [
      { id: 'transition-1', blockType: 'transition', data: { targetSceneId: 'scene-2', transitionType: 'fade', duration: 0.4 }, collapsed: false, enabled: true } as TimelineStep,
    ];

    const { result } = renderHook(() => useSceneExecutor(timeline));

    await waitFor(() => {
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.canAdvance).toBe(true);
      expect(result.current.sceneState.isTransitioning).toBe(true);
      expect(result.current.sceneState.transitionTarget).toBe('scene-2');
    });
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
        data: { assetId: 'sfx-door', action: 'play', volume: 0.5, loop: false, pitchVariation: 0.2 },
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
        action: 'play',
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
});
