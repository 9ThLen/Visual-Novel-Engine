/**
 * The comic frame's document: one for every platform, holding no story. The
 * host sends the strip once the frame says it is ready.
 *
 * Words are set in the platform's own fonts, which every device has offline
 * and which carry Cyrillic. A comic font of the story's own is a later stage
 * (`comicStyle.bubbleFont`, docs/plans/COMIC-MODE-PLAN.md section 8); it would
 * come as a data: URI checked by the browser's font sanitizer first, as
 * COMIC-RENDERER-SPIKE.md found.
 */
import { jsonForScript } from '@/lib/vn-plate-editor/embedded-utils';

import { COMIC_FRAME_SCRIPT } from './comic-frame-script';

export interface ComicFrameBoot {
  token: string;
  /**
   * The origin the frame addresses its messages to. Left out, or "null" (a
   * host opened from file://), the frame falls back to "*". Unused in a
   * WebView, which posts through `ReactNativeWebView`.
   */
  hostOrigin?: string;
  /** Multiplies every text size in the frame: the reader's font scale. */
  textScale: number;
  /** Screens above and below the viewport whose pictures stay loaded. */
  keepScreens?: number;
}

/*
 * The frame's own policy. It can only narrow what the host page allows — a
 * srcdoc document inherits its parent's policy as well. No fetch or XHR at
 * all, no fonts but the platform's, no forms or base. Pictures come from the
 * schemes the reader's assets do: the web origin or a story's http(s) URL,
 * blob: (media kept in IndexedDB) and data:, file:// inside an Android build,
 * and the desktop shell's tauri:/asset: schemes.
 */
const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src http: https: data: blob: file: tauri: asset:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const STYLES = `
:root {
  --text-scale: 1;
  --words-font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif;
  --caption-font: Georgia, 'Times New Roman', 'Noto Serif', serif;
  color-scheme: dark;
}
html, body { margin: 0; padding: 0; background: #141417; }
body {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  overscroll-behavior: contain;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
  cursor: pointer;
}
#strip { max-width: 760px; margin: 0 auto; padding: 12px 0 0; }
.panel {
  position: relative;
  aspect-ratio: 16 / 10;
  margin: 10px 12px 0;
  border: 3px solid #0d0d0f;
  background: #2a2a30;
  contain: layout paint style;
}
.panel.page-start { margin-top: 34px; }
.panel.page-start:first-child { margin-top: 10px; }
.art { position: absolute; inset: 0; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sprite { position: absolute; bottom: 0; height: 88%; width: auto; transform: translateX(-50%); }
.missing { visibility: hidden; }
.words {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  box-sizing: border-box;
  padding: 10px;
}
.caption {
  margin: 0;
  max-width: 88%;
  padding: 0.45em 0.7em;
  background: #fff3c4;
  color: #1b1712;
  border: 2px solid #0d0d0f;
  font: italic calc(15px * var(--text-scale)) / 1.35 var(--caption-font);
  overflow-wrap: break-word;
}
.bubble {
  position: relative;
  max-width: 78%;
  padding: 0.45em 0.8em;
  background: #fff;
  color: #121212;
  border: 2px solid #0d0d0f;
  border-radius: 1.1em;
  font: calc(15px * var(--text-scale)) / 1.3 var(--words-font);
  overflow-wrap: break-word;
}
.bubble.lean-right { align-self: flex-end; }
.bubble::after {
  content: '';
  position: absolute;
  bottom: -9px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-right: 2px solid #0d0d0f;
  border-bottom: 2px solid #0d0d0f;
  transform: rotate(45deg);
}
.bubble.lean-left::after { left: 22px; }
.bubble.lean-right::after { right: 22px; }
.bubble .speaker {
  display: block;
  font: 700 0.66em / 1.3 var(--words-font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.6;
}
.bubble .line { display: block; }
#choices { max-width: 760px; margin: 0 auto; padding: 18px 12px 0; display: flex; flex-direction: column; gap: 10px; }
#choices:empty { display: none; }
.choice {
  padding: 0.7em 1em;
  background: #fff;
  color: #121212;
  border: 2px solid #0d0d0f;
  border-radius: 0.6em;
  font: 600 calc(15px * var(--text-scale)) / 1.3 var(--words-font);
  text-align: left;
  cursor: pointer;
}
.choice.taken { background: #ffe58a; }
.choice.not-taken { opacity: 0.45; }
.choice:disabled { cursor: default; }
#end { height: 40vh; }
@keyframes comic-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes comic-fade { from { opacity: 0; } to { opacity: 1; } }
.panel.enter { animation: comic-in 320ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .panel.enter { animation-name: comic-fade; }
}
`;

export function createComicFrameHtml(boot: ComicFrameBoot): string {
  const frameBoot = {
    token: boot.token,
    hostOrigin: boot.hostOrigin,
    textScale: boot.textScale,
    keepScreens: boot.keepScreens ?? 2,
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${STYLES}</style>
</head>
<body>
  <main id="strip" aria-label="Comic" aria-live="polite"></main>
  <div id="choices" role="group" aria-label="Choices"></div>
  <div id="end"></div>
  <script>window.__VNE_COMIC_BOOT = ${jsonForScript(frameBoot)};</script>
  <script>${COMIC_FRAME_SCRIPT}</script>
</body>
</html>`;
}
