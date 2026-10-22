/**
 * The comic frame on the web and in the desktop shell: an iframe whose srcdoc
 * is the renderer document. Spike code for stage 1 of the comic plan.
 *
 * The frame runs with `allow-scripts allow-same-origin`, like the editor's, so
 * it can load whatever images the host can (same-origin URLs, blob: URLs) —
 * and so every message from it is checked three ways: the origin, that it came
 * from this frame's own window, and the session token.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  comicHostEnvelope,
  createComicRendererHtml,
  createComicSessionToken,
  readComicFrameMessage,
  type ComicHostMessage,
} from '@/lib/comic/spike/comic-renderer-html';

import type { ComicSpikeFrameHandle, ComicSpikeFrameProps } from './comic-spike-frame-types';

export type { ComicSpikeFrameHandle, ComicSpikeFrameProps } from './comic-spike-frame-types';

const Iframe = 'iframe' as unknown as React.ComponentType<{
  srcDoc: string;
  title: string;
  sandbox?: string;
  style: React.CSSProperties;
  ref?: React.Ref<HTMLIFrameElement>;
}>;

/**
 * A page opened from file:// has the opaque origin "null", which postMessage
 * refuses as a target. The message goes straight to our own frame's window
 * either way, and the frame checks the token.
 */
export function comicTargetOrigin(origin: string): string {
  return origin && origin !== 'null' ? origin : '*';
}

export const ComicSpikeFrame = forwardRef<ComicSpikeFrameHandle, ComicSpikeFrameProps>(function ComicSpikeFrame({
  strip,
  textScale,
  virtualize,
  keepScreens,
  font,
  onMessage,
  style,
}, ref) {
  const [token] = useState(createComicSessionToken);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  // The scale a frame is built with; later changes travel as messages, so a
  // new text size does not throw the strip away.
  const initialTextScaleRef = useRef(textScale);

  const html = useMemo(() => createComicRendererHtml({
    token,
    hostOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    textScale: initialTextScaleRef.current,
    virtualize,
    keepScreens,
    font,
  }), [font, keepScreens, token, virtualize]);

  const send = useCallback((message: ComicHostMessage) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(comicHostEnvelope(message, token), comicTargetOrigin(window.location.origin));
  }, [token]);

  useImperativeHandle(ref, () => ({ send }), [send]);

  useEffect(() => {
    readyRef.current = false;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const message = readComicFrameMessage(event.data, token);
      if (!message) return;
      if (message.type === 'ready') {
        readyRef.current = true;
        if (stripRef.current) send({ type: 'strip', strip: stripRef.current });
      }
      onMessageRef.current(message);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [html, send, token]);

  useEffect(() => {
    if (readyRef.current && strip) send({ type: 'strip', strip });
  }, [send, strip]);

  useEffect(() => {
    if (readyRef.current) send({ type: 'textScale', scale: textScale });
  }, [send, textScale]);

  return (
    <View style={[{ flex: 1, alignSelf: 'stretch' }, style]}>
      <Iframe
        ref={iframeRef}
        title="Comic"
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#141417' }}
      />
    </View>
  );
});
