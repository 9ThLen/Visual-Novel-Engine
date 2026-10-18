/**
 * The editor's side of telling the assistant where the author is.
 *
 * Reads, in one pass of the frame, the scene's text, the selection in it, and
 * whether the frame still held edits nobody had heard of. When asked to save,
 * it saves that very text — so the selection is addressed against exactly the
 * content it was made in, and a line typed a moment before sending is neither
 * lost nor left behind.
 *
 * Kept free of React so the order of those steps can be tested: the document
 * editor only supplies its frames, its dirty state and its save.
 */
import type { EditorContextCaptureOutcome } from '@/lib/ai/editor-context-capture';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';

export interface CapturedFrame {
  scene: DocumentScene;
  characters: Character[];
  /** The scene as the frame serialized it, which is what a selection's part numbers count against. */
  rawScene: DocumentScene;
  selection: VNPlateSelectionState | null;
  hasUnreportedChanges: boolean;
}

export interface CaptureEditorContextDeps {
  /** Scenes in the open document, in order. */
  documentSceneIds: string[];
  /** The scene in view, used when the author has pointed at nothing. */
  activeSceneId: string;
  /** What a frame of this story last reported, with the scene it came from. */
  reported: (VNPlateSelectionState & { sceneId: string }) | null;
  /** The author closed the chip on what was reported. */
  dismissed: boolean;
  /** The live frame of a scene; undefined once it has scrolled out of the mounted range. */
  frameFor: (sceneId: string) => { capture: () => Promise<CapturedFrame> } | undefined;
  hasUnsavedScenes: () => boolean;
  /** A save that is already running, started without what this capture is about to read. */
  saveInFlight: () => Promise<unknown> | null;
  /** Hands the editor the edits a frame had not reported yet. */
  adoptDraft: (snapshot: { scene: DocumentScene; characters: Character[] }) => void;
  /** Saves the document; the named scene was just captured and must not be read from its frame again. */
  save: (alreadyCapturedSceneId?: string) => Promise<boolean>;
}

export async function captureEditorContext(
  deps: CaptureEditorContextDeps,
  options: { save: boolean },
): Promise<EditorContextCaptureOutcome> {
  // Let it finish, so the save below is the only writer of what gets captured.
  const running = deps.saveInFlight();
  if (running) await running;

  const reported = deps.reported && deps.documentSceneIds.includes(deps.reported.sceneId) ? deps.reported : null;
  // A dismissed selection stays selected in the frame, but it is not what this
  // message is about — and neither is the scene it happens to sit in.
  const pointed = reported && !deps.dismissed ? reported : null;
  const sceneId = pointed?.sceneId ?? deps.activeSceneId;
  const frame = deps.frameFor(sceneId);

  let document: DocumentScene | null = null;
  let selection: VNPlateSelectionState | null = pointed;
  let heldUnreportedEdits = false;
  if (frame) {
    let captured: CapturedFrame;
    try {
      captured = await frame.capture();
    } catch {
      // Mounted but silent: its text cannot be vouched for, exactly as in a save.
      return { ok: false };
    }
    document = captured.rawScene;
    selection = reported && deps.dismissed ? null : captured.selection;
    heldUnreportedEdits = captured.hasUnreportedChanges;
    if (heldUnreportedEdits) deps.adoptDraft({ scene: captured.scene, characters: captured.characters });
  }

  const hasUnsavedChanges = heldUnreportedEdits || deps.hasUnsavedScenes();
  if (options.save && hasUnsavedChanges && !(await deps.save(frame ? sceneId : undefined))) return { ok: false };

  return {
    ok: true,
    capture: {
      sceneId,
      sceneSource: selection ? 'selection' : 'scroll',
      document,
      selection,
      hasUnsavedChanges: !options.save && hasUnsavedChanges,
      activePathSceneIds: deps.documentSceneIds,
    },
  };
}
