/**
 * The comic frame on Android: the same document as the web, in a
 * `react-native-webview` WebView.
 *
 * A WebView has no origin to check and no source window. The frame posts
 * through `ReactNativeWebView.postMessage`, and every message must carry this
 * session's token; the host speaks through `injectJavaScript`, which only the
 * page we loaded can receive. Navigation away from that page is refused, so no
 * other document ever gets to post.
 *
 * Pictures arrive as file:// URLs — the media library keeps its files on disk,
 * and a release build's bundled art is read from file:///android_res/ — hence
 * `allowFileAccess` and a file:// base URL.
 *
 * The WebView's text zoom is pinned at 100 % and the reader's font scale is
 * handed to the frame instead, so the frame knows how large its words are when
 * it measures them. A renderer process the system kills (it does, under memory
 * pressure — COMIC-RENDERER-SPIKE.md) is replaced by a new document, which asks
 * for the strip again.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { createComicFrameHtml } from '@/lib/comic/comic-frame-document';
import {
  comicInjectionFor,
  createComicSessionToken,
  readComicFrameMessage,
  type ComicHostMessage,
} from '@/lib/comic/comic-frame-protocol';

import type { ComicFrameProps } from './comic-frame-types';

export type { ComicFrameProps } from './comic-frame-types';

const BASE_URL = 'file:///android_asset/comic/';

function isFramePage(url: string): boolean {
  return url === 'about:blank' || url.startsWith(BASE_URL);
}

export function ComicFrame({ strip, textScale, onTap, onChoose, onMark, onLayout, style }: ComicFrameProps) {
  const [token] = useState(createComicSessionToken);
  // Bumped when the renderer process dies: a new WebView, a new document.
  const [generation, setGeneration] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const textScaleRef = useRef(textScale);
  textScaleRef.current = textScale;
  const handlersRef = useRef({ onTap, onChoose, onMark, onLayout });
  handlersRef.current = { onTap, onChoose, onMark, onLayout };

  // A document per generation, built with the scale of its moment; a later
  // scale travels as a message.
  const { html, builtScale } = useMemo(() => {
    const scale = textScaleRef.current;
    return { html: createComicFrameHtml({ token, textScale: scale }), builtScale: scale, generation };
  }, [token, generation]);
  const builtScaleRef = useRef(builtScale);
  builtScaleRef.current = builtScale;

  const send = useCallback((message: ComicHostMessage) => {
    webViewRef.current?.injectJavaScript(comicInjectionFor(message, token));
  }, [token]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = readComicFrameMessage(event.nativeEvent.data, token);
    if (!message) return;
    if (message.type === 'ready') {
      readyRef.current = true;
      if (textScaleRef.current !== builtScaleRef.current) send({ type: 'textScale', scale: textScaleRef.current });
      if (stripRef.current) send({ type: 'strip', strip: stripRef.current });
    } else if (message.type === 'mark') {
      handlersRef.current.onMark?.(message.anchor, message.begins);
    } else if (message.type === 'tap') {
      handlersRef.current.onTap(message.panelId);
    } else if (message.type === 'choose') {
      handlersRef.current.onChoose(message.optionId);
    } else if (message.type === 'layout') {
      handlersRef.current.onLayout?.({ panels: message.panels, pages: message.pages });
    } else if (__DEV__) {
      console.warn('[ComicFrame] the frame reported an error:', message.message);
    }
  }, [send, token]);

  const restart = useCallback(() => {
    readyRef.current = false;
    setGeneration((value) => value + 1);
  }, []);

  React.useEffect(() => {
    if (readyRef.current && strip) send({ type: 'strip', strip });
  }, [send, strip]);

  React.useEffect(() => {
    if (readyRef.current) send({ type: 'textScale', scale: textScale });
  }, [send, textScale]);

  return (
    <View style={[{ flex: 1, alignSelf: 'stretch', backgroundColor: '#141417' }, style]}>
      <WebView
        key={generation}
        ref={webViewRef}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request) => isFramePage(request.url)}
        onLoadStart={() => { readyRef.current = false; }}
        onMessage={handleMessage}
        onRenderProcessGone={restart}
        onContentProcessDidTerminate={restart}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        textZoom={100}
        overScrollMode="never"
        style={{ flex: 1, backgroundColor: '#141417' }}
      />
    </View>
  );
}
