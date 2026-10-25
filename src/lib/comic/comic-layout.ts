/**
 * The panels of a scene, in reading order: stage 2 of the comic plan
 * (docs/plans/COMIC-MODE-PLAN.md, sections 4.2–4.5 and 5.1).
 *
 * One generator, two ways in. The editor's Preview draws the author's plan:
 * every step of the scene in order, with what each one leaves on screen worked
 * out by walking the steps (`authorComicStops`). The reader draws what was
 * read: the stops the scene's executor made, each with a snapshot of the
 * screen at the time, so a step run twice by a `goto` is two stops and two
 * panels, and a step never run is none. Either way the generator sees only
 * stops (`buildComicPagePlan`).
 *
 * A panel is one picture. A narration sentence opens a panel of its own, and
 * nothing joins it, so a paragraph's end always ends its panel. Up to two lines
 * of dialogue share a panel while the picture stays the same; a new background,
 * a character coming on, or any other change to what is on screen opens the
 * next one. A panel is opened by the element that needs it, so a panel nothing
 * is put into — its step not run, its line without words — never appears.
 *
 * The shot is simple and the same every time: the whole stage, with the cast on
 * a third, for narration; a medium shot or a close-up of the one who speaks;
 * both speakers when two talk in one panel; and the author's own camera, when
 * it is anywhere but at rest, over all of these.
 *
 * The author's edits of the panels go over everything above (stage 3,
 * comic-settings.ts): ✂ opens a panel with a line, × keeps the panel before it
 * open for the line instead, and a panel's shot, focus and size and a line's
 * kind of bubble and tail are the author's where they were set. A scene with
 * no edits is laid out exactly as it was before there were any.
 *
 * Pages are not cut here. Where a page ends depends on how much room the words
 * take at the reader's width and text size, which only the renderer can
 * measure: the spike's fixed cuts lost 16 of 19 bubbles at twice the text size
 * (docs/plans/COMIC-RENDERER-SPIKE.md). Each panel carries the length of its
 * words as a hint. The same stops always give the same plan: no clock, no
 * chance, and keys made only from anchors and execution ids (section 4.5).
 */
import { addressSentences, type ComicAnchor } from '@/lib/comic/comic-anchors';
import { comicCues, comicStepElements, type ComicElement } from '@/lib/comic/comic-script';
import { characterPositionCenterFraction } from '@/lib/character-position';
import { isBlockingEffectType, normalizeEffectDurationMode } from '@/lib/engine/effect-duration';
import type {
  ActiveEffect,
  CameraRuntimeState,
  CharacterRuntimeState,
  RuntimeEffectType,
} from '@/lib/engine/runtime-types';
import type {
  BackgroundBlockData,
  CameraBlockData,
  CharacterBlockData,
  ComicPanelSetting,
  ComicShot,
  EffectBlockData,
  SceneComicSettings,
  StopEffectBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import { hasComicEdits, resolveComicSettings, type ResolvedComicEdits } from '@/lib/comic/comic-settings';

// ── What is on screen at a stop ──────────────────────────────────────────

export type ComicVisibleCharacter = Pick<CharacterRuntimeState, 'characterId' | 'spriteId' | 'position' | 'visible'>;
export type ComicVisibleCamera = Pick<CameraRuntimeState, 'zoomLevel' | 'panX' | 'panY' | 'target'>;
export type ComicVisibleEffect = Pick<
  ActiveEffect,
  'effectType' | 'target' | 'characterId' | 'intensity' | 'durationMode' | 'sceneBound'
>;

/**
 * What is on screen at a stop. The executor's own state is one:
 * `Pick<SceneState, 'backgroundAssetId' | 'characters' | 'cameraState' | 'activeEffects'>`
 * can be passed as it is.
 */
export interface ComicVisibleState {
  backgroundAssetId: string | null;
  characters: readonly ComicVisibleCharacter[];
  cameraState?: ComicVisibleCamera;
  activeEffects: readonly ComicVisibleEffect[];
}

/** A step the scene stopped on, with what was on screen then. */
export interface ComicStop {
  /** Tells two runs of one step apart. The author's plan, which runs every step once, has none. */
  executionId?: string;
  step: TimelineStep;
  state: ComicVisibleState;
}

/** A stop the reader made: one entry of the scene's execution journal. */
export interface ComicExecutedStop extends ComicStop {
  executionId: string;
}

// ── The plan ─────────────────────────────────────────────────────────────

export interface ComicPanelCharacter {
  characterId: string;
  spriteId: string;
  position: string;
  /** Horizontal centre on the stage, as a fraction of its width: where the novel stands them. */
  x: number;
}

/** An effect that stays on screen until it is stopped: rain, snow, fog, or one the author set to last the scene. */
export interface ComicPanelEffect {
  effectType: RuntimeEffectType;
  target: string;
  intensity: number;
  characterId?: string;
}

/** The author's camera, as the novel would hold it. Pan is in the novel's screen points. */
export interface ComicPanelCamera {
  zoomLevel: number;
  panX: number;
  panY: number;
  target?: string;
}

/** What a panel shows: the stage as it was when the panel's first element came up. */
export interface ComicPicture {
  backgroundAssetId: string | null;
  /** The characters on stage, in the order they first came on. */
  characters: ComicPanelCharacter[];
  /** Null when the camera is at rest. */
  camera: ComicPanelCamera | null;
  effects: ComicPanelEffect[];
}

export type { ComicShot };

/** A point, in fractions of the thing it is in, origin top-left. */
export interface ComicPoint {
  x: number;
  y: number;
}

export interface ComicFraming {
  shot: ComicShot;
  /** 1 is the whole stage covering the panel; 2 is twice as close. */
  zoom: number;
  /** The point of the stage the shot is about, in fractions of the stage. */
  subject: ComicPoint;
  /**
   * Where in the panel that point goes, in fractions of the panel. The
   * renderer gives way where it must, so that the stage still covers the panel.
   */
  placement: ComicPoint;
  /** Who the shot is on. */
  characterIds: string[];
}

export type ComicPanelElement = ComicElement & {
  /** The element's key: its anchor, after the execution it is from. */
  id: string;
  executionId?: string;
};

export interface ComicPanel {
  /** The panel's key: its first element's. The same stops give the same keys. */
  id: string;
  /** The first element's anchor: where a setting for the panel is fastened (stage 3). */
  anchor: ComicAnchor;
  picture: ComicPicture;
  framing: ComicFraming;
  /** How wide the author made it; left out, the renderer sizes it. */
  size?: 'full' | 'half';
  elements: ComicPanelElement[];
  /** How many characters of words the panel holds: a hint for where the renderer may cut a page before it measures. */
  textWeight: number;
}

/**
 * A scene as a comic: its panels in reading order, for the renderer to draw
 * and cut into pages. Plain data, so it can be posted to the renderer's frame.
 */
export interface ComicPagePlan {
  panels: ComicPanel[];
}

// ── The author's plan: every step, in order ──────────────────────────────

interface StageState {
  backgroundAssetId: string | null;
  characters: ComicVisibleCharacter[];
  cameraState?: ComicVisibleCamera;
  activeEffects: ComicVisibleEffect[];
}

/**
 * What a step leaves on screen, as the executor (useSceneExecutor.ts) works it
 * out. Only what a picture shows is kept; everything else a step does is the
 * reader's.
 */
function applyStep(state: StageState, step: TimelineStep): StageState {
  switch (step.blockType) {
    case 'background':
      return { ...state, backgroundAssetId: (step.data as BackgroundBlockData).assetId ?? null };
    case 'character': {
      const data = step.data as CharacterBlockData;
      const action = data.action || 'show';
      const index = state.characters.findIndex((character) => character.characterId === data.characterId);
      const existing = index >= 0 ? state.characters[index] : null;
      const characters = [...state.characters];
      if (action === 'hide') {
        if (existing) characters[index] = { ...existing, visible: false };
        return { ...state, characters };
      }
      const next: ComicVisibleCharacter = {
        characterId: data.characterId,
        spriteId: action === 'move' ? existing?.spriteId ?? data.spriteId : data.spriteId || existing?.spriteId || '',
        position: action === 'change_sprite'
          ? existing?.position ?? data.position
          : data.position || existing?.position || 'center',
        visible: true,
      };
      if (existing) characters[index] = next;
      else characters.push(next);
      return { ...state, characters };
    }
    case 'camera': {
      const data = step.data as CameraBlockData;
      if (data.action === 'reset') return { ...state, cameraState: { zoomLevel: 1, panX: 0, panY: 0 } };
      const previous = state.cameraState;
      const target = data.target
        ?? (data.panX === undefined && data.panY === undefined ? previous?.target : undefined);
      return {
        ...state,
        cameraState: {
          zoomLevel: data.zoomLevel ?? previous?.zoomLevel ?? 1,
          panX: data.panX ?? previous?.panX ?? 0,
          panY: data.panY ?? previous?.panY ?? 0,
          ...(target ? { target } : {}),
        },
      };
    }
    case 'effect': {
      const data = step.data as EffectBlockData;
      const durationMode = normalizeEffectDurationMode(data.effectType, data.durationMode, data.duration);
      return {
        ...state,
        activeEffects: [
          ...state.activeEffects,
          {
            effectType: data.effectType,
            target: data.target,
            ...(data.characterId ? { characterId: data.characterId } : {}),
            intensity: data.intensity,
            durationMode,
            sceneBound: durationMode === 'scene',
          },
        ],
      };
    }
    case 'stop_effect': {
      const data = step.data as StopEffectBlockData;
      return {
        ...state,
        activeEffects: state.activeEffects.filter((effect) => {
          const typeMatches = data.effectType === 'all' || effect.effectType === data.effectType;
          const targetMatches = !data.target || data.target === 'all' || effect.target === data.target;
          return !(typeMatches && targetMatches);
        }),
      };
    }
    default:
      return state;
  }
}

function isWordsStep(step: TimelineStep): boolean {
  return step.blockType === 'text' || step.blockType === 'dialogue';
}

function isBlockingEffectStep(step: TimelineStep): boolean {
  return step.blockType === 'effect' && isBlockingEffectType((step.data as EffectBlockData).effectType);
}

/**
 * The author's plan as stops: every step that is switched on, in the order it
 * stands — conditions, `goto` and labels set aside, as the author reads the
 * page — with the screen built up step by step.
 *
 * Rain, snow or fog standing right after a line is already falling while the
 * line is shown, as the novel sets it up ahead; so it is here.
 */
export function authorComicStops(timeline: readonly TimelineStep[]): ComicStop[] {
  const stops: ComicStop[] = [];
  const setUpAhead = new Set<number>();
  let state: StageState = { backgroundAssetId: null, characters: [], activeEffects: [] };
  timeline.forEach((step, index) => {
    if (step.enabled === false || setUpAhead.has(index)) return;
    state = applyStep(state, step);
    if (!isWordsStep(step)) return;
    for (let ahead = index + 1; ahead < timeline.length; ahead += 1) {
      const next = timeline[ahead];
      if (next.enabled === false) continue;
      if (!isBlockingEffectStep(next)) break;
      state = applyStep(state, next);
      setUpAhead.add(ahead);
    }
    stops.push({ step, state });
  });
  return stops;
}

// ── From a screen to a picture ───────────────────────────────────────────

const round = (value: number) => Math.round(value * 1000) / 1000;

function isLasting(effect: ComicVisibleEffect): boolean {
  return effect.sceneBound ?? effect.durationMode === 'scene';
}

function cameraOf(camera: ComicVisibleCamera | undefined): ComicPanelCamera | null {
  if (!camera) return null;
  const zoomLevel = Number.isFinite(camera.zoomLevel) && camera.zoomLevel > 0 ? camera.zoomLevel : 1;
  const panX = Number.isFinite(camera.panX) ? camera.panX : 0;
  const panY = Number.isFinite(camera.panY) ? camera.panY : 0;
  if (zoomLevel === 1 && panX === 0 && panY === 0 && !camera.target) return null;
  return { zoomLevel, panX, panY, ...(camera.target ? { target: camera.target } : {}) };
}

/**
 * The picture a screen gives: who is on stage and where, the lasting effects,
 * the camera. Effects that pass in a moment and when they started are left
 * out, so two stops that look the same give the same picture.
 */
function pictureOf(state: ComicVisibleState): ComicPicture {
  return {
    backgroundAssetId: state.backgroundAssetId ?? null,
    characters: state.characters
      .filter((character) => character.visible !== false)
      .map((character) => ({
        characterId: character.characterId,
        spriteId: character.spriteId ?? '',
        position: character.position,
        x: characterPositionCenterFraction(character.position),
      })),
    camera: cameraOf(state.cameraState),
    effects: state.activeEffects.filter(isLasting).map((effect) => ({
      effectType: effect.effectType,
      target: effect.target,
      intensity: effect.intensity,
      ...(effect.characterId ? { characterId: effect.characterId } : {}),
    })),
  };
}

// ── Framing ──────────────────────────────────────────────────────────────

/** The zoom of each shot: the spike's for wide, medium and close; full and dramatic either side of medium and close. */
const SHOT_ZOOM: Record<ComicShot, number> = { wide: 1, full: 1.2, medium: 1.45, close: 2.1, dramatic: 2.8 };
const MAX_CAMERA_ZOOM = 3;
/** Where a face is taken to be on the stage until a sprite says (`faceAnchor`, a later stage): high, as a standing figure's head is. */
const FACE_Y = 0.3;
/** A line this short is said in close-up; a longer one gets a medium shot, which leaves its bubble room. */
const CLOSE_UP_MAX_CHARS = 40;
/** How much stage either side of two speakers a two-shot keeps. */
const TWO_SHOT_MARGIN = 0.6;
const THIRD = round(1 / 3);
const CENTRE: ComicPoint = { x: 0.5, y: 0.5 };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** The third of the panel on the subject's own side, so the other side is free for words. */
const thirdFor = (x: number) => (x <= 0.5 ? THIRD : round(2 / 3));
const lengthOf = (text: string) => Array.from(text).length;

function shotForZoom(zoom: number): ComicShot {
  if (zoom >= 1.8) return 'close';
  if (zoom >= 1.2) return 'medium';
  return 'wide';
}

function framingOf(picture: ComicPicture, elements: readonly ComicPanelElement[]): ComicFraming {
  const cast = picture.characters;
  const camera = picture.camera;
  if (camera) {
    const zoom = round(clamp(camera.zoomLevel, 1, MAX_CAMERA_ZOOM));
    const target = camera.target ? cast.find((character) => character.characterId === camera.target) : undefined;
    return {
      shot: shotForZoom(zoom),
      zoom,
      subject: target ? { x: target.x, y: FACE_Y } : CENTRE,
      placement: target ? { x: 0.5, y: THIRD } : CENTRE,
      characterIds: target ? [target.characterId] : [],
    };
  }

  const speakers: ComicPanelCharacter[] = [];
  for (const element of elements) {
    if (element.kind !== 'bubble') continue;
    const speaker = cast.find((character) => character.characterId === element.characterId);
    if (speaker && !speakers.includes(speaker)) speakers.push(speaker);
  }

  if (speakers.length === 1) {
    const [speaker] = speakers;
    const words = elements.reduce((sum, element) => sum + lengthOf(element.text), 0);
    const shot: ComicShot = words <= CLOSE_UP_MAX_CHARS ? 'close' : 'medium';
    return {
      shot,
      zoom: SHOT_ZOOM[shot],
      subject: { x: speaker.x, y: FACE_Y },
      placement: { x: thirdFor(speaker.x), y: shot === 'close' ? 0.4 : THIRD },
      characterIds: [speaker.characterId],
    };
  }

  if (speakers.length === 2) {
    const [first, second] = speakers;
    const zoom = round(clamp(1 / (Math.abs(first.x - second.x) + TWO_SHOT_MARGIN), 1, SHOT_ZOOM.medium));
    return {
      shot: shotForZoom(zoom),
      zoom,
      subject: { x: round((first.x + second.x) / 2), y: FACE_Y },
      placement: { x: 0.5, y: THIRD },
      characterIds: [first.characterId, second.characterId],
    };
  }

  // Narration, or a voice from off the stage: the whole stage, with the cast on a third.
  if (!cast.length) return { shot: 'wide', zoom: SHOT_ZOOM.wide, subject: CENTRE, placement: CENTRE, characterIds: [] };
  const middle = round(cast.reduce((sum, character) => sum + character.x, 0) / cast.length);
  return {
    shot: 'wide',
    zoom: SHOT_ZOOM.wide,
    subject: { x: middle, y: FACE_Y },
    placement: { x: thirdFor(middle), y: THIRD },
    characterIds: cast.map((character) => character.characterId),
  };
}

// ── Panels ───────────────────────────────────────────────────────────────

const MAX_LINES_PER_PANEL = 2;

interface OpenPanel {
  picture: ComicPicture;
  /** The picture as text, to tell whether the next element's is the same. */
  pictureKey: string;
  elements: ComicPanelElement[];
}

function joins(panel: OpenPanel, element: ComicPanelElement, pictureKey: string): boolean {
  return element.kind === 'bubble'
    && panel.pictureKey === pictureKey
    && panel.elements.length < MAX_LINES_PER_PANEL
    && panel.elements.every((placed) => placed.kind === 'bubble');
}

/** Whether one of the element's sentences is in `anchors`. */
function touches(element: ComicPanelElement, anchors: ReadonlySet<ComicAnchor>): boolean {
  return anchors.size > 0 && element.sentences.some((sentence) => anchors.has(sentence.anchor));
}

/** The panel's own settings: those fastened to the first of its sentences that has any. */
function panelSettingOf(elements: readonly ComicPanelElement[], edits: ResolvedComicEdits): ComicPanelSetting | undefined {
  if (!edits.panels.size) return undefined;
  for (const element of elements) {
    for (const sentence of element.sentences) {
      const setting = edits.panels.get(sentence.anchor);
      if (setting) return setting;
    }
  }
  return undefined;
}

/** The automatic framing with the author's shot and focus over it. */
function framedBy(auto: ComicFraming, setting: ComicPanelSetting | undefined): ComicFraming {
  if (!setting?.shot && !setting?.focus) return auto;
  return {
    ...auto,
    shot: setting.shot ?? auto.shot,
    zoom: setting.shot ? SHOT_ZOOM[setting.shot] : auto.zoom,
    subject: setting.focus ?? auto.subject,
    // A point the author picked is what the panel is about: it goes in the middle.
    placement: setting.focus ? CENTRE : auto.placement,
  };
}

/** The element with the kind of bubble and the tail the author picked for it. */
function styledBy(element: ComicPanelElement, edits: ResolvedComicEdits): ComicPanelElement {
  if (!edits.elements.size) return element;
  const setting = element.sentences.map((sentence) => edits.elements.get(sentence.anchor)).find(Boolean);
  if (!setting) return element;
  return {
    ...element,
    ...(setting.style ? { style: setting.style } : {}),
    ...(setting.tail && setting.tail !== 'auto' ? { tail: setting.tail } : {}),
  };
}

function closePanel(panel: OpenPanel, edits: ResolvedComicEdits): ComicPanel {
  const [first] = panel.elements;
  const setting = panelSettingOf(panel.elements, edits);
  return {
    id: first.id,
    anchor: first.anchor,
    picture: panel.picture,
    framing: framedBy(framingOf(panel.picture, panel.elements), setting),
    ...(setting?.size && setting.size !== 'auto' ? { size: setting.size } : {}),
    elements: panel.elements,
    textWeight: panel.elements.reduce((sum, element) => sum + lengthOf(element.text), 0),
  };
}

/**
 * The plan for a scene's stops, in their order. `timeline` is the whole scene,
 * which the stops' steps are from: an inline chip goes with a sentence by where
 * it stands in its block, and a step that ran need not be next to it.
 * `settings` are the scene's comic settings; their edits are found in the
 * scene as it is now, and one whose sentence is gone does nothing.
 */
export function buildComicPagePlan(
  timeline: readonly TimelineStep[],
  stops: readonly ComicStop[],
  settings?: SceneComicSettings,
): ComicPagePlan {
  const cues = comicCues(timeline);
  const { edits } = resolveComicSettings(settings, hasComicEdits(settings) ? addressSentences([...timeline]) : []);
  const panels: ComicPanel[] = [];
  const usedIds = new Set<string>();
  // A scene stored with one step twice can address one sentence twice; the
  // second keeps a key of its own.
  const keyFor = (base: string) => {
    let id = base;
    for (let copy = 2; usedIds.has(id); copy += 1) id = `${base}~${copy}`;
    usedIds.add(id);
    return id;
  };
  let open: OpenPanel | null = null;

  for (const stop of stops) {
    const elements = comicStepElements(stop.step, cues);
    if (!elements.length) continue;
    const picture = pictureOf(stop.state);
    const pictureKey = JSON.stringify(picture);
    for (const element of elements) {
      const placed = styledBy({
        ...element,
        id: keyFor(stop.executionId === undefined ? element.anchor : `${stop.executionId}:${element.anchor}`),
        ...(stop.executionId === undefined ? {} : { executionId: stop.executionId }),
      }, edits);
      // ✂ opens a panel, × keeps the open one; both on one line cancel out,
      // and the automatic choice stands.
      const cut = touches(placed, edits.breaks);
      const join = touches(placed, edits.merges);
      if (!open || (cut !== join ? cut : !joins(open, placed, pictureKey))) {
        if (open) panels.push(closePanel(open, edits));
        open = { picture, pictureKey, elements: [] };
      }
      open.elements.push(placed);
    }
  }
  if (open) panels.push(closePanel(open, edits));
  return { panels };
}

/** The author's plan for a scene: every step, in order (the editor's Preview). */
export function buildAuthorComicPlan(timeline: readonly TimelineStep[], settings?: SceneComicSettings): ComicPagePlan {
  return buildComicPagePlan(timeline, authorComicStops(timeline), settings);
}

/** The plan for what was read: the stops of the scene's execution journal, in order (the reader). */
export function buildExecutedComicPlan(
  timeline: readonly TimelineStep[],
  stops: readonly ComicExecutedStop[],
  settings?: SceneComicSettings,
): ComicPagePlan {
  return buildComicPagePlan(timeline, stops, settings);
}
