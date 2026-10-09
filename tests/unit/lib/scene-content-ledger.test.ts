import { createSceneContentLedger, sameSceneContent } from '@/lib/document-editor/scene-content-ledger';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

const textStep = (id: string, content: string): TimelineStep => ({
  id, blockType: 'text', collapsed: false, enabled: true,
  data: { content, typewriterSpeed: 30, anchorTo: 'background' },
});

function record(id: string, timeline: TimelineStep[], overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: 'Scene',
    description: '',
    tags: [],
    timeline,
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/** What the store hands back after a write: the same record, newly stamped. */
const stamped = (scene: SceneRecord, updatedAt: number): SceneRecord => ({ ...scene, updatedAt });
/** What a snapshot restore hands back: equal content in brand-new objects. */
const reloaded = (scene: SceneRecord): SceneRecord => JSON.parse(JSON.stringify(scene)) as SceneRecord;

describe('sameSceneContent', () => {
  it('compares what a frame shows, not the objects that carry it', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);

    expect(sameSceneContent(scene, reloaded(scene))).toBe(true);
    expect(sameSceneContent(scene, record('a', [textStep('s1', 'Snow.')]))).toBe(false);
    expect(sameSceneContent(scene, { ...scene, name: 'Renamed' })).toBe(false);
  });
});

describe('scene content ledger', () => {
  it('reports nothing while the store still holds what the editor loaded', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);

    expect(ledger.reconcile([scene])).toEqual([]);
    expect(ledger.reconcile([stamped(scene, 2)])).toEqual([]);
  });

  it('reports a scene somebody else rewrote, once', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const other = record('b', [textStep('s2', 'Fog.')]);
    const ledger = createSceneContentLedger([scene, other]);
    const rewritten = record('a', [textStep('s1', 'Snow.')], { updatedAt: 2 });

    expect(ledger.reconcile([rewritten, other])).toEqual(['a']);
    expect(ledger.reconcile([rewritten, other])).toEqual([]);
  });

  it('does not mistake the echo of its own save for somebody else’s write', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);
    const saved = record('a', [textStep('s1_resaved', 'Rain. And wind.')]);

    ledger.noteWritten([saved]);

    expect(ledger.reconcile([stamped(saved, 2)])).toEqual([]);
  });

  it('recognizes its own save by content when the objects were replaced', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);
    const saved = record('a', [textStep('s1', 'Rain. And wind.')]);

    ledger.noteWritten([saved]);

    expect(ledger.reconcile([reloaded(saved)])).toEqual([]);
  });

  it('reports a write that landed on top of the editor’s own save before either was seen', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);
    const saved = record('a', [textStep('s1', 'Rain. And wind.')]);
    const patched = record('a', [textStep('s1', 'Snow.')], { updatedAt: 3 });

    ledger.noteWritten([saved]);

    expect(ledger.reconcile([patched])).toEqual(['a']);
  });

  // A restored snapshot brings the old timestamp back with the old text, so a
  // comparison by `updatedAt` alone could not tell this from "nothing changed".
  it('reports a rollback to content the editor has shown before', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);
    const patched = record('a', [textStep('s1', 'Snow.')], { updatedAt: 2 });

    expect(ledger.reconcile([patched])).toEqual(['a']);
    expect(ledger.reconcile([reloaded(scene)])).toEqual(['a']);
  });

  it('reports a rename', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);

    expect(ledger.reconcile([{ ...scene, name: 'Storm' }])).toEqual(['a']);
  });

  it('ignores changes a frame never shows', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);
    const rewired: SceneRecord = {
      ...scene,
      connections: [{ targetSceneId: 'b', outputPort: 'next', label: 'Next' }],
      flowX: 360,
      updatedAt: 5,
    };

    expect(ledger.reconcile([rewired])).toEqual([]);
  });

  it('has nothing to say about a scene that has no frame yet', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const ledger = createSceneContentLedger([scene]);
    const added = record('b', [textStep('s2', 'Fog.')]);

    expect(ledger.reconcile([scene, added])).toEqual([]);
  });

  // Leaving the document unmounts the frame, so the scene comes back with a
  // fresh one whatever happened to it meanwhile.
  it('forgets a scene that left the document', () => {
    const scene = record('a', [textStep('s1', 'Rain.')]);
    const other = record('b', [textStep('s2', 'Fog.')]);
    const ledger = createSceneContentLedger([scene, other]);

    expect(ledger.reconcile([scene])).toEqual([]);
    expect(ledger.reconcile([scene, record('b', [textStep('s2', 'Mist.')])])).toEqual([]);
  });
});
