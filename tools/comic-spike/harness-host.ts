/**
 * The comic spike's browser harness: a bare host page that does what
 * ComicSpikeFrame.web.tsx does — renderer document in a srcdoc iframe, origin +
 * source + token on every message — with no app around it, so a measurement
 * sees the renderer and nothing else. Bundled by make-harness.mjs with the
 * real modules from src/lib/comic/spike.
 *
 * Query: ?pages=24&virtualize=1&keep=2&scale=1&img=img&unique=0
 * Results land in `window.__comicSpikeLog`; `window.__comicSpike.send(...)`
 * forwards a host message to the frame.
 */
import {
  comicHostEnvelope,
  createComicRendererHtml,
  createComicSessionToken,
  readComicFrameMessage,
  type ComicHostMessage,
} from '@/lib/comic/spike/comic-renderer-html';
import { SPIKE_FONT_FAMILY, SPIKE_FONT_TTF_BASE64 } from '@/lib/comic/spike/spike-font';
import { buildSpikeStrip, SPIKE_IMAGE_KEYS } from '@/lib/comic/spike/spike-page-plan';

const startedAt = Date.now();
const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => {
  const value = Number(params.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const log: unknown[] = [];
const target = window as unknown as { __comicSpikeLog: unknown[]; __comicSpike: { send: (message: ComicHostMessage) => void } };
target.__comicSpikeLog = log;

const token = createComicSessionToken();
const imageDir = params.get('img') || 'img';
const imageUrl = (key: string, copy?: number) => new URL(`${imageDir}/${key}.png${copy === undefined ? '' : `?copy=${copy}`}`, location.href).href;
const images: Record<string, string> = Object.fromEntries(SPIKE_IMAGE_KEYS.map((key) => [key, imageUrl(key)]));
let pages = buildSpikeStrip(number('pages', 24));

/*
 * unique=N: the spike strip reuses ten pictures, so a browser decodes each
 * once however long the strip is. A story has a new background every few
 * pages. With unique=N, page i draws copy (i mod N) of each picture — a URL of
 * its own, so a decode of its own — which is what a long strip of distinct art
 * costs.
 */
const unique = number('unique', 0);
if (unique > 0) {
  pages = pages.map((page, index) => {
    const copy = index % unique;
    const rename = (key: string) => {
      const copied = `${key}~${copy}`;
      images[copied] = imageUrl(key, copy);
      return copied;
    };
    return {
      ...page,
      panels: page.panels.map((panel) => ({
        ...panel,
        background: { ...panel.background, image: rename(panel.background.image) },
        sprites: panel.sprites.map((sprite) => ({ ...sprite, image: rename(sprite.image) })),
      })),
    };
  });
}
const strip = { pages, images };

const frame = document.createElement('iframe');
frame.title = 'Comic';
frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#141417';

const targetOrigin = location.origin && location.origin !== 'null' ? location.origin : '*';
const send = (message: ComicHostMessage) => {
  frame.contentWindow?.postMessage(comicHostEnvelope(message, token), targetOrigin);
};
target.__comicSpike = { send };

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const message = readComicFrameMessage(event.data, token);
  if (!message) return;
  if (message.type === 'ready') send({ type: 'strip', strip });
  if (message.type === 'firstPage') {
    log.push({ event: 'firstPage', totalMs: message.paintedAtEpochMs - startedAt, ...message });
    return;
  }
  log.push({ event: message.type, ...message });
});

frame.srcdoc = createComicRendererHtml({
  token,
  hostOrigin: location.origin,
  textScale: number('scale', 1),
  virtualize: params.get('virtualize') !== '0',
  keepScreens: number('keep', 2),
  font: params.get('font') === '0' ? undefined : { family: SPIKE_FONT_FAMILY, dataUri: `data:font/ttf;base64,${SPIKE_FONT_TTF_BASE64}` },
});
document.body.appendChild(frame);
