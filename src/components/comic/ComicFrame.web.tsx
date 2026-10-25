/**
 * The comic frame on the web and in the desktop shell: an iframe whose srcdoc
 * is the frame document (src/lib/comic/comic-frame-document.ts).
 *
 * The frame runs with `allow-scripts allow-same-origin`, like the editor's, so
 * it can load whatever pictures the host can (same-origin URLs, blob: URLs of
 * media kept in IndexedDB) — and so every message from it is checked three
 * ways: the origin, that it came from this frame's own window, and the session
 * token.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { createComicFrameHtml } from '@/lib/comic/comic-frame-document';
import {
  comicHostEnvelope,
  createComicSessionToken,
  readComicFrameMessage,
  type ComicFrameMessage,
  type ComicHostMessage,
} from '@/lib/comic/comic-frame-protocol';

import type { ComicFrameProps } from './comic-frame-types';

export type { ComicFrameProps } from './comic-frame-types';

const Iframe = 'iframe' as unknown as React.ComponentType<{
  srcDoc: string;
  title: string;
  sandbox?: string;
  style: React.CSSProperties;
  ref?: React.Ref<HTMLIFrameElement>;
}>;

/**
 * The origin to address the frame by, and to expect its messages from. Only an
 * http(s) origin can be named. A page opened from file:// has an opaque one —
 * "null", or "file://" as Chrome spells it — and so does a custom scheme like
 * the desktop shell's tauri:// on macOS and Linux: a message addressed to an
 * opaque origin is dropped without a word, and the comic never draws. Those
 * hosts use "*". The message goes straight to our own frame's window either
 * way, the source window is checked, and both sides check the token.
 */
export function comicTargetOrigin(origin: string): string {
  return /^https?:\/\//i.test(origin) ? origin : '*';
}

export function ComicFrame({ strip, textScale, onTap, onChoose, onLayout, style }: ComicFrameProps) {
  const [token] = useState(createComicSessionToken);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const textScaleRef = useRef(textScale);
  textScaleRef.current = textScale;
  const handlersRef = useRef({ onTap, onChoose, onLayout });
  handlersRef.current = { onTap, onChoose, onLayout };
  // The scale a frame is built with; later changes travel as messages, so a
  // new text size does not throw the strip away.
  const initialTextScaleRef = useRef(textScale);

  const html = useMemo(() => createComicFrameHtml({
    token,
    hostOrigin: typeof window !== 'undefined' ? comicTargetOrigin(window.location.origin) : undefined,
    textScale: initialTextScaleRef.current,
  }), [token]);

  const send = useCallback((message: ComicHostMessage) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(comicHostEnvelope(message, token), comicTargetOrigin(window.location.origin));
  }, [token]);

  useEffect(() => {
    readyRef.current = false;
    const handle = (message: ComicFrameMessage) => {
      if (message.type === 'ready') {
        readyRef.current = true;
        if (textScaleRef.current !== initialTextScaleRef.current) send({ type: 'textScale', scale: textScaleRef.current });
        if (stripRef.current) send({ type: 'strip', strip: stripRef.current });
      } else if (message.type === 'tap') {
        handlersRef.current.onTap(message.panelId);
      } else if (message.type === 'choose') {
        handlersRef.current.onChoose(message.optionId);
      } else if (message.type === 'layout') {
        handlersRef.current.onLayout?.({ panels: message.panels, pages: message.pages });
      } else if (__DEV__) {
        console.warn('[ComicFrame] the frame reported an error:', message.message);
      }
    };
    const expectedOrigin = comicTargetOrigin(window.location.origin);
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (expectedOrigin !== '*' && event.origin !== expectedOrigin) return;
      const message = readComicFrameMessage(event.data, token);
      if (message) handle(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
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
}
