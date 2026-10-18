import {
  captureEditorContext,
  type CaptureEditorContextDeps,
  type CapturedFrame,
} from '@/lib/document-editor/capture-editor-context';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';

const documentOf = (sceneId: string, content = 'Дощ.'): DocumentScene => ({
  sceneId,
  sceneName: sceneId,
  blocks: [{ id: `${sceneId}_text`, kind: 'text', content }],
});

function selectionIn(sceneId: string, seq = 1): VNPlateSelectionState & { sceneId: string } {
  return {
    sceneId,
    seq,
    collapsed: false,
    text: 'Дощ',
    textLength: 3,
    truncated: false,
    before: '',
    after: '.',
    crossesChip: false,
    blocks: [{ id: `${sceneId}_text`, kind: 'text', quote: 'Дощ', occurrence: 0 }],
  };
}

/** A scripted editor: what its frames answer, and a log of what it was asked to do. */
function editor(overrides: Partial<CaptureEditorContextDeps> & { frames?: Record<string, Partial<CapturedFrame> | 'silent'> } = {}) {
  const log: string[] = [];
  const { frames = { scene_a: {}, scene_b: {} }, ...rest } = overrides;
  const deps: CaptureEditorContextDeps = {
    documentSceneIds: ['scene_a', 'scene_b'],
    activeSceneId: 'scene_a',
    reported: null,
    dismissed: false,
    frameFor: (sceneId) => {
      const frame = frames[sceneId];
      if (!frame) return undefined;
      return {
        capture: async () => {
          log.push(`capture ${sceneId}`);
          if (frame === 'silent') throw new Error('frame did not respond');
          return {
            scene: documentOf(sceneId),
            characters: [],
            rawScene: documentOf(sceneId),
            selection: null,
            hasUnreportedChanges: false,
            ...frame,
          };
        },
      };
    },
    hasUnsavedScenes: () => false,
    saveInFlight: () => null,
    adoptDraft: (snapshot) => { log.push(`adopt ${snapshot.scene.sceneId}`); },
    save: async (alreadyCapturedSceneId) => {
      log.push(`save skipping ${alreadyCapturedSceneId ?? 'nothing'}`);
      return true;
    },
    ...rest,
  };
  return { deps, log };
}

describe('captureEditorContext', () => {
  it('reads the scene the author pointed at, not the one scrolled into view', async () => {
    const fresh = selectionIn('scene_b', 7);
    const { deps, log } = editor({ reported: selectionIn('scene_b'), frames: { scene_a: {}, scene_b: { selection: fresh } } });

    const outcome = await captureEditorContext(deps, { save: true });

    expect(log).toEqual(['capture scene_b']);
    expect(outcome).toMatchObject({ ok: true, capture: { sceneId: 'scene_b', sceneSource: 'selection', selection: { seq: 7 } } });
  });

  it('falls back to the scene in view when nothing is pointed at', async () => {
    const { deps } = editor();

    const outcome = await captureEditorContext(deps, { save: true });

    expect(outcome).toMatchObject({
      ok: true,
      capture: { sceneId: 'scene_a', sceneSource: 'scroll', selection: null, activePathSceneIds: ['scene_a', 'scene_b'] },
    });
  });

  // The whole point of one capture: the text that gets saved is the text the
  // selection was read from. Asking the frame again could return a later one.
  it('saves the very text it captured, without reading that frame a second time', async () => {
    const { deps, log } = editor({
      reported: selectionIn('scene_a'),
      frames: { scene_a: { hasUnreportedChanges: true, selection: selectionIn('scene_a') } },
    });

    const outcome = await captureEditorContext(deps, { save: true });

    expect(log).toEqual(['capture scene_a', 'adopt scene_a', 'save skipping scene_a']);
    expect(outcome).toMatchObject({ ok: true, capture: { hasUnsavedChanges: false } });
  });

  it('saves a draft the editor already knew about, even when the frame held nothing newer', async () => {
    const { deps, log } = editor({ hasUnsavedScenes: () => true });

    await captureEditorContext(deps, { save: true });

    expect(log).toEqual(['capture scene_a', 'save skipping scene_a']);
  });

  // Saving a clean document still rewrites its records, and the revision the
  // assistant is about to be handed would be stale before it arrived.
  it('does not save a document that has nothing unsaved', async () => {
    const { deps, log } = editor({ reported: selectionIn('scene_a') });

    await captureEditorContext(deps, { save: true });

    expect(log).toEqual(['capture scene_a']);
  });

  it('fails when a mounted frame does not answer, and saves nothing', async () => {
    const { deps, log } = editor({ hasUnsavedScenes: () => true, frames: { scene_a: 'silent' } });

    await expect(captureEditorContext(deps, { save: true })).resolves.toEqual({ ok: false });
    expect(log).toEqual(['capture scene_a']);
  });

  it('fails when the save fails', async () => {
    const { deps } = editor({ hasUnsavedScenes: () => true, save: async () => false });

    await expect(captureEditorContext(deps, { save: true })).resolves.toEqual({ ok: false });
  });

  // Not an error: the scene scrolled out of the mounted range. Its selection
  // is what the frame last said, only with no document to address it by.
  it('goes by what a frame last reported once that frame has scrolled away', async () => {
    const reported = selectionIn('scene_b');
    const { deps, log } = editor({ reported, hasUnsavedScenes: () => true, frames: { scene_a: {} } });

    const outcome = await captureEditorContext(deps, { save: true });

    expect(log).toEqual(['save skipping nothing']);
    expect(outcome).toMatchObject({ ok: true, capture: { sceneId: 'scene_b', document: null, selection: { seq: reported.seq } } });
  });

  it('leaves out a selection the author dismissed, and the scene it sits in', async () => {
    const { deps, log } = editor({
      reported: selectionIn('scene_b'),
      dismissed: true,
      frames: { scene_a: { selection: selectionIn('scene_a') }, scene_b: {} },
    });

    const outcome = await captureEditorContext(deps, { save: true });

    expect(log).toEqual(['capture scene_a']);
    expect(outcome).toMatchObject({ ok: true, capture: { sceneId: 'scene_a', sceneSource: 'scroll', selection: null } });
  });

  it('ignores a selection reported from a scene that is no longer in the document', async () => {
    const { deps } = editor({ reported: selectionIn('scene_gone') });

    const outcome = await captureEditorContext(deps, { save: true });

    expect(outcome).toMatchObject({ ok: true, capture: { sceneId: 'scene_a', sceneSource: 'scroll' } });
  });

  it('never saves when only asked to look, and says what it saw is unsaved', async () => {
    const { deps, log } = editor({ frames: { scene_a: { hasUnreportedChanges: true } } });

    const outcome = await captureEditorContext(deps, { save: false });

    expect(log).toEqual(['capture scene_a', 'adopt scene_a']);
    expect(outcome).toMatchObject({ ok: true, capture: { hasUnsavedChanges: true } });
  });

  it('waits for a save already running before it reads anything', async () => {
    let finish!: () => void;
    const running = new Promise<void>((resolve) => { finish = resolve; });
    const { deps, log } = editor({ saveInFlight: () => running });

    const pending = captureEditorContext(deps, { save: true });
    await Promise.resolve();
    expect(log).toEqual([]);

    finish();
    await pending;
    expect(log).toEqual(['capture scene_a']);
  });
});
