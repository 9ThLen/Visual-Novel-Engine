/**
 * Stage 1 of the comic plan (docs/plans/COMIC-MODE-PLAN.md, 9.2): the shape a
 * renderer is handed, and a hard-coded strip to hand it.
 *
 * This is the spike's stand-in for `ComicPagePlan`, not the real one. The real
 * plan comes from `comic-layout.ts` in stage 2 and is built from a scene's
 * timeline; here every page is written out by index arithmetic, so the same
 * call always gives the same strip and a measurement can be repeated. What the
 * spike needs from it is only what a renderer must cope with: panels cut from
 * a page, a background framed by a camera, sprites, and text that has to fit.
 *
 * Every position is a fraction — of the page for a panel, of the panel for
 * everything inside it — so a page is drawn the same at any width, as a printed
 * page would be. Images are named by key; the host decides what each key is
 * served from (an http URL on the web, a file:// one inside an Android build).
 */

/** A rectangle in fractions of its parent, origin top-left. */
export interface ComicSpikeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComicSpikeBackground {
  image: string;
  /** The point the camera holds still while it zooms, in fractions of the panel. */
  focusX: number;
  focusY: number;
  /** 1 is the whole picture covering the panel; 2 is twice as close. */
  zoom: number;
}

export interface ComicSpikeSprite {
  image: string;
  /** Horizontal centre of the sprite. */
  x: number;
  /** Bottom edge, measured up from the panel's bottom. */
  bottom: number;
  /** Height, as a fraction of the panel's height. */
  height: number;
  flip?: boolean;
}

export type ComicSpikeBubbleKind = 'speech' | 'thought' | 'shout' | 'caption';

export interface ComicSpikeBubble {
  id: string;
  kind: ComicSpikeBubbleKind;
  text: string;
  speaker?: string;
  /** Top-left corner of the bubble. */
  x: number;
  y: number;
  /** Widest the bubble may grow before its text wraps. */
  maxWidth: number;
  /** What the tail points at — usually a speaker's mouth. Captions have none. */
  tail?: { x: number; y: number };
}

export interface ComicSpikePanel {
  id: string;
  rect: ComicSpikeRect;
  background: ComicSpikeBackground;
  sprites: ComicSpikeSprite[];
  bubbles: ComicSpikeBubble[];
}

export interface ComicSpikePage {
  id: string;
  /** Height over width. */
  aspect: number;
  panels: ComicSpikePanel[];
}

/** The image keys the spike strip draws from; the host maps each to a URL. */
export const SPIKE_BACKGROUND_KEYS = [
  'bg-ancient-library',
  'bg-grand-hall',
  'bg-hall-mirrors',
  'bg-museum-entrance',
  'bg-treasure-chamber',
  'bg-upper-library',
] as const;

export const SPIKE_SPRITE_KEYS = [
  'char-librarian',
  'char-guide',
  'char-reflection',
  'char-demo-curator',
] as const;

export const SPIKE_IMAGE_KEYS: readonly string[] = [...SPIKE_BACKGROUND_KEYS, ...SPIKE_SPRITE_KEYS];

const SPEAKERS = ['Librarian', 'Guide', 'Reflection', 'Curator'] as const;

/*
 * Written for the spike. The Ukrainian lines are there on purpose: a bubble
 * font that has no Cyrillic falls back mid-strip, and the spike has to see it.
 */
const LINES = [
  'The library was older than the city that grew around it.',
  'Тут хтось є?',
  'Keep your voice down. The shelves are listening.',
  'Я шукаю книгу, якої немає в каталозі.',
  'Then you are already in the wrong wing.',
  'Every door here opens onto another reading room.',
  'Чому свічки горять, якщо нікого немає?',
  'Because someone is always halfway through a chapter.',
  'STOP! Do not touch that ledger!',
  'Вона знову змінила кінець історії…',
  'Night fell, and the reading lamps lit themselves one by one.',
  'Who wrote my name in the margin?',
] as const;

type Template = readonly ComicSpikeRect[];

const GUTTER = 0.02;
const g = GUTTER;

/*
 * Page cuts the plan names in section 6: "1+2", "3 stacked", "2+1", a grid of
 * four, and a splash. Real pages will come from comic-layout.ts; these only
 * have to vary enough that the strip is not one page repeated.
 */
const TEMPLATES: readonly Template[] = [
  [
    { x: g, y: g, w: 1 - 2 * g, h: 0.42 },
    { x: g, y: 0.42 + 2 * g, w: 0.5 - 1.5 * g, h: 0.56 - 3 * g },
    { x: 0.5 + 0.5 * g, y: 0.42 + 2 * g, w: 0.5 - 1.5 * g, h: 0.56 - 3 * g },
  ],
  [
    { x: g, y: g, w: 1 - 2 * g, h: 1 / 3 - 4 * g / 3 },
    { x: g, y: 1 / 3 + g / 3, w: 1 - 2 * g, h: 1 / 3 - 4 * g / 3 },
    { x: g, y: 2 / 3 - g / 3, w: 1 - 2 * g, h: 1 / 3 - 4 * g / 3 },
  ],
  [
    { x: g, y: g, w: 0.5 - 1.5 * g, h: 0.5 - 1.5 * g },
    { x: 0.5 + 0.5 * g, y: g, w: 0.5 - 1.5 * g, h: 0.5 - 1.5 * g },
    { x: g, y: 0.5 + 0.5 * g, w: 1 - 2 * g, h: 0.5 - 1.5 * g },
  ],
  [
    { x: g, y: g, w: 0.5 - 1.5 * g, h: 0.5 - 1.5 * g },
    { x: 0.5 + 0.5 * g, y: g, w: 0.5 - 1.5 * g, h: 0.5 - 1.5 * g },
    { x: g, y: 0.5 + 0.5 * g, w: 0.5 - 1.5 * g, h: 0.5 - 1.5 * g },
    { x: 0.5 + 0.5 * g, y: 0.5 + 0.5 * g, w: 0.5 - 1.5 * g, h: 0.5 - 1.5 * g },
  ],
  [
    { x: g, y: g, w: 1 - 2 * g, h: 0.7 },
    { x: g, y: 0.7 + 2 * g, w: 1 - 2 * g, h: 0.3 - 3 * g },
  ],
];

/** Wide, medium, close — the framings section 4 allows, as zoom levels. */
const SHOTS = [1, 1.45, 2.1] as const;

export const SPIKE_PAGE_ASPECT = 1.45;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildPanel(pageIndex: number, panelIndex: number, rect: ComicSpikeRect, lineCursor: { next: number }): ComicSpikePanel {
  const seed = pageIndex * 7 + panelIndex * 3;
  const shot = SHOTS[seed % SHOTS.length];
  const castSize = seed % 4 === 0 ? 0 : seed % 4 === 3 ? 2 : 1;
  const sprites: ComicSpikeSprite[] = [];
  for (let i = 0; i < castSize; i += 1) {
    const spriteIndex = (pageIndex + panelIndex + i) % SPIKE_SPRITE_KEYS.length;
    sprites.push({
      image: SPIKE_SPRITE_KEYS[spriteIndex],
      x: castSize === 1 ? 0.62 : i === 0 ? 0.28 : 0.74,
      bottom: shot > 1.5 ? -0.35 : 0,
      height: round(Math.min(1.6, 0.82 * shot)),
      flip: i === 1,
    });
  }

  const bubbles: ComicSpikeBubble[] = [];
  const takeLine = () => {
    const line = LINES[lineCursor.next % LINES.length];
    lineCursor.next += 1;
    return line;
  };
  if (castSize === 0 || panelIndex === 0) {
    bubbles.push({
      id: `p${pageIndex}-k${panelIndex}-caption`,
      kind: 'caption',
      text: takeLine(),
      x: 0.03,
      y: 0.04,
      maxWidth: 0.7,
    });
  }
  sprites.forEach((sprite, i) => {
    const kind = (seed + i) % 9 === 8 ? 'shout' : (seed + i) % 5 === 4 ? 'thought' : 'speech';
    const spriteIndex = SPIKE_SPRITE_KEYS.indexOf(sprite.image as (typeof SPIKE_SPRITE_KEYS)[number]);
    const leftSide = sprite.x < 0.5;
    bubbles.push({
      id: `p${pageIndex}-k${panelIndex}-b${i}`,
      kind,
      text: takeLine(),
      speaker: SPEAKERS[spriteIndex],
      x: leftSide ? 0.04 : 0.36,
      y: bubbles.length > 0 ? 0.3 : 0.08,
      maxWidth: 0.58,
      tail: { x: sprite.x, y: round(Math.max(0.35, 0.72 - sprite.height * 0.3)) },
    });
  });

  return {
    id: `p${pageIndex}-k${panelIndex}`,
    rect: { x: round(rect.x), y: round(rect.y), w: round(rect.w), h: round(rect.h) },
    background: {
      image: SPIKE_BACKGROUND_KEYS[(pageIndex + panelIndex) % SPIKE_BACKGROUND_KEYS.length],
      focusX: sprites.length > 0 ? sprites[0].x : 0.5,
      focusY: shot > 1.5 ? 0.35 : 0.5,
      zoom: shot,
    },
    sprites,
    bubbles,
  };
}

/**
 * `pageCount` pages, the same every time. The plan asks for a long strip of
 * 20 or more; 24 is the spike's default.
 */
export function buildSpikeStrip(pageCount = 24): ComicSpikePage[] {
  const lineCursor = { next: 0 };
  const pages: ComicSpikePage[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const template = TEMPLATES[pageIndex % TEMPLATES.length];
    pages.push({
      id: `page-${pageIndex + 1}`,
      aspect: SPIKE_PAGE_ASPECT,
      panels: template.map((rect, panelIndex) => buildPanel(pageIndex, panelIndex, rect, lineCursor)),
    });
  }
  return pages;
}
