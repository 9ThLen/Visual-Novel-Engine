import { act, render } from '@testing-library/react';

import { ComicFrame, comicTargetOrigin } from '@/components/comic/ComicFrame.web';
import { COMIC_FRAME_SOURCE, COMIC_HOST_SOURCE, type ComicFrameStrip } from '@/lib/comic/comic-frame-protocol';

function tokenOf(iframe: HTMLIFrameElement): string {
  const srcdoc = iframe.getAttribute('srcdoc') ?? '';
  const boot = /window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(srcdoc)?.[1];
  return JSON.parse(boot ?? '{}').token;
}

const strip: ComicFrameStrip = {
  panels: [{ id: 'p1', background: null, sprites: [], zoom: 1, focus: { x: 0.5, y: 0.5 }, place: { x: 0.5, y: 0.5 }, words: [] }],
  revealed: 1,
  choices: null,
};

function setup(overrides: Partial<React.ComponentProps<typeof ComicFrame>> = {}) {
  const handlers = { onTap: vi.fn(), onChoose: vi.fn(), onLayout: vi.fn() };
  const view = render(<ComicFrame strip={strip} textScale={1} {...handlers} {...overrides} />);
  const iframe = view.container.querySelector('iframe')!;
  const token = tokenOf(iframe);
  const fromFrame = (data: Record<string, unknown>, init: Partial<MessageEventInit> = {}) => act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: COMIC_FRAME_SOURCE, token, ...data },
      origin: window.location.origin,
      source: iframe.contentWindow,
      ...init,
    }));
  });
  return { ...view, ...handlers, iframe, token, fromFrame };
}

describe('ComicFrame on the web', () => {
  it('answers only its own frame, from its own origin, with its own token', () => {
    const { iframe, token, fromFrame, onTap } = setup();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const postToFrame = vi.spyOn(iframe.contentWindow!, 'postMessage');

    fromFrame({ type: 'ready' }, { origin: 'https://attacker.example' });
    fromFrame({ type: 'ready' }, { source: window });
    fromFrame({ type: 'ready', token: 'guessed' });
    fromFrame({ type: 'tap' }, { origin: 'https://attacker.example' });
    expect(postToFrame).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();

    fromFrame({ type: 'ready' });
    expect(postToFrame).toHaveBeenCalledWith(
      expect.objectContaining({ source: COMIC_HOST_SOURCE, token, type: 'strip', strip }),
      window.location.origin,
    );
  });

  it('passes on taps, the option picked and the layout', () => {
    const { fromFrame, onTap, onChoose, onLayout } = setup();

    fromFrame({ type: 'tap' });
    fromFrame({ type: 'choose', optionId: 'left' });
    fromFrame({ type: 'layout', panels: 3, pages: 1 });

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('left');
    expect(onLayout).toHaveBeenCalledWith({ panels: 3, pages: 1 });
  });

  it('sends a new strip and a new text size to a frame that is ready, not to one that is not', () => {
    const { iframe, fromFrame, rerender, onTap, onChoose } = setup();
    const postToFrame = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const next = { ...strip, revealed: 0 };

    rerender(<ComicFrame strip={next} textScale={1.5} onTap={onTap} onChoose={onChoose} />);
    expect(postToFrame).not.toHaveBeenCalled();

    fromFrame({ type: 'ready' });
    expect(postToFrame.mock.calls.map(([message]) => (message as { type: string }).type)).toEqual(['textScale', 'strip']);
    expect(postToFrame).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'strip', strip: next }), window.location.origin);
  });

  it('names the host origin to the frame, never leaving it to read its own', () => {
    const { iframe } = setup({ strip: null });
    expect(iframe.getAttribute('srcdoc')).toContain(`"hostOrigin":"${window.location.origin}"`);
  });

  it('falls back to "*" only for a host with an opaque origin', () => {
    expect(comicTargetOrigin('https://studio.example')).toBe('https://studio.example');
    expect(comicTargetOrigin('http://127.0.0.1:8095')).toBe('http://127.0.0.1:8095');
    expect(comicTargetOrigin('null')).toBe('*');
    expect(comicTargetOrigin('')).toBe('*');
    // Chrome spells a file:// page's origin out, and it is no more addressable.
    expect(comicTargetOrigin('file://')).toBe('*');
    expect(comicTargetOrigin('tauri://localhost')).toBe('*');
  });
});
