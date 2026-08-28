import fs from 'node:fs';
import path from 'node:path';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';

import {
  PlateWebViewEditor,
  type PlateWebViewEditorHandle,
} from '@/components/vn-plate-editor/PlateWebViewEditor.web';

describe('PlateWebViewEditor message boundary', () => {
  it('accepts messages only from its same-origin iframe window', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PlateWebViewEditor
        editorId="editor-secure"
        scene={{ sceneId: 'scene-1', sceneName: 'Scene 1', blocks: [] }}
        characters={[]}
        backgroundAssets={[]}
        audioAssets={[]}
        isPhone={false}
        onChange={onChange}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe?.contentWindow).toBeTruthy();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');

    const data = {
      source: 'vn-plate-editor',
      editorId: 'editor-secure',
      type: 'save',
      scene: { sceneId: 'scene-1', sceneName: 'Changed', blocks: [] },
      characters: [],
    };

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: 'https://attacker.example',
        source: iframe!.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: window,
      }));
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      expect(() => window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'vn-plate-editor',
          editorId: 'editor-secure',
          type: 'uploadAudioAsset',
          name: 'voice.ogg',
          dataUri: 'data:audio/ogg;base64,AA==',
        },
        origin: window.location.origin,
        source: iframe!.contentWindow,
      }))).not.toThrow();
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: iframe!.contentWindow,
      }));
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('uses exact-origin postMessage targets in both bridge directions', () => {
    const hostSource = fs.readFileSync(
      path.join(process.cwd(), 'components/vn-plate-editor/PlateWebViewEditor.web.tsx'),
      'utf8',
    );
    const embeddedSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/vn-plate-editor/embedded-script.ts'),
      'utf8',
    );

    expect(hostSource).not.toMatch(/postMessage\([\s\S]*?,\s*['"]\*['"]\)/);
    expect(hostSource).toContain('window.location.origin');
    expect(embeddedSource).toContain('window.parent.postMessage(full, window.location.origin)');
  });

  it('rejects a flush immediately while the iframe is not ready', async () => {
    const ref = createRef<PlateWebViewEditorHandle>();
    render(
      <PlateWebViewEditor
        ref={ref}
        editorId="editor-not-ready"
        scene={{ sceneId: 'scene-1', sceneName: 'Scene 1', blocks: [] }}
        characters={[]}
        backgroundAssets={[]}
        audioAssets={[]}
        isPhone={false}
        onChange={vi.fn()}
      />,
    );

    await expect(ref.current!.flush()).rejects.toThrow('not ready');
  });

  it('rejects a flush when a ready iframe does not return a current snapshot', async () => {
    vi.useFakeTimers();
    const ref = createRef<PlateWebViewEditorHandle>();
    const { container } = render(
      <PlateWebViewEditor
        ref={ref}
        editorId="editor-timeout"
        scene={{ sceneId: 'scene-1', sceneName: 'Scene 1', blocks: [] }}
        characters={[]}
        backgroundAssets={[]}
        audioAssets={[]}
        isPhone={false}
        onChange={vi.fn()}
      />,
    );
    const iframe = container.querySelector('iframe')!;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { source: 'vn-plate-editor', editorId: 'editor-timeout', type: 'ready' },
        origin: window.location.origin,
        source: iframe.contentWindow,
      }));
    });

    const flush = ref.current!.flush();
    const rejected = expect(flush).rejects.toThrow('flush timed out');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_001);
    });
    await rejected;
    vi.useRealTimers();
  });
});
