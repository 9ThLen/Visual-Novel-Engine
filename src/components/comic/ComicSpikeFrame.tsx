/**
 * The comic frame on Android: the same renderer document as the web, in a
 * `react-native-webview` WebView. Spike code for stage 1 of the comic plan —
 * the project's first native WebView host (`PlateWebViewEditor.tsx` only
 * re-exports the web file).
 *
 * A WebView has no origin to check and no source window. The frame posts
 * through `ReactNativeWebView.postMessage`, and every message must carry this
 * session's token; the host speaks through `injectJavaScript`, which only the
 * page we loaded can receive. Navigation away from that page is refused, so no
 * other document ever gets to post.
 *
 * Images arrive as file:// URLs (expo-asset copies bundled art into the cache
 * directory, and the media library keeps its files on disk), hence
 * `allowFileAccess` and a file:// base URL.
 */
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  comicInjectionFor,
  createComicRendererHtml,
  createComicSessionToken,
  readComicFrameMessage,
  type ComicHostMessage,
} from '@/lib/comic/spike/comic-renderer-html';

import type { ComicSpikeFrameHandle, ComicSpikeFrameProps } from './comic-spike-frame-types';

export type { ComicSpikeFrameHandle, ComicSpikeFrameProps } from './comic-spike-frame-types';

const BASE_URL = 'file:///android_asset/comic/';

function isFramePage(url: string): boolean {
  return url === 'about:blank' || url.startsWith(BASE_URL) || url.startsWith('data:');
}

export const ComicSpikeFrame = forwardRef<ComicSpikeFrameHandle, ComicSpikeFrameProps>(function ComicSpikeFrame({
  strip,
  textScale,
  virtualize,
  keepScreens,
  font,
  textZoomMode = 'explicit',
  onMessage,
  style,
}, ref) {
  const [token] = useState(createComicSessionToken);
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const initialTextScaleRef = useRef(textScale);
  const sentScaleRef = useRef(textScale);

  const html = useMemo(() => createComicRendererHtml({
    token,
    textScale: textZoomMode === 'explicit' ? initialTextScaleRef.current : 1,
    virtualize,
    keepScreens,
    font,
  }), [font, keepScreens, textZoomMode, token, virtualize]);

  // A new document starts unready; its own 'ready' is what sends the strip.
  React.useEffect(() => {
    readyRef.current = false;
  }, [html]);

  const send = useCallback((message: ComicHostMessage) => {
    webViewRef.current?.injectJavaScript(comicInjectionFor(message, token));
  }, [token]);

  useImperativeHandle(ref, () => ({ send }), [send]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = readComicFrameMessage(event.nativeEvent.data, token);
    if (!message) return;
    if (message.type === 'ready') {
      readyRef.current = true;
      if (stripRef.current) send({ type: 'strip', strip: stripRef.current });
    }
    onMessageRef.current(message);
  }, [send, token]);

  React.useEffect(() => {
    if (readyRef.current && strip) send({ type: 'strip', strip });
  }, [send, strip]);

  React.useEffect(() => {
    if (textZoomMode !== 'explicit' || sentScaleRef.current === textScale) return;
    sentScaleRef.current = textScale;
    if (readyRef.current) send({ type: 'textScale', scale: textScale });
  }, [send, textScale, textZoomMode]);

  return (
    <View style={[{ flex: 1, alignSelf: 'stretch', backgroundColor: '#141417' }, style]}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request) => isFramePage(request.url)}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        textZoom={textZoomMode === 'explicit' ? 100 : undefined}
        overScrollMode="never"
        // Spike only: lets chrome://inspect attach to a release build, which
        // is how the frame's heap and timings are read on a device.
        webviewDebuggingEnabled
        style={{ flex: 1, backgroundColor: '#141417' }}
      />
    </View>
  );
});
