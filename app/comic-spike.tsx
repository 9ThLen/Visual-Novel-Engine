/**
 * app/comic-spike.tsx — stage 1 of the comic plan: the renderer spike.
 *
 * Not a feature and not linked from anywhere. It draws the hard-coded strip
 * (src/lib/comic/spike/) with either renderer and reports what the plan asks
 * the spike to measure, as `[comic-spike] {...}` lines on the console — which
 * a built Android app sends to logcat — and, on the web, in
 * `window.__comicSpikeLog`.
 *
 * Query parameters, so a measurement can be started from outside
 * (`adb shell am start -d <scheme>://comic-spike?...`, or a browser URL):
 *   renderer=html|native  pages=24  virtualize=1|0  keep=2  scale=<number>
 *   assets=cache|res (Android)  zoom=explicit|system (Android)
 *   autorun=1  speed=<px per second>  delay=<ms before the scroll test>
 * Stage 2 replaces this screen with the real ComicReader.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicSpikeFrame } from '@/components/comic/ComicSpikeFrame';
import { ComicSpikeNativeStrip } from '@/components/comic/ComicSpikeNativeStrip';
import type { ComicSpikeFrameHandle } from '@/components/comic/comic-spike-frame-types';
import { resolveSpikeImageUrls, spikeImageModules, type SpikeAssetMode } from '@/components/comic/spike-image-urls';
import type { ComicFrameMessage } from '@/lib/comic/spike/comic-renderer-html';
import { SPIKE_FONT_FAMILY, SPIKE_FONT_TTF_BASE64 } from '@/lib/comic/spike/spike-font';
import { buildSpikeStrip } from '@/lib/comic/spike/spike-page-plan';

type RendererKind = 'html' | 'native';

const AUTORUN_SCALES = [1.3, 2];

function numberParam(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/*
 * Android cuts a logcat line at about 4 KB, and the stats list every image URL
 * the frame loaded. The console line keeps the count and any that left the
 * device (http/https); the web log keeps everything.
 */
function compact(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, field]) => {
    if (key === 'networkRequests' && Array.isArray(field)) {
      return [key, { count: field.length, remote: field.filter((url) => /^https?:/.test(String(url))) }];
    }
    if ((key === 'failedImages' || key === 'missingImages') && Array.isArray(field)) {
      return [key, { count: field.length, first: field.slice(0, 3) }];
    }
    return [key, compact(field)];
  });
  return Object.fromEntries(entries);
}

function record(event: string, data: Record<string, unknown>): string {
  const line = JSON.stringify(compact({ event, platform: Platform.OS, ...data }));
  console.log(`[comic-spike] ${line}`);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const target = window as unknown as { __comicSpikeLog?: unknown[] };
    (target.__comicSpikeLog ??= []).push({ event, ...data });
  }
  return line;
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#2c2c33', marginRight: 6, marginBottom: 6 }}
    >
      <Text allowFontScaling={false} style={{ color: '#f3eee4', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function ComicSpikeRoute() {
  const params = useLocalSearchParams<{
    renderer?: string;
    pages?: string;
    virtualize?: string;
    keep?: string;
    scale?: string;
    assets?: string;
    zoom?: string;
    autorun?: string;
    speed?: string;
    delay?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [renderer, setRenderer] = useState<RendererKind>(params.renderer === 'native' ? 'native' : 'html');
  const [virtualize, setVirtualize] = useState(params.virtualize !== '0');
  const systemScale = PixelRatio.getFontScale();
  const [textScale, setTextScale] = useState(numberParam(params.scale, systemScale, 0.5, 4));
  const pageCount = numberParam(params.pages, 24, 1, 200);
  const keepScreens = numberParam(params.keep, 2, 0.5, 10);
  const speed = numberParam(params.speed, 2000, 100, 20000);
  // Room for an outside tool to read memory before the scroll starts, so its
  // probing does not land in the frame times.
  const scrollDelay = numberParam(params.delay, 1500, 0, 60000);
  // 'res' by default: in a release build expo-asset hands back a drawable's
  // name, not a file, so 'cache' leaves the WebView nothing to load.
  const assetMode: SpikeAssetMode = params.assets === 'cache' ? 'cache' : 'res';
  const textZoomMode = params.zoom === 'system' ? 'system' : 'explicit';
  const autorun = params.autorun === '1';

  // A run starts when the screen mounts or the renderer is switched: that is
  // the clock the first page is measured against.
  const [runId, setRunId] = useState(0);
  const runStartRef = useRef(Date.now());
  const [images, setImages] = useState<Record<string, string> | null>(null);
  const assetMsRef = useRef<number | null>(null);
  const frameRef = useRef<ComicSpikeFrameHandle>(null);
  const autorunStepRef = useRef(0);
  const awaitingStatsRef = useRef(false);
  const [summary, setSummary] = useState<string[]>([]);

  const pages = useMemo(() => buildSpikeStrip(pageCount), [pageCount]);
  const strip = useMemo(() => (images ? { pages, images } : null), [images, pages]);
  const font = useMemo(() => (renderer === 'html'
    ? { family: SPIKE_FONT_FAMILY, dataUri: `data:font/ttf;base64,${SPIKE_FONT_TTF_BASE64}` }
    : undefined), [renderer]);

  const note = useCallback((line: string) => {
    setSummary((current) => [line, ...current].slice(0, 4));
  }, []);

  useEffect(() => {
    let cancelled = false;
    runStartRef.current = Date.now();
    autorunStepRef.current = 0;
    setImages(null);
    const started = Date.now();
    resolveSpikeImageUrls(assetMode)
      .then((urls) => {
        if (cancelled) return;
        assetMsRef.current = Date.now() - started;
        record('assets', { renderer, assetMode, ms: assetMsRef.current, sample: urls['bg-grand-hall'] });
        setImages(urls);
      })
      .catch((error: unknown) => {
        record('error', { renderer, stage: 'assets', message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [assetMode, renderer, runId]);

  const advanceAutorun = useCallback(() => {
    if (!autorun) return;
    const step = autorunStepRef.current;
    autorunStepRef.current += 1;
    if (step === 0) {
      setTimeout(() => {
        record('scrollStart', { renderer });
        frameRef.current?.send({ type: 'scrollTest', pxPerSecond: speed });
      }, scrollDelay);
    } else if (step <= AUTORUN_SCALES.length) {
      setTextScale(AUTORUN_SCALES[step - 1]);
      setTimeout(() => {
        awaitingStatsRef.current = true;
        frameRef.current?.send({ type: 'stats' });
      }, 1500);
    } else {
      record('done', { renderer });
    }
  }, [autorun, renderer, scrollDelay, speed]);

  const handleMessage = useCallback((message: ComicFrameMessage) => {
    if (message.type === 'firstPage') {
      const { marks } = message;
      const sinceStrip = (value?: number) => (value !== undefined && marks.stripReceived !== undefined
        ? Math.round(value - marks.stripReceived)
        : null);
      const totalMs = message.paintedAtEpochMs - runStartRef.current;
      record('firstPage', {
        renderer,
        virtualize,
        textZoomMode,
        totalMs,
        assetMs: assetMsRef.current,
        frame: {
          readyMs: marks.ready !== undefined ? Math.round(marks.ready - marks.scriptStart) : null,
          buildMs: sinceStrip(marks.firstPageBuilt),
          imagesMs: sinceStrip(marks.firstPageImages),
          fontMs: sinceStrip(marks.fontReady),
          paintedMs: sinceStrip(marks.firstPagePainted),
        },
        imagesOnFirstPage: message.imagesOnFirstPage,
        stats: message.stats,
      });
      note(`first page ${totalMs} ms (assets ${assetMsRef.current} ms)`);
      advanceAutorun();
    } else if (message.type === 'scrollResult') {
      const { result } = message;
      record('scroll', { renderer, virtualize, result, stats: message.stats });
      note(`scroll p50 ${result.frameMs.p50} p95 ${result.frameMs.p95} max ${result.frameMs.max} ms, dropped ${result.droppedFrames}/${result.frames}, blank ${result.blankFrames}`);
      advanceAutorun();
    } else if (message.type === 'stats') {
      record('stats', { renderer, stats: message.stats });
      note(`×${message.stats.textScale}: overflow ${message.stats.overflowBubbles}/${message.stats.liveBubbles} bubbles, ${message.stats.livePages} pages live`);
      if (awaitingStatsRef.current) {
        awaitingStatsRef.current = false;
        advanceAutorun();
      }
    } else if (message.type === 'error') {
      record('error', { renderer, message: message.message });
    }
  }, [advanceAutorun, note, renderer, textZoomMode, virtualize]);

  const restart = (next: RendererKind) => {
    setRenderer(next);
    setRunId((id) => id + 1);
  };

  const Renderer = renderer === 'html' ? ComicSpikeFrame : ComicSpikeNativeStrip;

  return (
    <View style={{ flex: 1, backgroundColor: '#141417', paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 10, paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Button label={`Renderer: ${renderer}`} onPress={() => restart(renderer === 'html' ? 'native' : 'html')} />
          <Button
            label={`Virtualize: ${virtualize ? 'on' : 'off'}`}
            onPress={() => {
              setVirtualize((value) => !value);
              setRunId((id) => id + 1);
            }}
          />
          <Button label={`Text ×${textScale}`} onPress={() => setTextScale((value) => (value < 1.2 ? 1.3 : value < 1.9 ? 2 : 1))} />
          <Button label="Scroll test" onPress={() => frameRef.current?.send({ type: 'scrollTest', pxPerSecond: speed })} />
          <Button label="Stats" onPress={() => frameRef.current?.send({ type: 'stats' })} />
        </View>
        {summary.map((line, index) => (
          <Text key={`${index}-${line}`} allowFontScaling={false} style={{ color: '#b9b4aa', fontSize: 11 }} numberOfLines={1}>
            {line}
          </Text>
        ))}
      </View>
      <Renderer
        key={`${renderer}-${runId}-${virtualize ? 'v' : 'n'}`}
        ref={frameRef}
        strip={strip}
        textScale={textScale}
        virtualize={virtualize}
        keepScreens={keepScreens}
        font={font}
        textZoomMode={textZoomMode}
        imageModules={renderer === 'native' ? spikeImageModules() : undefined}
        onMessage={handleMessage}
      />
    </View>
  );
}
