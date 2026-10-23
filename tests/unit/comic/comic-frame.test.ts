// @ts-expect-error The installed jsdom test runtime does not ship declarations.
import { JSDOM } from 'jsdom';

import { createComicFrameHtml, type ComicFrameBoot } from '@/lib/comic/comic-frame-document';
import {
  COMIC_FRAME_SOURCE,
  comicInjectionFor,
  readComicFrameMessage,
  type ComicFramePanel,
  type ComicFrameStrip,
  type ComicHostMessage,
} from '@/lib/comic/comic-frame-protocol';

const TOKEN = 'token-for-tests';

/**
 * The frame's real document and script, booted the way a WebView boots them:
 * `ReactNativeWebView.postMessage` is the way out, injected script the way in.
 * jsdom has no layout, so every panel measures 0 px high.
 */
function bootFrame(overrides: Partial<ComicFrameBoot> = {}, options: { observer?: boolean } = {}) {
  const posted: Record<string, unknown>[] = [];
  const observed: Element[] = [];
  const html = createComicFrameHtml({ token: TOKEN, textScale: 1, ...overrides });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window: Window & typeof globalThis) {
      Object.assign(window, { ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) } });
      if (options.observer) {
        Object.assign(window, {
          IntersectionObserver: class {
            observe(target: Element) { observed.push(target); }
            unobserve() {}
            disconnect() {}
          },
        });
      }
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.scrollTo = () => {};
    },
  });
  frames.push(dom);
  const send = (message: ComicHostMessage, token = TOKEN) => {
    dom.window.eval(comicInjectionFor(message, token));
  };
  const messages = (type: string) => posted.filter((message) => message.type === type);
  const document: Document = dom.window.document;
  const panelIds = () => Array.from(document.querySelectorAll('.panel')).map((node) => node.getAttribute('data-id'));
  return { dom, document, posted, observed, send, messages, panelIds };
}

const frames: { window: Window }[] = [];
afterEach(() => {
  while (frames.length) frames.pop()?.window.close();
});

function panel(id: string, words: ComicFramePanel['words'] = [{ id: `${id}-w`, kind: 'caption', text: `Words of ${id}.` }]): ComicFramePanel {
  return {
    id,
    background: `file:///media/${id}.png`,
    sprites: [{ id: 'ann', url: 'file:///media/ann.png', x: 0.25 }],
    zoom: 1,
    focus: { x: 0.5, y: 0.5 },
    place: { x: 0.5, y: 0.5 },
    words,
  };
}

function strip(count: number, revealed = count, extra: Partial<ComicFrameStrip> = {}): ComicFrameStrip {
  return { panels: Array.from({ length: count }, (_, index) => panel(`p${index + 1}`)), revealed, choices: null, ...extra };
}

describe('the comic frame', () => {
  it('says it is ready, carrying its token', () => {
    const { posted } = bootFrame();
    expect(posted).toEqual([{ type: 'ready', source: COMIC_FRAME_SOURCE, token: TOKEN }]);
    expect(readComicFrameMessage(JSON.stringify(posted[0]), TOKEN)).toEqual({ type: 'ready' });
  });

  it('draws the panels the reader has opened, and no more', () => {
    const { send, panelIds, messages } = bootFrame();

    send({ type: 'strip', strip: strip(3, 2) });

    expect(panelIds()).toEqual(['p1', 'p2']);
    expect(messages('layout').at(-1)).toMatchObject({ panels: 2, pages: 1 });
  });

  it('keeps the panels it has, opens the next one with its entrance, and takes back what a rollback undoes', () => {
    const { send, document, panelIds } = bootFrame();
    send({ type: 'strip', strip: strip(3, 2) });
    const [first, second] = Array.from(document.querySelectorAll('.panel'));
    expect(first.classList.contains('enter')).toBe(false);

    send({ type: 'strip', strip: strip(3, 3) });

    const after = document.querySelectorAll('.panel');
    expect(after[0]).toBe(first);
    expect(after[1]).toBe(second);
    expect(after[2].classList.contains('enter')).toBe(true);

    send({ type: 'strip', strip: strip(3, 1) });
    expect(panelIds()).toEqual(['p1']);
    expect(document.querySelector('.panel')).toBe(first);
  });

  it('draws a panel again when what it shows changes', () => {
    const { send, document } = bootFrame();
    send({ type: 'strip', strip: strip(1) });
    const before = document.querySelector('.panel');

    send({ type: 'strip', strip: { ...strip(1), panels: [{ ...panel('p1'), background: 'file:///media/other.png' }] } });

    expect(document.querySelector('.panel')).not.toBe(before);
    expect(document.querySelector('.bg')?.getAttribute('data-src')).toBe('file:///media/other.png');
  });

  it('sets a story\'s words as text, never as markup', () => {
    const { send, document } = bootFrame();
    const words = [
      { id: 'w1', kind: 'caption' as const, text: '<img src=x onerror="window.pwned=1">' },
      { id: 'w2', kind: 'bubble' as const, text: '<b>bold</b>', speaker: '<i>Ann</i>', speakerX: 0.2 },
    ];

    send({ type: 'strip', strip: { panels: [panel('p1', words)], revealed: 1, choices: null } });

    expect(document.querySelector('.caption')?.textContent).toBe(words[0].text);
    expect(document.querySelector('.bubble .line')?.textContent).toBe('<b>bold</b>');
    expect(document.querySelector('.bubble .speaker')?.textContent).toBe('<i>Ann</i>');
    expect(document.querySelectorAll('.words img, .words b, .words i')).toHaveLength(0);
  });

  it('leans a bubble to the side its speaker stands on', () => {
    const { send, document } = bootFrame();
    send({ type: 'strip', strip: { panels: [panel('p1', [
      { id: 'left', kind: 'bubble', text: 'Hi.', speaker: 'Ann', speakerX: 0.2 },
      { id: 'right', kind: 'bubble', text: 'Hello.', speaker: 'Ben', speakerX: 0.8 },
    ])], revealed: 1, choices: null } });

    expect(Array.from(document.querySelectorAll('.bubble')).map((node) => node.className)).toEqual([
      'bubble lean-left',
      'bubble lean-right',
    ]);
  });

  it('frames a shot by moving its focus to its place, never so far that the stage stops covering the panel', () => {
    const { send, document } = bootFrame();
    send({ type: 'strip', strip: { panels: [
      { ...panel('close'), zoom: 2, focus: { x: 0.25, y: 0.3 }, place: { x: 0.33, y: 0.33 } },
      { ...panel('edge'), zoom: 2, focus: { x: 0.95, y: 0.3 }, place: { x: 0.33, y: 0.33 } },
      { ...panel('wide'), zoom: 1, focus: { x: 0.5, y: 0.5 }, place: { x: 0.1, y: 0.9 } },
    ], revealed: 3, choices: null } });

    const transforms = Array.from(document.querySelectorAll<HTMLElement>('.stage')).map((stage) => stage.style.transform);
    expect(transforms).toEqual([
      'translate(-17%, -27%) scale(2)',
      'translate(-100%, -27%) scale(2)',
      'translate(0%, 0%) scale(1)',
    ]);
  });

  it('cuts a page after six panels', () => {
    const { send, document, messages } = bootFrame();

    send({ type: 'strip', strip: strip(8) });

    expect(Array.from(document.querySelectorAll('.panel.page-start')).map((node) => node.getAttribute('data-id'))).toEqual(['p1', 'p7']);
    expect(messages('layout').at(-1)).toMatchObject({ panels: 8, pages: 2 });
  });

  it('loads pictures only near the viewport when it can tell, and all of them when it cannot', () => {
    const near = bootFrame({}, { observer: true });
    near.send({ type: 'strip', strip: strip(2) });
    expect(near.observed).toHaveLength(2);
    expect(near.document.querySelector('.bg')?.hasAttribute('src')).toBe(false);

    const plain = bootFrame();
    plain.send({ type: 'strip', strip: strip(1) });
    expect(plain.document.querySelector('.bg')?.getAttribute('src')).toBe('file:///media/p1.png');
  });

  it('draws nothing for a picture it has no URL for', () => {
    const { send, document } = bootFrame();
    send({ type: 'strip', strip: { panels: [{ ...panel('p1'), background: null }], revealed: 1, choices: null } });
    expect(document.querySelector('.bg')?.classList.contains('missing')).toBe(true);
  });

  it('asks for the next panel on a tap, Space or Enter', () => {
    const { send, document, dom, messages } = bootFrame();
    send({ type: 'strip', strip: strip(1) });

    document.querySelector('.panel')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(messages('tap')).toHaveLength(3);
  });

  it('offers a choice once every panel is open, and reports the option picked', () => {
    const { send, document, dom, messages } = bootFrame();
    const choices = { options: [{ id: 'left', text: 'Left' }, { id: 'right', text: 'Right' }], chosenId: null };
    send({ type: 'strip', strip: strip(2, 1, { choices }) });
    expect(document.querySelectorAll('.choice')).toHaveLength(0);

    send({ type: 'strip', strip: strip(2, 2, { choices }) });
    const buttons = document.querySelectorAll('.choice');
    expect(Array.from(buttons).map((node) => node.textContent)).toEqual(['Left', 'Right']);
    buttons[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    expect(messages('choose')).toEqual([expect.objectContaining({ optionId: 'right' })]);
    expect(messages('tap')).toHaveLength(0);
  });

  it('shows a choice made as made: the option taken, the others not, none to press', () => {
    const { send, document, dom, messages } = bootFrame();
    send({ type: 'strip', strip: strip(1, 1, { choices: { options: [{ id: 'left', text: 'Left' }, { id: 'right', text: 'Right' }], chosenId: 'left' } }) });

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.choice'));
    expect(buttons.map((node) => [node.className, node.disabled])).toEqual([['choice taken', true], ['choice not-taken', true]]);
    buttons[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(messages('choose')).toHaveLength(0);
  });

  it('shows a choice an earlier scene ended on under that scene\'s last panel, with nothing to press', () => {
    const { send, document, dom, messages } = bootFrame();
    send({ type: 'strip', strip: { panels: [
      { ...panel('p1'), choices: { options: [{ id: 'left', text: 'Left' }, { id: 'right', text: 'Right' }], chosenId: 'right' } },
      panel('p2'),
    ], revealed: 2, choices: null } });

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.panel[data-id="p1"] .past-choices .choice'));
    expect(buttons.map((node) => [node.textContent, node.className, node.disabled])).toEqual([
      ['Left', 'choice not-taken', true],
      ['Right', 'choice taken', true],
    ]);
    buttons[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(messages('choose')).toHaveLength(0);
    expect(messages('tap')).toHaveLength(0);
    expect(document.querySelectorAll('#choices .choice')).toHaveLength(0);
  });

  it('takes its text size from the host', () => {
    const { send, document } = bootFrame({ textScale: 1.3 });
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.3');

    send({ type: 'textScale', scale: 2 });

    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('2');
  });

  it('ignores a message without its token', () => {
    const { send, panelIds } = bootFrame();
    send({ type: 'strip', strip: strip(2) }, 'guessed');
    expect(panelIds()).toEqual([]);
  });

  it('allows no fetching and no fonts from outside', () => {
    const html = createComicFrameHtml({ token: TOKEN, textScale: 1 });
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/font-src/);
  });
});

describe('frame messages', () => {
  it('are taken only with the token and in a shape the frame sends', () => {
    const envelope = (message: Record<string, unknown>, token = TOKEN) => ({ ...message, source: COMIC_FRAME_SOURCE, token });

    expect(readComicFrameMessage(envelope({ type: 'choose', optionId: 'a' }), TOKEN)).toEqual({ type: 'choose', optionId: 'a' });
    expect(readComicFrameMessage(envelope({ type: 'choose', optionId: 'a' }, 'other'), TOKEN)).toBeNull();
    expect(readComicFrameMessage(envelope({ type: 'choose' }), TOKEN)).toBeNull();
    expect(readComicFrameMessage(envelope({ type: 'layout', panels: '2', pages: 1 }), TOKEN)).toBeNull();
    expect(readComicFrameMessage(envelope({ type: 'navigate' }), TOKEN)).toBeNull();
    expect(readComicFrameMessage('{not json', TOKEN)).toBeNull();
  });

  it('reach a WebView with nothing in them that could end the script they travel in', () => {
    const injected = comicInjectionFor({ type: 'strip', strip: strip(1, 1, { panels: [panel('</script><script>alert(1)</script>')] }) }, TOKEN);
    expect(injected).not.toContain('</script>');
  });
});
