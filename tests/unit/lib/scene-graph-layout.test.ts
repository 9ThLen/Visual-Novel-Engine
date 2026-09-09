import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { computeSceneGraphLayout } from '@/lib/scene-graph-layout';

function makeChoiceStep(
  id: string,
  options: { id: string; text: string; targetSceneId: string | null }[],
): TimelineStep {
  return {
    id,
    blockType: 'choice',
    data: { options },
    collapsed: false,
    enabled: true,
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

function nodeFor(layout: ReturnType<typeof computeSceneGraphLayout>, id: string) {
  const node = layout.nodes.find((candidate) => candidate.sceneId === id);
  if (!node) throw new Error(`node ${id} missing from layout`);
  return node;
}

describe('computeSceneGraphLayout', () => {
  it('returns an empty layout for an empty story', () => {
    const layout = computeSceneGraphLayout([], null);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it('lays out a linear chain in a single row, one column per scene', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'a', isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      makeScene({ id: 'b', connections: [{ targetSceneId: 'c', outputPort: 'next' }] }),
      makeScene({ id: 'c' }),
    ];
    const layout = computeSceneGraphLayout(scenes, 'a');

    // All in row 0, ascending columns.
    expect(nodeFor(layout, 'a').row).toBe(0);
    expect(nodeFor(layout, 'b').row).toBe(0);
    expect(nodeFor(layout, 'c').row).toBe(0);
    expect(nodeFor(layout, 'a').depth).toBe(0);
    expect(nodeFor(layout, 'b').depth).toBe(1);
    expect(nodeFor(layout, 'c').depth).toBe(2);
    // Strictly increasing x, shared y.
    expect(nodeFor(layout, 'a').x).toBeLessThan(nodeFor(layout, 'b').x);
    expect(nodeFor(layout, 'b').x).toBeLessThan(nodeFor(layout, 'c').x);
    expect(nodeFor(layout, 'a').y).toBe(nodeFor(layout, 'c').y);
    // Start flagged.
    expect(nodeFor(layout, 'a').isStart).toBe(true);
    expect(layout.nodes.every((node) => !node.isUnreachable)).toBe(true);
  });

  it('stacks branching siblings in separate rows of the same column', () => {
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'a',
        isStart: true,
        timeline: [
          makeChoiceStep('choice-1', [
            { id: 'o1', text: 'Left', targetSceneId: 'b' },
            { id: 'o2', text: 'Right', targetSceneId: 'c' },
          ]),
        ],
      }),
      makeScene({ id: 'b' }),
      makeScene({ id: 'c' }),
    ];
    const layout = computeSceneGraphLayout(scenes, 'a');

    const b = nodeFor(layout, 'b');
    const c = nodeFor(layout, 'c');
    // Siblings share the column but occupy different rows / y positions.
    expect(b.depth).toBe(1);
    expect(c.depth).toBe(1);
    expect(b.row).not.toBe(c.row);
    expect(b.y).not.toBe(c.y);
    expect(b.x).toBe(c.x);

    // Choice edges are labeled and marked as choice kind.
    const choiceEdges = layout.edges.filter((edge) => edge.kind === 'choice');
    expect(choiceEdges).toHaveLength(2);
    expect(choiceEdges.map((edge) => edge.label).sort()).toEqual(['Left', 'Right']);
  });

  it('produces a finite layout for a cycle without hanging', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'a', isStart: true, connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      makeScene({ id: 'b', connections: [{ targetSceneId: 'c', outputPort: 'next' }] }),
      makeScene({ id: 'c', connections: [{ targetSceneId: 'a', outputPort: 'next' }] }),
    ];
    const layout = computeSceneGraphLayout(scenes, 'a');

    expect(layout.nodes).toHaveLength(3);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    // Back-edge c -> a keeps a at depth 0 (first discovery wins).
    expect(nodeFor(layout, 'a').depth).toBe(0);
    expect(nodeFor(layout, 'c').depth).toBe(2);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
  });

  it('still positions an unreachable scene and marks it', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'a', isStart: true }),
      makeScene({ id: 'orphan' }),
    ];
    const layout = computeSceneGraphLayout(scenes, 'a');

    const orphan = nodeFor(layout, 'orphan');
    expect(orphan.isUnreachable).toBe(true);
    expect(Number.isFinite(orphan.x)).toBe(true);
    expect(Number.isFinite(orphan.y)).toBe(true);
    expect(nodeFor(layout, 'a').isUnreachable).toBe(false);
  });

  it('is deterministic across repeated runs', () => {
    const scenes: SceneRecord[] = [
      makeScene({
        id: 'a',
        isStart: true,
        connections: [{ targetSceneId: 'b', outputPort: 'next' }],
        timeline: [
          makeChoiceStep('choice-1', [
            { id: 'o1', text: 'Detour', targetSceneId: 'c' },
          ]),
        ],
      }),
      makeScene({ id: 'b' }),
      makeScene({ id: 'c' }),
      makeScene({ id: 'orphan' }),
    ];
    const first = computeSceneGraphLayout(scenes, 'a');
    const second = computeSceneGraphLayout(scenes, 'a');
    expect(second).toEqual(first);
  });

  it('resolves the start scene from isStart when no explicit start id is given', () => {
    const scenes: SceneRecord[] = [
      makeScene({ id: 'a', connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      makeScene({ id: 'b', isStart: true, connections: [{ targetSceneId: 'a', outputPort: 'next' }] }),
    ];
    const layout = computeSceneGraphLayout(scenes, null);
    expect(nodeFor(layout, 'b').isStart).toBe(true);
    expect(nodeFor(layout, 'b').depth).toBe(0);
  });
});
