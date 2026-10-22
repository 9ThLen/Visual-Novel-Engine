/**
 * The comic frame's document, and the messages that cross into and out of it.
 *
 * One document for every platform: the web and the desktop shell put it in an
 * iframe's srcdoc, Android in a WebView's html source. It holds no story — the
 * host sends the strip after the frame says it is ready — so the same document
 * could be cached once and reused for every scene.
 *
 * Both directions carry a session token. On the web the host also checks the
 * message's origin and that it came from its own frame's window (as
 * PlateWebViewEditor.web.tsx does); a WebView's onMessage has neither, so there
 * the token is what tells the frame's messages from a page it was navigated to.
 */
import { jsonForScript } from '@/lib/vn-plate-editor/embedded-utils';

import { COMIC_RENDERER_SCRIPT } from './comic-renderer-script';
import type { ComicSpikePage } from './spike-page-plan';

export const COMIC_FRAME_SOURCE = 'vne-comic-frame';
export const COMIC_HOST_SOURCE = 'vne-comic-host';

export interface ComicRendererFont {
  family: string;
  /** `data:font/ttf;base64,…` — the only kind accepted, so the frame never fetches a font. */
  dataUri: string;
}

export interface ComicRendererBoot {
  token: string;
  /**
   * The origin the frame addresses its messages to. Left out, or "null" (a
   * host opened from file://), the frame falls back to "*". Unused in a
   * WebView, which posts through `ReactNativeWebView`.
   */
  hostOrigin?: string;
  /** Multiplies every text size in the frame; the host passes the reader's font scale. */
  textScale: number;
  /** Release pages that scroll far away, so their images can be freed. */
  virtualize: boolean;
  /** Screens above and below the viewport whose pages are kept built. */
  keepScreens: number;
  font?: ComicRendererFont;
}

export interface ComicSpikeStrip {
  pages: ComicSpikePage[];
  /** Image key → URL the frame can load. */
  images: Record<string, string>;
}

export type ComicHostMessage =
  | { type: 'strip'; strip: ComicSpikeStrip }
  | { type: 'scrollTest'; pxPerSecond: number }
  | { type: 'textScale'; scale: number }
  | { type: 'stats' };

export interface ComicFrameStats {
  pages: number;
  livePages: number;
  liveImages: number;
  domNodes: number;
  builds: number;
  releases: number;
  overflowBubbles: number;
  liveBubbles: number;
  failedImages: string[];
  missingImages: string[];
  jsHeapMb: number | null;
  decodedImageMb: number;
  font: { family: string | null; loaded: boolean; latin: boolean; cyrillic: boolean };
  networkRequests: string[];
  textScale: number;
  rootFontPx: number | null;
  viewport: { width: number; height: number; dpr: number };
}

export interface ComicFrameMarks {
  scriptStart: number;
  ready?: number;
  stripReceived?: number;
  firstPageBuilt?: number;
  firstPageImages?: number;
  fontReady?: number;
  firstPagePainted?: number;
}

export interface ComicScrollResult {
  pxPerSecond: number;
  scrollHeight: number;
  durationMs: number;
  frames: number;
  frameMs: { p50: number; p95: number; p99: number; max: number };
  over25ms: number;
  over50ms: number;
  droppedFrames: number;
  /** Frames during which a page in view was not built or had an image still loading. */
  blankFrames: number;
  maxLivePages: number;
  maxLiveImages: number;
  builds: number;
  releases: number;
  jsHeapMb: { start: number | null; peak: number | null; end: number | null };
}

export type ComicFrameMessage =
  | { type: 'ready'; marks: ComicFrameMarks }
  | {
    type: 'firstPage';
    marks: ComicFrameMarks;
    /** Wall clock at the first paint, to compare with the host's own clock. */
    paintedAtEpochMs: number;
    imagesOnFirstPage: number;
    stats: ComicFrameStats;
  }
  | { type: 'scrollResult'; result: ComicScrollResult; stats: ComicFrameStats }
  | { type: 'stats'; stats: ComicFrameStats }
  | { type: 'error'; message: string };

export type ComicFrameEnvelope = ComicFrameMessage & { source: typeof COMIC_FRAME_SOURCE; token: string };
export type ComicHostEnvelope = ComicHostMessage & { source: typeof COMIC_HOST_SOURCE; token: string };

const FONT_DATA_URI = /^data:font\/(ttf|otf|woff2?);base64,[A-Za-z0-9+/]+=*$/;
const FONT_FAMILY = /^[A-Za-z0-9 _-]{1,64}$/;

/**
 * Accepts a frame message only if it is shaped like one and carries this
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
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<ComicFrameEnvelope>;
  if (envelope.source !== COMIC_FRAME_SOURCE || envelope.token !== token || typeof envelope.type !== 'string') return null;
  return envelope as ComicFrameMessage;
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

/*
 * The frame's own policy. It can only narrow what the host page allows — a
 * srcdoc document inherits its parent's policy as well — and it states the
 * spike's offline claims as rules: no fetch or XHR at all, fonts only from
 * data: URIs. Images may come from wherever the host serves them: the web
 * origin, blob: and data: URLs, file:// inside an Android build, and the
 * desktop shell's tauri:/asset: schemes.
 */
const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'font-src data:',
  'img-src * data: blob: file: tauri: asset:',
  "connect-src 'none'",
].join('; ');

const STYLES = `
:root {
  --text-scale: 1;
  --bubble-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --caption-font: Georgia, 'Times New Roman', serif;
  color-scheme: dark;
}
html, body { margin: 0; padding: 0; background: #141417; }
body {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  overscroll-behavior: contain;
  -webkit-tap-highlight-color: transparent;
}
#strip { max-width: 760px; margin: 0 auto; padding: 8px 0 30vh; }
.page {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / var(--aspect, 1.45);
  margin: 0 0 14px;
  background: #f3eee4;
  contain: layout paint style;
}
.panel {
  position: absolute;
  overflow: hidden;
  box-sizing: border-box;
  border: 3px solid #121212;
  background: #2a2a30;
}
.art { position: absolute; inset: 0; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sprite { position: absolute; width: auto; transform: translateX(-50%); }
.sprite.flip { transform: translateX(-50%) scaleX(-1); }
.missing { display: none; }
.tails { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.tails polygon, .tails circle { fill: #fff; stroke: #121212; stroke-width: 2; }
.bubbles { position: absolute; inset: 0; }
.bubble {
  position: absolute;
  box-sizing: border-box;
  width: max-content;
  padding: 0.4em 0.7em;
  background: #fff;
  color: #121212;
  border: 2px solid #121212;
  border-radius: 1.1em;
  font: calc(15px * var(--text-scale)) / 1.22 var(--bubble-font);
  overflow-wrap: break-word;
}
.bubble.thought { border-radius: 2em; border-style: dashed; }
.bubble.shout { font-weight: 800; letter-spacing: 0.02em; border-width: 3px; border-radius: 0.35em; transform: rotate(-1.5deg); }
.bubble.caption { background: #fff3c4; border-radius: 0; font-family: var(--caption-font); font-style: italic; }
.bubble .speaker {
  display: block;
  font: 700 0.62em/1.3 system-ui, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.6;
}
.bubble.overflow { outline: 3px solid #e5484d; outline-offset: 1px; }
`;

/*
 * The font's own :root rule must come after STYLES, whose :root sets the
 * default --bubble-font: in one style sheet the later rule wins, and the first
 * Android build drew every bubble in Roboto with the embedded font loaded.
 */
export function createComicRendererHtml(boot: ComicRendererBoot): string {
  const font = boot.font && FONT_DATA_URI.test(boot.font.dataUri) && FONT_FAMILY.test(boot.font.family)
    ? boot.font
    : undefined;
  const fontFace = font
    ? `@font-face { font-family: '${font.family}'; src: url(${font.dataUri}) format('${font.dataUri.startsWith('data:font/woff2') ? 'woff2' : font.dataUri.startsWith('data:font/woff') ? 'woff' : 'truetype'}'); font-display: block; }
:root { --bubble-font: '${font.family}', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }`
    : '';
  const frameBoot = {
    token: boot.token,
    hostOrigin: boot.hostOrigin,
    textScale: boot.textScale,
    virtualize: boot.virtualize,
    keepScreens: boot.keepScreens,
    fontFamily: font?.family ?? null,
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${STYLES}${fontFace}</style>
</head>
<body>
  <main id="strip" aria-label="Comic"></main>
  <script>window.__VNE_COMIC_BOOT = ${jsonForScript(frameBoot)};</script>
  <script>${COMIC_RENDERER_SCRIPT}</script>
</body>
</html>`;
}
