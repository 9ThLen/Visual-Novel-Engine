import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { validateSceneGraph } from '@/lib/document-editor/scene-graph-validator';

function makeChoiceStep(
  id: string,
  options: { id: string; text: string; targetSceneId: string | null }[],
  overrides: Partial<TimelineStep> = {},
): TimelineStep {
  return {
    id,
    blockType: 'choice',
    data: { options },
    collapsed: false,
    enabled: true,
    ...overrides,
  } as TimelineStep;
}

function makeScene(overrides: Partial<SceneRecord> & { id: string }): SceneRecord {
  return {
    storyId: 'story-1',
    name: overrides.id,
    timeline: [],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    description: '',
    tags: [],
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('validateSceneGraph', () => {
  it('returns no issues for an empty scene list', () => {
    expect(validateSceneGraph([])).toEqual([]);
  });

  it('returns no issues for a clean linear graph', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'scene-a', isStart: true, connections: [{ targetSceneId: 'scene-b', outputPort: 'next' }] }),
      makeScene({ id: 'scene-b' }),
    ];
    expect(validateSceneGraph(scenes)).toEqual([]);
  });

  it('reports noStartScene when no scene has isStart, but only when scenes exist', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'scene-a', connections: [{ targetSceneId: 'scene-b', outputPort: 'next' }] }),
      makeScene({ id: 'scene-b' }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues).toContainEqual({ type: 'noStartScene' });
  });

  it('reports danglingChoiceTarget for an enabled choice option pointing to a missing scene', () => {
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'scene-a',
        isStart: true,
        timeline: [
          makeChoiceStep('choice-1', [
            { id: 'opt-1', text: 'Go nowhere', targetSceneId: 'ghost-scene' },
          ]),
        ],
      }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues).toContainEqual({
      type: 'danglingChoiceTarget',
      sceneId: 'scene-a',
      choiceStepId: 'choice-1',
      optionId: 'opt-1',
      targetSceneId: 'ghost-scene',
    });
  });

  it('does not report a dangling choice target for a disabled choice step', () => {
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'scene-a',
        isStart: true,
        timeline: [
          makeChoiceStep(
            'choice-1',
            [{ id: 'opt-1', text: 'Go nowhere', targetSceneId: 'ghost-scene' }],
            { enabled: false },
          ),
        ],
      }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues.some((issue) => issue.type === 'danglingChoiceTarget')).toBe(false);
  });

  it('does not report a dangling target for a null targetSceneId choice option (falls back to next)', () => {
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'scene-a',
        isStart: true,
        connections: [{ targetSceneId: 'scene-b', outputPort: 'next' }],
        timeline: [
          makeChoiceStep('choice-1', [
            { id: 'opt-1', text: 'Continue', targetSceneId: null },
          ]),
        ],
      }),
      makeScene({ id: 'scene-b' }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues).toEqual([]);
  });

  it('reports danglingNextTarget for a next connection pointing to a missing scene', () => {
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'scene-a',
        isStart: true,
        connections: [{ targetSceneId: 'ghost-scene', outputPort: 'next' }],
      }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues).toContainEqual({
      type: 'danglingNextTarget',
      sceneId: 'scene-a',
      targetSceneId: 'ghost-scene',
    });
  });

  it('reports unreachableScene for a scene not reachable from start via any edge', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'scene-a', isStart: true }),
      makeScene({ id: 'scene-orphan' }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues).toContainEqual({ type: 'unreachableScene', sceneId: 'scene-orphan' });
  });

  it('treats every choice option target and every connection as a reachability edge, not just the active path', () => {
    // scene-a's active path (first option) goes to scene-b, but scene-c is
    // still reachable via the second choice option and should not be flagged.
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'scene-a',
        isStart: true,
        timeline: [
          makeChoiceStep('choice-1', [
            { id: 'opt-1', text: 'To B', targetSceneId: 'scene-b' },
            { id: 'opt-2', text: 'To C', targetSceneId: 'scene-c' },
          ]),
        ],
      }),
      makeScene({ id: 'scene-b' }),
      makeScene({ id: 'scene-c' }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues.some((issue) => issue.type === 'unreachableScene')).toBe(false);
  });

  it('falls back to scenes[0] as the start for reachability when no scene has isStart', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'scene-a', connections: [{ targetSceneId: 'scene-b', outputPort: 'next' }] }),
      makeScene({ id: 'scene-b' }),
      makeScene({ id: 'scene-orphan' }),
    ];
    const issues = validateSceneGraph(scenes);
    expect(issues).toContainEqual({ type: 'noStartScene' });
    expect(issues).toContainEqual({ type: 'unreachableScene', sceneId: 'scene-orphan' });
    expect(issues.some((issue) => issue.type === 'unreachableScene' && issue.sceneId === 'scene-b')).toBe(false);
  });
});
