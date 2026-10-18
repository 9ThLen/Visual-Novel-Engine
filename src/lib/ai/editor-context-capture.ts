/**
 * What the editor hands the chat when a message is about to go out, and how
 * that becomes the context the assistant reads.
 *
 * The editor owns the frames, so it does the capture: text, selection and
 * "is anything unsaved" come out of one synchronous pass in the frame, and the
 * save — when one is needed — writes that very text. The chat owns the store
 * and the wire, so it does the rest here: pairs the captured selection with
 * the steps the save produced and builds the context.
 */
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { SceneRecord } from '@/lib/engine/types';
import type { VNPlateSelectionState } from '@/lib/vn-plate-editor/types';
import type { AiEditorContext } from './editor-context';
import { buildAiEditorContext, resolveFocusedBlock, resolveSelectionAnchors } from './editor-context-resolver';

export interface EditorContextCapture {
  /** The scene the context is about: the one holding the selection, else the one in view. */
  sceneId: string;
  sceneSource: 'selection' | 'scroll';
  /**
   * The scene as its frame serialized it. Null when the frame is not mounted,
   * and then no address the context gives can be exact.
   */
  document: DocumentScene | null;
  selection: VNPlateSelectionState | null;
  /** The editor still holds content the store does not; only a capture that did not save can say so. */
  hasUnsavedChanges: boolean;
  activePathSceneIds: string[];
}

/** `ok: false` means the open document could not be read or saved; nothing should be sent on top of that. */
export type EditorContextCaptureOutcome =
  | { ok: true; capture: EditorContextCapture }
  | { ok: false };

export type CaptureEditorContext = (options: { save: boolean }) => Promise<EditorContextCaptureOutcome>;

export interface BuildEditorContextFromCaptureInput {
  storyId: string;
  capture: EditorContextCapture;
  kind: AiEditorContext['kind'];
  /** The scene as the store holds it now — after the save the capture made, if it made one. */
  scene: SceneRecord | null;
  characters: Character[];
  snapshotId: string;
  capturedAt: number;
}

export function buildEditorContextFromCapture(input: BuildEditorContextFromCaptureInput): AiEditorContext {
  const { capture, scene } = input;
  const selection = capture.selection;
  const captured = { document: capture.document, characters: input.characters, hasUnsavedChanges: capture.hasUnsavedChanges };
  const anchors = scene && selection ? resolveSelectionAnchors({ scene, ...captured, blocks: selection.blocks }) : [];
  const focus = scene ? resolveFocusedBlock({ scene, ...captured, focus: selection?.focus }) : null;

  return buildAiEditorContext({
    snapshotId: input.snapshotId,
    kind: input.kind,
    storyId: input.storyId,
    scene,
    sceneSource: capture.sceneSource,
    activePathSceneIds: capture.activePathSceneIds,
    hasUnsavedChanges: capture.hasUnsavedChanges,
    selection: scene && selection ? { ...selection, sceneId: capture.sceneId } : null,
    anchors,
    focus,
    capturedAt: input.capturedAt,
  });
}

const LABEL_QUOTE_LIMIT = 80;

export function clipQuote(text: string, limit = LABEL_QUOTE_LIMIT): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * What a context points at, reduced to what a person needs to see. A block
 * whose settings are open is what the author is doing right now, whatever text
 * is still highlighted behind it; otherwise selected text comes first, then a
 * block that is highlighted or was just used. A caret alone points at nothing
 * worth a label.
 */
export type EditorContextPointer =
  | { kind: 'focus'; blockType: string; state: 'editing' | 'selected' | 'recent'; summary: string; exact: boolean }
  | { kind: 'selection'; quote: string; words: number; exact: boolean }
  | { kind: 'none' };

export function describeEditorContextPointer(context: AiEditorContext): EditorContextPointer {
  const selection = context.selection;
  const focus = context.focus;
  const hasText = Boolean(selection && !selection.collapsed && selection.text.trim());
  if (focus && (focus.state === 'editing' || !hasText)) {
    return {
      kind: 'focus',
      blockType: focus.blockType,
      state: focus.state,
      summary: clipQuote(focus.summary ?? ''),
      exact: focus.match === 'exact',
    };
  }
  if (selection && hasText) {
    return {
      kind: 'selection',
      quote: clipQuote(selection.text),
      words: countWords(selection.text),
      exact: selection.anchors.length > 0 && selection.anchors.every((anchor) => anchor.match === 'exact'),
    };
  }
  return { kind: 'none' };
}

/** The same reduction for what the editor reports before anything is sent: what the chip shows. */
export type LiveEditorPointer =
  | { kind: 'focus'; command: string; state: 'editing' | 'selected' | 'recent' }
  | { kind: 'selection'; quote: string; words: number; truncated: boolean }
  | { kind: 'none' };

export function describeLiveEditorPointer(state: VNPlateSelectionState | null): LiveEditorPointer {
  if (!state) return { kind: 'none' };
  const hasText = !state.collapsed && Boolean(state.text.trim());
  if (state.focus && (state.focus.state === 'editing' || !hasText)) {
    return { kind: 'focus', command: state.focus.command || state.focus.kind, state: state.focus.state };
  }
  if (hasText) {
    return { kind: 'selection', quote: clipQuote(state.text), words: countWords(state.text), truncated: state.truncated };
  }
  return { kind: 'none' };
}

const BLOCK_NAME_KEYS: Record<string, string> = {
  background: 'background',
  choice: 'choice',
  transition: 'transition',
  newScene: 'transition',
  effect: 'effect',
  music: 'music',
  sound: 'sound',
  stopEffect: 'stopEffect',
  stop_effect: 'stopEffect',
  camera: 'camera',
  video: 'video',
  variable: 'variable',
  label: 'label',
  goto: 'goto',
  interactive_object: 'interactiveObject',
  character: 'character',
};

/**
 * Translation key for a block's name, from either spelling it arrives in: the
 * editor's command id before sending, the step's block type after.
 */
export function focusBlockNameKey(commandOrBlockType: string): string {
  return `aiChat.context.block.${BLOCK_NAME_KEYS[commandOrBlockType] ?? 'other'}`;
}
