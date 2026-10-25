/**
 * What the comic frame draws, and the messages that cross into and out of it.
 *
 * The frame is one HTML document for every platform (docs/plans/
 * COMIC-RENDERER-SPIKE.md): an iframe's srcdoc on the web and in the desktop
 * shell, a WebView's html source on Android. It is handed a strip — panels in
 * reading order, with every picture already a URL it can load and every word
 * plain text — and it draws it, cuts it into pages by what it measures, and
 * says when the reader taps or picks an option. It decides nothing about the
 * story.
 *
 * Both directions carry a session token. On the web the host also checks the
 * message's origin and that it came from its own frame's window (as
 * PlateWebViewEditor.web.tsx does); a WebView's onMessage has neither, so there
 * the token is what tells the frame's messages from anything else.
 */
import type { ComicWordsStyle } from '@/lib/engine/types';
import { jsonForScript } from '@/lib/json-for-script';

export const COMIC_FRAME_SOURCE = 'vne-comic-frame';
export const COMIC_HOST_SOURCE = 'vne-comic-host';

export interface ComicFrameSprite {
  /** The character's id: the sprite's key in its panel. */
  id: string;
  /** Null until the picture is resolved, or when there is none to draw. */
  url: string | null;
  /** Horizontal centre on the stage, 0–1. */
  x: number;
}

export interface ComicFrameWords {
  /** The element's key; the same words keep the same key between strips. */
  id: string;
  kind: 'caption' | 'bubble';
  text: string;
  /** Over a bubble, who says it. */
  speaker?: string;
  /** Where the speaker stands, 0–1 across the stage: the side a bubble leans to. */
  speakerX?: number;
  /**
   * How the words are drawn, when the author picked another way than their
   * kind's: a caption is a caption box and a bubble is speech when left out.
   * A bubble drawn as a caption box keeps its speaker's name in it.
   */
  style?: ComicWordsStyle;
  /** The side the author turned the bubble to, over its speaker's: where it leans and its tail points. */
  tail?: 'left' | 'right';
}

export interface ComicFramePanel {
  id: string;
  /** Null until the background is resolved, or when the stage has none. */
  background: string | null;
  sprites: ComicFrameSprite[];
  /**
   * How wide the author made the panel. Two half panels one after the other
   * share a row; a half panel alone, and any on a narrow screen, takes the
   * whole width, as a panel left out does.
   */
  size?: 'full' | 'half';
  /** 1 is the whole stage; 2 is twice as close. */
  zoom: number;
  /** The point of the stage the shot is about, in fractions of the stage. */
  focus: { x: number; y: number };
  /**
   * Where in the panel that point goes, in fractions of the panel. The frame
   * gives way where it must, so the stage still covers the panel.
   */
  place: { x: number; y: number };
  words: ComicFrameWords[];
  /**
   * A choice made at the end of an earlier scene of the strip, shown under
   * this panel's words as it was answered: the option taken, the others not,
   * none to press.
   */
  choices?: ComicFrameChoices;
}

export interface ComicFrameChoiceOption {
  id: string;
  text: string;
}

export interface ComicFrameChoices {
  options: ComicFrameChoiceOption[];
  /** The option picked, once it is: the others are then shown as not taken. */
  chosenId: string | null;
}

export interface ComicFrameStrip {
  panels: ComicFramePanel[];
  /** How many panels, from the first, the reader has opened; the rest are not drawn yet. */
  revealed: number;
  /** A choice waiting at the end of the strip, or made there. */
  choices: ComicFrameChoices | null;
  /**
   * Panels may still come after the last one, as they do while the strip is
   * read: a half panel at the end keeps the place beside it for the next,
   * rather than taking the whole width and giving it up when the next comes.
   */
  more?: boolean;
}

export type ComicHostMessage =
  | { type: 'strip'; strip: ComicFrameStrip }
  | { type: 'textScale'; scale: number };

export type ComicFrameMessage =
  | { type: 'ready' }
  /**
   * The reader tapped the strip, or pressed Space or Enter in it: the next
   * panel, please. A tap on a panel names it, which the editor's Preview uses
   * to pick the panel the author edits; the reader does not need it.
   */
  | { type: 'tap'; panelId?: string }
  | { type: 'choose'; optionId: string }
  /** The strip as drawn: how many panels are on screen and how many pages they make. */
  | { type: 'layout'; panels: number; pages: number }
  | { type: 'error'; message: string };

export type ComicFrameEnvelope = ComicFrameMessage & { source: typeof COMIC_FRAME_SOURCE; token: string };
export type ComicHostEnvelope = ComicHostMessage & { source: typeof COMIC_HOST_SOURCE; token: string };

function isFrameMessage(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case 'ready':
      return true;
    case 'tap':
      return value.panelId === undefined || typeof value.panelId === 'string';
    case 'choose':
      return typeof value.optionId === 'string';
    case 'layout':
      return typeof value.panels === 'number' && typeof value.pages === 'number';
    case 'error':
      return typeof value.message === 'string';
    default:
      return false;
  }
}

/**
 * Accepts a frame message only if it is one the frame sends and carries this
 * session's token. Strings are parsed (the WebView bridge sends JSON text).
 */
export function readComicFrameMessage(data: unknown, token: string): ComicFrameMessage | null {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.source !== COMIC_FRAME_SOURCE || envelope.token !== token || !isFrameMessage(envelope)) return null;
  const { source: _source, token: _token, ...message } = envelope;
  return message as unknown as ComicFrameMessage;
}

export function comicHostEnvelope(message: ComicHostMessage, token: string): ComicHostEnvelope {
  return { ...message, source: COMIC_HOST_SOURCE, token };
}

/**
 * The script a WebView host injects to hand the frame a message: the frame
 * exposes `__vneComicReceive` only to a native host.
 */
export function comicInjectionFor(message: ComicHostMessage, token: string): string {
  const json = JSON.stringify(comicHostEnvelope(message, token));
  return `window.__vneComicReceive && window.__vneComicReceive(${jsonForScript(json)});true;`;
}

/** A token nobody can guess from outside the host. */
export function createComicSessionToken(random: () => number = Math.random): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 4 }, () => Math.floor(random() * 0x100000000).toString(16).padStart(8, '0')).join('');
}
