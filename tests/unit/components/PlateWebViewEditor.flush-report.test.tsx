import { createRef } from 'react';
import { act, render } from '@testing-library/react';

import {
  PlateWebViewEditor,
  type PlateWebViewEditorHandle,
} from '@/components/vn-plate-editor/PlateWebViewEditor.web';

const EDITOR_ID = 'editor-flush-report';

function typedScene(content: string) {
  return { sceneId: 'scene-1', sceneName: 'Scene 1', blocks: [{ id: 'blk', kind: 'text' as const, content }] };
}

/** A ready editor, with what it posts to its frame and a way to answer as the frame. */
function mountEditor() {
  const onChange = vi.fn();
  const ref = createRef<PlateWebViewEditorHandle>();
  const { container } = render(
    <PlateWebViewEditor
      ref={ref}
      editorId={EDITOR_ID}
      scene={typedScene('Тиша.')}
      characters={[]}
      backgroundAssets={[]}
      audioAssets={[]}
      isPhone={false}
      onChange={onChange}
    />,
  );
  const frameWindow = container.querySelector('iframe')!.contentWindow!;
  const toFrame = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
  const fromFrame = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'vn-plate-editor', editorId: EDITOR_ID, ...data },
      origin: window.location.origin,
      source: frameWindow,
    }));
  });
  fromFrame({ type: 'ready' });

  const lastFlushRequestId = (): string => {
    const flush = toFrame.mock.calls.map(([message]) => message as { type?: string; requestId?: string })
      .filter((message) => message.type === 'flush')
      .at(-1);
    return flush!.requestId!;
  };
  return { onChange, handle: ref.current!, fromFrame, lastFlushRequestId };
}

describe('PlateWebViewEditor: the frame’s report of an edit a flush already delivered', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is not passed on as a change', async () => {
    const editor = mountEditor();
    const capture = editor.handle.capture();
    const requestId = editor.lastFlushRequestId();
    editor.fromFrame({ type: 'flushed', requestId, scene: typedScene('Тиша. І кроки.'), characters: [], selection: null, hasUnreportedChanges: true });

    await expect(capture).resolves.toMatchObject({ hasUnreportedChanges: true });
    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки.'), characters: [], flushedBy: requestId });

    expect(editor.onChange).not.toHaveBeenCalled();
  });

  it('holds for a plain flush as well', async () => {
    const editor = mountEditor();
    const flush = editor.handle.flush();
    const requestId = editor.lastFlushRequestId();
    editor.fromFrame({ type: 'flushed', requestId, scene: typedScene('Тиша. І кроки.'), characters: [], hasUnreportedChanges: true });

    await flush;
    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки.'), characters: [], flushedBy: requestId });

    expect(editor.onChange).not.toHaveBeenCalled();
  });

  it('survives later flushes that carried nothing new', async () => {
    const editor = mountEditor();
    const first = editor.handle.capture();
    const requestId = editor.lastFlushRequestId();
    editor.fromFrame({ type: 'flushed', requestId, scene: typedScene('Тиша. І кроки.'), characters: [], selection: null, hasUnreportedChanges: true });
    await first;
    const second = editor.handle.capture();
    editor.fromFrame({ type: 'flushed', requestId: editor.lastFlushRequestId(), scene: typedScene('Тиша. І кроки.'), characters: [], selection: null, hasUnreportedChanges: false });
    await second;

    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки.'), characters: [], flushedBy: requestId });

    expect(editor.onChange).not.toHaveBeenCalled();
  });

  it('is the only report held back: the next one is a change again', async () => {
    const editor = mountEditor();
    const capture = editor.handle.capture();
    const requestId = editor.lastFlushRequestId();
    editor.fromFrame({ type: 'flushed', requestId, scene: typedScene('Тиша. І кроки.'), characters: [], selection: null, hasUnreportedChanges: true });
    await capture;
    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки.'), characters: [], flushedBy: requestId });

    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки. І двері.'), characters: [] });

    expect(editor.onChange).toHaveBeenCalledOnce();
    expect(editor.onChange.mock.calls[0][0].blocks[0]).toMatchObject({ content: 'Тиша. І кроки. І двері.' });
  });

  it('passes on a report that names no flush, even right after one', async () => {
    const editor = mountEditor();
    const capture = editor.handle.capture();
    editor.fromFrame({ type: 'flushed', requestId: editor.lastFlushRequestId(), scene: typedScene('Тиша. І кроки.'), characters: [], selection: null, hasUnreportedChanges: true });
    await capture;

    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки. І двері.'), characters: [] });

    expect(editor.onChange).toHaveBeenCalledOnce();
  });

  // The flush gave up waiting, so nobody was handed the edit: the report that
  // names it is the only way the host will ever hear of it.
  it('passes on the report when the flush it names never reached its caller', async () => {
    vi.useFakeTimers();
    const editor = mountEditor();
    const capture = editor.handle.capture();
    const requestId = editor.lastFlushRequestId();
    const rejected = expect(capture).rejects.toThrow('flush timed out');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_001);
    });
    await rejected;
    editor.fromFrame({ type: 'flushed', requestId, scene: typedScene('Тиша. І кроки.'), characters: [], selection: null, hasUnreportedChanges: true });

    editor.fromFrame({ type: 'save', scene: typedScene('Тиша. І кроки.'), characters: [], flushedBy: requestId });

    expect(editor.onChange).toHaveBeenCalledOnce();
  });
});
