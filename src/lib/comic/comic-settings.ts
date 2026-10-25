/**
 * The author's edits of a scene's automatic panels (docs/plans/COMIC-MODE-PLAN.md,
 * sections 3, 6 and 8; docs/plans/COMIC-STAGE-3-PLAN.md, 3.1): a new panel
 * here (✂), this panel joined to the one before (×), a panel's shot, focus and
 * size, a line's kind of bubble and the side of its tail.
 *
 * Every edit is fastened to a sentence (comic-anchors.ts). Before it is used,
 * it is found again in the scene as it is now: one whose words are where they
 * were, or moved, or only a little changed, still acts; one whose sentence is
 * gone does not, and waits in Issues to be fastened again or removed. Nothing
 * is fastened anew by guesswork.
 *
 * Plain TypeScript, no React and no store, like the rest of `src/lib/comic/`.
 */
import {
  parseComicAnchor,
  resolveComicAnchor,
  sentencePrint,
  type AddressedSentence,
  type ComicAnchor,
  type ComicAnchored,
} from '@/lib/comic/comic-anchors';
import type {
  ComicElementSetting,
  ComicPanelSetting,
  ComicPanelSize,
  ComicShot,
  ComicTailSide,
  ComicWordsStyle,
  SceneComicSettings,
} from '@/lib/engine/types';

const SHOTS: readonly ComicShot[] = ['wide', 'full', 'medium', 'close', 'dramatic'];
const SIZES: readonly ComicPanelSize[] = ['auto', 'full', 'half'];
const WORDS_STYLES: readonly ComicWordsStyle[] = ['speech', 'shout', 'whisper', 'thought', 'caption'];
const TAIL_SIDES: readonly ComicTailSide[] = ['auto', 'left', 'right'];

/** The edits of a scene's comic settings: everything but how the scene is read. */
export type ComicEdits = Pick<SceneComicSettings, 'breaks' | 'merges' | 'panels' | 'elements'>;

type EditKind = keyof ComicEdits;
const EDIT_KINDS: readonly EditKind[] = ['breaks', 'merges', 'panels', 'elements'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : undefined;
}

function fraction(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

/** The anchor and print of a stored edit, or null when it has no readable anchor. */
function anchoredOf(value: Record<string, unknown>): ComicAnchored | null {
  const { anchor, print } = value;
  if (typeof anchor !== 'string' || !parseComicAnchor(anchor)) return null;
  return typeof print === 'string' ? { anchor, print } : { anchor };
}

function panelSettingOf(value: Record<string, unknown>, anchored: ComicAnchored): ComicPanelSetting | null {
  const shot = oneOf(value.shot, SHOTS);
  const size = oneOf(value.size, SIZES);
  const focus = isRecord(value.focus) ? { x: fraction(value.focus.x), y: fraction(value.focus.y) } : null;
  const setting: ComicPanelSetting = {
    ...anchored,
    ...(shot ? { shot } : {}),
    ...(focus && focus.x !== undefined && focus.y !== undefined ? { focus: { x: focus.x, y: focus.y } } : {}),
    ...(size && size !== 'auto' ? { size } : {}),
  };
  return setting.shot || setting.focus || setting.size ? setting : null;
}

function elementSettingOf(value: Record<string, unknown>, anchored: ComicAnchored): ComicElementSetting | null {
  const style = oneOf(value.style, WORDS_STYLES);
  const tail = oneOf(value.tail, TAIL_SIDES);
  const setting: ComicElementSetting = {
    ...anchored,
    ...(style ? { style } : {}),
    ...(tail && tail !== 'auto' ? { tail } : {}),
  };
  return setting.style || setting.tail ? setting : null;
}

/**
 * A list of edits as it may be kept: an edit with no readable anchor, or one
 * that would change nothing, is left out, and of two edits fastened to one
 * sentence the later stands. Unknown values are "auto".
 */
function sanitizeList<T extends ComicAnchored>(
  value: unknown,
  read: (entry: Record<string, unknown>, anchored: ComicAnchored) => T | null,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const byAnchor = new Map<ComicAnchor, T>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const anchored = anchoredOf(entry);
    if (!anchored) continue;
    const setting = read(entry, anchored);
    if (!setting) continue;
    byAnchor.delete(anchored.anchor);
    byAnchor.set(anchored.anchor, setting);
  }
  return byAnchor.size ? [...byAnchor.values()] : undefined;
}

/** A scene's comic edits as they may be kept, from whatever was stored or imported. */
export function sanitizeComicEdits(value: Record<string, unknown>): ComicEdits {
  const breaks = sanitizeList(value.breaks, (_entry, anchored) => anchored);
  const merges = sanitizeList(value.merges, (_entry, anchored) => anchored);
  const panels = sanitizeList(value.panels, panelSettingOf);
  const elements = sanitizeList(value.elements, elementSettingOf);
  return {
    ...(breaks ? { breaks } : {}),
    ...(merges ? { merges } : {}),
    ...(panels ? { panels } : {}),
    ...(elements ? { elements } : {}),
  };
}

export function hasComicEdits(settings: SceneComicSettings | undefined): boolean {
  return !!settings && EDIT_KINDS.some((kind) => (settings[kind]?.length ?? 0) > 0);
}

/** An edit that does not act as it was made: its sentence is gone, or its words were changed. */
export interface ComicEditNote {
  kind: EditKind;
  /** The edit as it is stored. */
  edit: ComicAnchored;
  /** `changed`: it still acts, on words a little different from the ones it was made on. */
  status: 'changed' | 'detached';
  /** Where a changed edit acts now. */
  anchor?: ComicAnchor;
}

/** The edits that act, each on the sentence it was found at. */
export interface ResolvedComicEdits {
  breaks: ReadonlySet<ComicAnchor>;
  merges: ReadonlySet<ComicAnchor>;
  panels: ReadonlyMap<ComicAnchor, ComicPanelSetting>;
  elements: ReadonlyMap<ComicAnchor, ComicElementSetting>;
}

export interface ComicEditsResolution {
  edits: ResolvedComicEdits;
  notes: ComicEditNote[];
}

const NO_EDITS: ResolvedComicEdits = { breaks: new Set(), merges: new Set(), panels: new Map(), elements: new Map() };

/**
 * Finds every edit of a scene in the scene as it is now. `sentences` comes
 * from `addressSentences` of the scene's timeline: the editor's converted one,
 * or the stored one in the reader and the player, which address alike.
 */
export function resolveComicSettings(settings: SceneComicSettings | undefined, sentences: AddressedSentence[]): ComicEditsResolution {
  if (!hasComicEdits(settings)) return { edits: NO_EDITS, notes: [] };
  const notes: ComicEditNote[] = [];
  const place = (kind: EditKind, edit: ComicAnchored): ComicAnchor | null => {
    const found = resolveComicAnchor(edit, sentences);
    if (found.status === 'detached') {
      notes.push({ kind, edit, status: 'detached' });
      return null;
    }
    if (found.status === 'changed') notes.push({ kind, edit, status: 'changed', anchor: found.anchor });
    return found.anchor;
  };

  const breaks = new Set<ComicAnchor>();
  const merges = new Set<ComicAnchor>();
  const panels = new Map<ComicAnchor, ComicPanelSetting>();
  const elements = new Map<ComicAnchor, ComicElementSetting>();
  for (const edit of settings?.breaks ?? []) {
    const at = place('breaks', edit);
    if (at) breaks.add(at);
  }
  for (const edit of settings?.merges ?? []) {
    const at = place('merges', edit);
    if (at) merges.add(at);
  }
  for (const edit of settings?.panels ?? []) {
    const at = place('panels', edit);
    if (at && !panels.has(at)) panels.set(at, edit);
  }
  for (const edit of settings?.elements ?? []) {
    const at = place('elements', edit);
    if (at && !elements.has(at)) elements.set(at, edit);
  }
  return { edits: { breaks, merges, panels, elements }, notes };
}

/**
 * The settings with every edit whose sentence moved fastened to where it is
 * now, so the next resolution finds it in place. Edits whose words changed or
 * whose sentence is gone are left as they are, for Issues to show. The
 * settings come back as they are when nothing moved.
 */
export function rebindComicSettings<T extends SceneComicSettings | undefined>(settings: T, sentences: AddressedSentence[]): T {
  if (!settings || !hasComicEdits(settings)) return settings;
  let moved = false;
  const rebind = <E extends ComicAnchored>(edit: E): E => {
    const found = resolveComicAnchor(edit, sentences);
    if (found.status !== 'moved') return edit;
    const sentence = sentences.find((candidate) => candidate.anchor === found.anchor);
    moved = true;
    return { ...edit, anchor: found.anchor, ...(sentence ? { print: sentence.print } : {}) };
  };
  const next: SceneComicSettings = { ...settings };
  for (const kind of EDIT_KINDS) {
    const list = settings[kind];
    if (list) (next as Record<EditKind, ComicAnchored[] | undefined>)[kind] = list.map(rebind);
  }
  return moved ? next as T : settings;
}

/** A sentence of the scene as it is now, as a panel or a line holds it. */
export interface ComicEditTarget {
  anchor: ComicAnchor;
  text: string;
}

/** A change to a panel's edit: a value sets it, null puts it back to automatic, left out keeps it. */
export interface ComicPanelChange {
  shot?: ComicShot | null;
  focus?: { x: number; y: number } | null;
  size?: ComicPanelSize | null;
}

/** A change to a line's edit, as for a panel's. */
export interface ComicElementChange {
  style?: ComicWordsStyle | null;
  tail?: ComicTailSide | null;
}

/** The edits of the settings, in a form they can be put back from. */
export function comicEditsOf(settings: SceneComicSettings | undefined): ComicEdits {
  return sanitizeComicEdits({ ...settings });
}

/** The settings with their edits replaced: how the scene is read stays. */
export function withComicEdits(settings: SceneComicSettings | undefined, edits: ComicEdits): SceneComicSettings {
  const presentation = settings?.presentation;
  return { ...(presentation ? { presentation } : {}), ...sanitizeComicEdits({ ...edits }) };
}

/** An edit acting on a panel or a line, and the sentence of it that it acts on. */
interface ActingEdit<T extends ComicAnchored> {
  edit: T;
  at: ComicEditTarget;
}

/** The first of the target's sentences with an edit acting on it, as the plan takes it. */
function actingOn<T extends ComicAnchored>(
  map: ReadonlyMap<ComicAnchor, T>,
  target: readonly ComicEditTarget[],
): ActingEdit<T> | undefined {
  for (const sentence of target) {
    const edit = map.get(sentence.anchor);
    if (edit) return { edit, at: sentence };
  }
  return undefined;
}

/** The edit acting on a panel; `target` is every sentence of the panel, in order. */
export function actingPanelEdit(edits: ResolvedComicEdits, target: readonly ComicEditTarget[]): ComicPanelSetting | undefined {
  return actingOn(edits.panels, target)?.edit;
}

/** The edit acting on a line; `target` is every sentence of the line. */
export function actingElementEdit(edits: ResolvedComicEdits, target: readonly ComicEditTarget[]): ComicElementSetting | undefined {
  return actingOn(edits.elements, target)?.edit;
}

/**
 * The edit acting on the target changed, or a new one made on its first
 * sentence. Either way it is fastened to where its sentence is now, with the
 * words it has now: an author changing it has seen it. A value of null takes
 * a field away.
 */
function withEditOn<T extends ComicAnchored>(
  list: readonly T[] | undefined,
  acting: ActingEdit<T> | undefined,
  target: readonly ComicEditTarget[],
  change: object,
): T[] {
  const at = acting?.at ?? target[0];
  const rest = (list ?? []).filter((edit) => edit !== acting?.edit && edit.anchor !== at.anchor);
  const next: Record<string, unknown> = { ...acting?.edit, anchor: at.anchor, print: sentencePrint(at.text) };
  for (const [key, value] of Object.entries(change)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return [...rest, next as unknown as T];
}

/**
 * The settings with a panel's edit changed. `sentences` addresses the scene as
 * it is now; `target` is every sentence of the panel, in order.
 */
export function withPanelEdit(
  settings: SceneComicSettings | undefined,
  sentences: AddressedSentence[],
  target: readonly ComicEditTarget[],
  change: ComicPanelChange,
): SceneComicSettings | undefined {
  if (!target.length) return settings;
  const acting = actingOn(resolveComicSettings(settings, sentences).edits.panels, target);
  return withComicEdits(settings, { ...comicEditsOf(settings), panels: withEditOn(settings?.panels, acting, target, change) });
}

/** The settings with a line's edit changed; `target` is every sentence of the line. */
export function withElementEdit(
  settings: SceneComicSettings | undefined,
  sentences: AddressedSentence[],
  target: readonly ComicEditTarget[],
  change: ComicElementChange,
): SceneComicSettings | undefined {
  if (!target.length) return settings;
  const acting = actingOn(resolveComicSettings(settings, sentences).edits.elements, target);
  return withComicEdits(settings, { ...comicEditsOf(settings), elements: withEditOn(settings?.elements, acting, target, change) });
}

/**
 * The settings with every panel and line edit acting on a panel taken away:
 * the automatic panel again. Where its panels begin and end (✂ and ×) stays.
 */
export function withoutPanelEdits(
  settings: SceneComicSettings | undefined,
  sentences: AddressedSentence[],
  target: readonly ComicEditTarget[],
): SceneComicSettings | undefined {
  const { edits } = resolveComicSettings(settings, sentences);
  const panels = new Set(target.map((sentence) => edits.panels.get(sentence.anchor)).filter(Boolean));
  const elements = new Set(target.map((sentence) => edits.elements.get(sentence.anchor)).filter(Boolean));
  if (!panels.size && !elements.size) return settings;
  return withComicEdits(settings, {
    ...comicEditsOf(settings),
    panels: settings?.panels?.filter((edit) => !panels.has(edit)),
    elements: settings?.elements?.filter((edit) => !elements.has(edit)),
  });
}
