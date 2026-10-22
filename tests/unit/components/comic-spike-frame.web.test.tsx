import { act, render } from '@testing-library/react';

import { ComicSpikeFrame, comicTargetOrigin } from '@/components/comic/ComicSpikeFrame.web';
import { COMIC_FRAME_SOURCE, COMIC_HOST_SOURCE } from '@/lib/comic/spike/comic-renderer-html';
import { buildSpikeStrip } from '@/lib/comic/spike/spike-page-plan';

function tokenOf(iframe: HTMLIFrameElement): string {
  const srcdoc = iframe.getAttribute('srcdoc') ?? '';
  const boot = /window\.__VNE_COMIC_BOOT = (\{.*?\});/.exec(srcdoc)?.[1];
  return JSON.parse(boot ?? '{}').token;
}

describe('ComicSpikeFrame on the web', () => {
  const strip = { pages: buildSpikeStrip(2), images: {} };

  it('answers only its own frame, from its own origin, with its own token', () => {
    const onMessage = vi.fn();
    const { container } = render(
      <ComicSpikeFrame strip={strip} textScale={1} virtualize keepScreens={2} onMessage={onMessage} />,
    );
    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    const token = tokenOf(iframe);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const postToFrame = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const ready = { source: COMIC_FRAME_SOURCE, token, type: 'ready', marks: { scriptStart: 0 } };

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: ready, origin: 'https://attacker.example', source: iframe.contentWindow }));
      window.dispatchEvent(new MessageEvent('message', { data: ready, origin: window.location.origin, source: window }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { ...ready, token: 'guessed' },
        origin: window.location.origin,
        source: iframe.contentWindow,
      }));
    });
    expect(onMessage).not.toHaveBeenCalled();
    expect(postToFrame).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: ready, origin: window.location.origin, source: iframe.contentWindow }));
    });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }));
    expect(postToFrame).toHaveBeenCalledWith(
      expect.objectContaining({ source: COMIC_HOST_SOURCE, token, type: 'strip', strip }),
      window.location.origin,
    );
  });

  it('names the host origin to the frame, never leaving it to read its own', () => {
    const { container } = render(
      <ComicSpikeFrame strip={null} textScale={1} virtualize keepScreens={2} onMessage={vi.fn()} />,
    );
    const srcdoc = container.querySelector('iframe')!.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain(`"hostOrigin":"${window.location.origin}"`);
  });

  it('falls back to "*" only for a host with an opaque origin', () => {
    expect(comicTargetOrigin('https://studio.example')).toBe('https://studio.example');
    expect(comicTargetOrigin('null')).toBe('*');
    expect(comicTargetOrigin('')).toBe('*');
  });
});
