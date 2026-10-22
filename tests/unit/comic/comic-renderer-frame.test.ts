// @ts-expect-error The installed jsdom test runtime does not ship declarations.
import { JSDOM } from 'jsdom';

import {
  COMIC_FRAME_SOURCE,
  comicInjectionFor,
  createComicRendererHtml,
  readComicFrameMessage,
  type ComicFrameMessage,
  type ComicHostMessage,
  type ComicRendererBoot,
} from '@/lib/comic/spike/comic-renderer-html';
import { COMIC_RENDERER_SCRIPT } from '@/lib/comic/spike/comic-renderer-script';
import { buildSpikeStrip, SPIKE_IMAGE_KEYS, type ComicSpikePage } from '@/lib/comic/spike/spike-page-plan';

const TOKEN = 'token-for-tests';

/**
 * The frame's real document and script, booted the way a WebView boots them:
 * `ReactNativeWebView.postMessage` is the way out, injected script the way in.
 * jsdom has no layout, decoder or IntersectionObserver, so those are stubbed.
 */
function bootFrame(overrides: Partial<ComicRendererBoot> = {}) {
  const posted: Record<string, unknown>[] = [];
  const html = createComicRendererHtml({ token: TOKEN, textScale: 1, virtualize: true, keepScreens: 2, ...overrides });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window: Window & typeof globalThis) {
      Object.assign(window, {
        ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
      });
      Object.defineProperty(window.HTMLImageElement.prototype, 'decode', {
        configurable: true,
        value: () => Promise.resolve(),
      });
    },
  });
  const send = (message: ComicHostMessage, token = TOKEN) => {
    dom.window.eval(comicInjectionFor(message, token));
  };
  const messages = (type: string) => posted.filter((message) => message.type === type);
  return { dom, posted, send, messages };
}

function stripOf(pages: ComicSpikePage[], images?: Record<string, string>) {
  return {
    pages,
    images: images ?? Object.fromEntries(SPIKE_IMAGE_KEYS.map((key) => [key, `file:///cache/${key}.png`])),
  };
}

const frames: { window: Window }[] = [];
afterEach(() => {
  while (frames.length) frames.pop()?.window.close();
});

describe('the comic frame, booted as a WebView boots it', () => {
  it('says it is ready, signed with its session token', () => {
    const frame = bootFrame();
    frames.push(frame.dom);
    const [ready] = frame.messages('ready');
    expect(ready).toMatchObject({ source: COMIC_FRAME_SOURCE, token: TOKEN, type: 'ready' });
  });

  it('ignores a message that does not carry the session token', async () => {
    const frame = bootFrame();
    frames.push(frame.dom);
    frame.send({ type: 'strip', strip: stripOf(buildSpikeStrip(3)) }, 'someone-else');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(frame.dom.window.document.querySelectorAll('.page')).toHaveLength(0);
    expect(frame.messages('firstPage')).toHaveLength(0);
  });

  it('lays out every page of the strip, builds the first, and reports it painted', async () => {
    const frame = bootFrame();
    frames.push(frame.dom);
    const pages = buildSpikeStrip(24);
    frame.send({ type: 'strip', strip: stripOf(pages) });
    await vi.waitFor(() => expect(frame.messages('firstPage')).toHaveLength(1));

    const document = frame.dom.window.document;
    expect(document.querySelectorAll('.page')).toHaveLength(24);
    expect(document.querySelectorAll('.page')[0].querySelectorAll('.panel')).toHaveLength(pages[0].panels.length);
    // Pages beyond the first wait for the observer.
    expect(document.querySelectorAll('.page')[5].children).toHaveLength(0);

    const [firstPage] = frame.messages('firstPage') as unknown as Extract<ComicFrameMessage, { type: 'firstPage' }>[];
    expect(firstPage.marks.firstPagePainted).toBeGreaterThanOrEqual(firstPage.marks.stripReceived ?? 0);
    expect(firstPage.stats.pages).toBe(24);
    expect(firstPage.stats.livePages).toBe(1);
    expect(firstPage.imagesOnFirstPage).toBe(pages[0].panels.reduce((sum, panel) => sum + 1 + panel.sprites.length, 0));
  });

  it('puts story text on the page as text, never as markup', async () => {
    const frame = bootFrame();
    frames.push(frame.dom);
    const [page] = buildSpikeStrip(1);
    const hostile = '<img src=x onerror="window.__pwned = 1">';
    page.panels[0].bubbles[0] = { ...page.panels[0].bubbles[0], text: hostile, speaker: '<b>Guide</b>' };
    frame.send({ type: 'strip', strip: stripOf([page]) });
    await vi.waitFor(() => expect(frame.messages('firstPage')).toHaveLength(1));

    const bubble = frame.dom.window.document.querySelector('.bubble');
    expect(bubble?.querySelector('.text')?.textContent).toBe(hostile);
    expect(bubble?.querySelectorAll('img, b')).toHaveLength(0);
    expect((frame.dom.window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('counts an image the host did not supply rather than loading anything in its place', async () => {
    const frame = bootFrame();
    frames.push(frame.dom);
    const pages = buildSpikeStrip(1);
    frame.send({ type: 'strip', strip: stripOf(pages, {}) });
    await vi.waitFor(() => expect(frame.messages('firstPage')).toHaveLength(1));

    const [firstPage] = frame.messages('firstPage') as unknown as Extract<ComicFrameMessage, { type: 'firstPage' }>[];
    expect(firstPage.stats.missingImages).toContain(pages[0].panels[0].background.image);
    expect(frame.dom.window.document.querySelectorAll('img[src]')).toHaveLength(0);
  });

  it('applies a new text scale without rebuilding the strip', async () => {
    const frame = bootFrame();
    frames.push(frame.dom);
    frame.send({ type: 'strip', strip: stripOf(buildSpikeStrip(2)) });
    await vi.waitFor(() => expect(frame.messages('firstPage')).toHaveLength(1));
    const firstPanel = frame.dom.window.document.querySelector('.panel');

    frame.send({ type: 'textScale', scale: 2 });
    const [stats] = frame.messages('stats') as unknown as Extract<ComicFrameMessage, { type: 'stats' }>[];
    expect(stats.stats.textScale).toBe(2);
    expect(frame.dom.window.document.documentElement.style.getPropertyValue('--text-scale')).toBe('2');
    expect(frame.dom.window.document.querySelector('.panel')).toBe(firstPanel);
  });
});

describe('the comic frame document', () => {
  it('forbids fetching anything and takes fonts only from data: URIs', () => {
    const html = createComicRendererHtml({ token: TOKEN, textScale: 1, virtualize: true, keepScreens: 2 });
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain('font-src data:');
    expect(policy).toContain("default-src 'none'");
  });

  it('embeds a font only when it is a data: font, so nothing can be spliced into the style sheet', () => {
    const accepted = createComicRendererHtml({
      token: TOKEN, textScale: 1, virtualize: true, keepScreens: 2,
      font: { family: 'Spike Font', dataUri: 'data:font/ttf;base64,AAEAAA==' },
    });
    expect(accepted).toContain("font-family: 'Spike Font'");
    // The font's --bubble-font must come after the default one, or the default
    // wins and every bubble falls back with the font loaded and unused.
    expect(accepted.lastIndexOf("--bubble-font: 'Spike Font'")).toBeGreaterThan(accepted.indexOf('--bubble-font: system-ui'));

    for (const font of [
      { family: 'Remote', dataUri: 'https://fonts.example/remote.ttf' },
      { family: 'Spliced', dataUri: "data:font/ttf;base64,AAAA); } body { background: url(https://x.example/" },
      { family: "Bad'); } *{x:url(", dataUri: 'data:font/ttf;base64,AAEAAA==' },
    ]) {
      const html = createComicRendererHtml({ token: TOKEN, textScale: 1, virtualize: true, keepScreens: 2, font });
      expect(html).not.toContain('@font-face');
    }
  });

  it('keeps a boot value from closing the script it sits in', () => {
    const html = createComicRendererHtml({ token: '</script><script>alert(1)</script>', textScale: 1, virtualize: true, keepScreens: 2 });
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it('never addresses its own location: a srcdoc origin is "null" and posting to it throws', () => {
    expect(COMIC_RENDERER_SCRIPT).not.toMatch(/location\.origin/);
    expect(COMIC_RENDERER_SCRIPT).toContain('window.parent.postMessage(message, hostOrigin)');
    expect(COMIC_RENDERER_SCRIPT).not.toMatch(/[`]|\$\{/);
  });
});

describe('reading a frame message on the host', () => {
  const message = { source: COMIC_FRAME_SOURCE, token: TOKEN, type: 'ready', marks: { scriptStart: 1 } };

  it('accepts the frame’s own messages, as objects or as WebView JSON text', () => {
    expect(readComicFrameMessage(message, TOKEN)).toMatchObject({ type: 'ready' });
    expect(readComicFrameMessage(JSON.stringify(message), TOKEN)).toMatchObject({ type: 'ready' });
  });

  it('refuses another token, another source and anything that is not a message', () => {
    expect(readComicFrameMessage({ ...message, token: 'other' }, TOKEN)).toBeNull();
    expect(readComicFrameMessage({ ...message, source: 'vn-plate-editor' }, TOKEN)).toBeNull();
    expect(readComicFrameMessage('{not json', TOKEN)).toBeNull();
    expect(readComicFrameMessage(null, TOKEN)).toBeNull();
    expect(readComicFrameMessage({ source: COMIC_FRAME_SOURCE, token: TOKEN }, TOKEN)).toBeNull();
  });
});
