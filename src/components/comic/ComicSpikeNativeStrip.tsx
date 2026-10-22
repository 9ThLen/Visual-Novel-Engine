/**
 * The alternative the comic plan names (9.2): the same strip drawn with React
 * Native views, expo-image and react-native-svg instead of a web document.
 * Spike code for stage 1 — the smallest version that can be measured against
 * the frame with the same messages, not a reader.
 *
 * Two differences matter for the decision and are visible in the code:
 *  - a bubble's size is known only after `onLayout`, so tails take a second
 *    render pass, and nothing can be measured before it is drawn — pagination
 *    by text volume would have to render to find out;
 *  - expo-image decodes a picture at the size it is shown, while a WebView
 *    decodes the whole file.
 */
import { Image } from 'expo-image';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';

import type {
  ComicFrameMarks,
  ComicFrameMessage,
  ComicFrameStats,
  ComicHostMessage,
} from '@/lib/comic/spike/comic-renderer-html';
import type { ComicSpikeBubble, ComicSpikePage, ComicSpikePanel } from '@/lib/comic/spike/spike-page-plan';

import type { ComicSpikeFrameHandle, ComicSpikeFrameProps } from './comic-spike-frame-types';

/** Width over height of each sprite file, so a sprite can be sized before it loads. */
const SPRITE_ASPECT: Record<string, number> = {
  'char-librarian': 529 / 896,
  'char-guide': 384 / 583,
  'char-reflection': 587 / 1402,
  'char-demo-curator': 1024 / 1536,
};

const PAGE_GAP = 14;
const MAX_PAGE_WIDTH = 760;

interface Tracker {
  mountedPages: Set<number>;
  loadedByPage: Map<number, Set<string>>;
  imagesByPage: Map<number, number>;
  overflowByPage: Map<number, number>;
  failedImages: string[];
  builds: number;
  releases: number;
  onPageLoaded?: (index: number) => void;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function jsHeapMb(): number | null {
  const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => { js_heapSize?: number } } }).HermesInternal;
  const size = hermes?.getInstrumentedStats?.().js_heapSize;
  if (typeof size === 'number') return Math.round(size / 1048576 * 10) / 10;
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return memory?.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
}

function imageCount(page: ComicSpikePage): number {
  return page.panels.reduce((sum, panel) => sum + 1 + panel.sprites.length, 0);
}

const Bubble = memo(function Bubble({
  bubble,
  top,
  panelWidth,
  textScale,
  onMeasured,
}: {
  bubble: ComicSpikeBubble;
  top: number;
  panelWidth: number;
  textScale: number;
  onMeasured: (id: string, frame: { x: number; y: number; width: number; height: number }) => void;
}) {
  const kindStyle = bubble.kind === 'caption'
    ? { backgroundColor: '#fff3c4', borderRadius: 0 }
    : bubble.kind === 'shout'
      ? { borderWidth: 3, borderRadius: 5, transform: [{ rotate: '-1.5deg' }] }
      : bubble.kind === 'thought'
        ? { borderRadius: 30, borderStyle: 'dashed' as const }
        : null;
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => onMeasured(bubble.id, event.nativeEvent.layout)}
      style={[{
        position: 'absolute',
        left: bubble.x * panelWidth,
        top,
        maxWidth: bubble.maxWidth * panelWidth,
        paddingVertical: 6 * textScale,
        paddingHorizontal: 10 * textScale,
        backgroundColor: '#fff',
        borderColor: '#121212',
        borderWidth: 2,
        borderRadius: 16,
      }, kindStyle]}
    >
      {bubble.speaker && bubble.kind !== 'caption' ? (
        <Text allowFontScaling={false} style={{ fontSize: 9.5 * textScale, fontWeight: '700', opacity: 0.6, letterSpacing: 0.6 }}>
          {bubble.speaker.toUpperCase()}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 15 * textScale,
          lineHeight: 18.3 * textScale,
          color: '#121212',
          fontWeight: bubble.kind === 'shout' ? '800' : '400',
          fontStyle: bubble.kind === 'caption' ? 'italic' : 'normal',
        }}
      >
        {bubble.text}
      </Text>
    </View>
  );
});

const Panel = memo(function Panel({
  panel,
  pageIndex,
  pageWidth,
  pageHeight,
  textScale,
  images,
  tracker,
}: {
  panel: ComicSpikePanel;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  textScale: number;
  images: Record<string, string>;
  tracker: Tracker;
}) {
  const width = panel.rect.w * pageWidth;
  const height = panel.rect.h * pageHeight;
  const { focusX, focusY, zoom } = panel.background;
  const [frames, setFrames] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const handleMeasured = useCallback((id: string, frame: { x: number; y: number; width: number; height: number }) => {
    setFrames((current) => {
      const previous = current[id];
      // y is ignored: it is where the bubble was placed, not where it was meant to be.
      if (previous && previous.width === frame.width && previous.height === frame.height && previous.x === frame.x) {
        return current;
      }
      return { ...current, [id]: frame };
    });
  }, []);

  // Sizes come from onLayout; positions are worked out here, from where each
  // bubble was meant to be, so a bubble that lands on an earlier one moves
  // down below it, as the frame does. One more render pass for that.
  const placed = useMemo(() => {
    const result: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const taken: { x: number; y: number; width: number; height: number }[] = [];
    for (const bubble of panel.bubbles) {
      const size = frames[bubble.id];
      if (!size) continue;
      const rect = { x: size.x, y: bubble.y * height, width: size.width, height: size.height };
      for (const other of taken) {
        const overlaps = rect.x < other.x + other.width && rect.x + rect.width > other.x
          && rect.y < other.y + other.height && rect.y + rect.height > other.y;
        if (overlaps) rect.y = other.y + other.height + 6;
      }
      taken.push(rect);
      result[bubble.id] = rect;
    }
    return result;
  }, [frames, height, panel.bubbles]);

  useEffect(() => {
    let overflow = 0;
    for (const frame of Object.values(placed)) {
      if (frame.x + frame.width > width + 1 || frame.y + frame.height > height + 1) overflow += 1;
    }
    tracker.overflowByPage.set(pageIndex, (tracker.overflowByPage.get(pageIndex) ?? 0) + overflow);
    return () => {
      tracker.overflowByPage.set(pageIndex, Math.max(0, (tracker.overflowByPage.get(pageIndex) ?? 0) - overflow));
    };
  }, [height, pageIndex, placed, tracker, width]);

  const markLoaded = (key: string) => {
    const loaded = tracker.loadedByPage.get(pageIndex) ?? new Set<string>();
    loaded.add(key);
    tracker.loadedByPage.set(pageIndex, loaded);
    if (loaded.size >= (tracker.imagesByPage.get(pageIndex) ?? Infinity)) tracker.onPageLoaded?.(pageIndex);
  };

  // Scale about the focus point: RN transforms scale about the centre, so
  // shift by how far the focus point would move.
  const shiftX = (focusX * width - width / 2) * (1 - zoom);
  const shiftY = (focusY * height - height / 2) * (1 - zoom);

  return (
    <View
      style={{
        position: 'absolute',
        left: panel.rect.x * pageWidth,
        top: panel.rect.y * pageHeight,
        width,
        height,
        overflow: 'hidden',
        borderWidth: 3,
        borderColor: '#121212',
        backgroundColor: '#2a2a30',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ translateX: shiftX }, { translateY: shiftY }, { scale: zoom }] }}>
        <Image
          source={{ uri: images[panel.background.image] }}
          contentFit="cover"
          contentPosition={{ left: `${Math.round(focusX * 100)}%`, top: `${Math.round(focusY * 100)}%` }}
          onLoad={() => markLoaded(`${panel.id}:bg`)}
          onError={() => tracker.failedImages.push(panel.background.image)}
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
        />
        {panel.sprites.map((sprite, index) => {
          const spriteHeight = sprite.height * height;
          const spriteWidth = spriteHeight * (SPRITE_ASPECT[sprite.image] ?? 0.6);
          return (
            <Image
              key={`${sprite.image}-${index}`}
              source={{ uri: images[sprite.image] }}
              contentFit="contain"
              onLoad={() => markLoaded(`${panel.id}:s${index}`)}
              onError={() => tracker.failedImages.push(sprite.image)}
              style={{
                position: 'absolute',
                left: sprite.x * width - spriteWidth / 2,
                bottom: sprite.bottom * height,
                width: spriteWidth,
                height: spriteHeight,
                transform: sprite.flip ? [{ scaleX: -1 }] : undefined,
              }}
            />
          );
        })}
      </View>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        {panel.bubbles.map((bubble) => {
          const frame = placed[bubble.id];
          if (!frame || !bubble.tail) return null;
          const targetX = (focusX + (bubble.tail.x - focusX) * zoom) * width;
          const targetY = (focusY + (bubble.tail.y - focusY) * zoom) * height;
          const below = targetY > frame.y + frame.height;
          const baseY = below ? frame.y + frame.height - 2 : frame.y + 2;
          const baseX = Math.max(frame.x + 14, Math.min(frame.x + frame.width - 14, targetX));
          const reach = Math.min(Math.abs(targetY - baseY), 42 * textScale);
          const tipY = below ? baseY + reach : baseY - reach;
          const tipX = baseX + (targetX - baseX) * 0.35;
          if (bubble.kind === 'thought') {
            return [1, 2, 3].map((k) => (
              <Circle
                key={`${bubble.id}-${k}`}
                cx={baseX + (tipX - baseX) * k / 3}
                cy={baseY + (tipY - baseY) * k / 3}
                r={5 - k}
                fill="#fff"
                stroke="#121212"
                strokeWidth={2}
              />
            ));
          }
          const half = 7 * Math.min(textScale, 1.6);
          return (
            <Polygon
              key={bubble.id}
              points={`${baseX - half},${baseY} ${baseX + half},${baseY} ${tipX},${tipY}`}
              fill="#fff"
              stroke="#121212"
              strokeWidth={2}
            />
          );
        })}
      </Svg>
      {panel.bubbles.map((bubble) => (
        <Bubble
          key={bubble.id}
          bubble={bubble}
          top={placed[bubble.id]?.y ?? bubble.y * height}
          panelWidth={width}
          textScale={textScale}
          onMeasured={handleMeasured}
        />
      ))}
    </View>
  );
});

const Page = memo(function Page({
  page,
  index,
  pageWidth,
  textScale,
  images,
  tracker,
}: {
  page: ComicSpikePage;
  index: number;
  pageWidth: number;
  textScale: number;
  images: Record<string, string>;
  tracker: Tracker;
}) {
  const pageHeight = pageWidth * page.aspect;
  useEffect(() => {
    tracker.mountedPages.add(index);
    tracker.imagesByPage.set(index, imageCount(page));
    tracker.builds += 1;
    return () => {
      tracker.mountedPages.delete(index);
      tracker.loadedByPage.delete(index);
      tracker.releases += 1;
    };
  }, [index, page, tracker]);
  return (
    <View style={{ width: pageWidth, height: pageHeight, marginBottom: PAGE_GAP, backgroundColor: '#f3eee4', alignSelf: 'center' }}>
      {page.panels.map((panel) => (
        <Panel
          key={panel.id}
          panel={panel}
          pageIndex={index}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          textScale={textScale}
          images={images}
          tracker={tracker}
        />
      ))}
    </View>
  );
});

export const ComicSpikeNativeStrip = forwardRef<ComicSpikeFrameHandle, ComicSpikeFrameProps>(function ComicSpikeNativeStrip({
  strip,
  textScale,
  virtualize,
  keepScreens,
  onMessage,
  style,
}, ref) {
  const window = useWindowDimensions();
  const pageWidth = Math.min(MAX_PAGE_WIDTH, window.width);
  const listRef = useRef<FlatList<ComicSpikePage>>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const marksRef = useRef<ComicFrameMarks>({ scriptStart: now() });
  const visibleRef = useRef<number[]>([]);
  const scrollYRef = useRef(0);
  const firstPageSentRef = useRef(false);
  const trackerRef = useRef<Tracker>({
    mountedPages: new Set(),
    loadedByPage: new Map(),
    imagesByPage: new Map(),
    overflowByPage: new Map(),
    failedImages: [],
    builds: 0,
    releases: 0,
  });
  const tracker = trackerRef.current;
  const pages = strip?.pages ?? [];
  const images = strip?.images ?? {};

  const stats = useCallback((): ComicFrameStats => {
    let overflow = 0;
    for (const value of tracker.overflowByPage.values()) overflow += value;
    let liveImages = 0;
    let liveBubbles = 0;
    for (const index of tracker.mountedPages) {
      liveImages += tracker.imagesByPage.get(index) ?? 0;
      liveBubbles += pages[index]?.panels.reduce((sum, panel) => sum + panel.bubbles.length, 0) ?? 0;
    }
    return {
      pages: pages.length,
      livePages: tracker.mountedPages.size,
      liveImages,
      domNodes: 0,
      builds: tracker.builds,
      releases: tracker.releases,
      overflowBubbles: overflow,
      liveBubbles,
      failedImages: tracker.failedImages.slice(0, 20),
      missingImages: [],
      jsHeapMb: jsHeapMb(),
      decodedImageMb: 0,
      font: { family: null, loaded: false, latin: false, cyrillic: false },
      networkRequests: [],
      textScale,
      rootFontPx: null,
      viewport: { width: window.width, height: window.height, dpr: window.scale },
    };
  }, [pages, textScale, tracker, window.height, window.scale, window.width]);

  useEffect(() => {
    if (!strip) return;
    marksRef.current.stripReceived = now();
    tracker.onPageLoaded = (index) => {
      if (index !== 0 || firstPageSentRef.current) return;
      firstPageSentRef.current = true;
      marksRef.current.firstPageImages = now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        marksRef.current.firstPagePainted = now();
        onMessageRef.current({
          type: 'firstPage',
          marks: { ...marksRef.current },
          paintedAtEpochMs: Date.now(),
          imagesOnFirstPage: imageCount(strip.pages[0]),
          stats: stats(),
        });
      }));
    };
  }, [stats, strip, tracker]);

  const isBlank = useCallback(() => visibleRef.current.some((index) => {
    if (!tracker.mountedPages.has(index)) return true;
    return (tracker.loadedByPage.get(index)?.size ?? 0) < (tracker.imagesByPage.get(index) ?? 0);
  }), [tracker]);

  const runScrollTest = useCallback((pxPerSecond: number) => {
    const pageStride = (height: number) => height + PAGE_GAP;
    const total = pages.reduce((sum, page) => sum + pageStride(pageWidth * page.aspect), 0);
    const limit = Math.max(0, total - window.height);
    const deltas: number[] = [];
    let blank = 0;
    let maxLivePages = 0;
    let start = 0;
    let last = 0;
    const heapStart = jsHeapMb();
    let heapPeak = heapStart ?? 0;
    const buildsBefore = tracker.builds;
    const releasesBefore = tracker.releases;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    const step = (time: number) => {
      deltas.push(time - last);
      last = time;
      if (isBlank()) blank += 1;
      if (deltas.length % 10 === 0) {
        const heap = jsHeapMb();
        if (heap && heap > heapPeak) heapPeak = heap;
        maxLivePages = Math.max(maxLivePages, tracker.mountedPages.size);
      }
      const y = (time - start) / 1000 * pxPerSecond;
      listRef.current?.scrollToOffset({ offset: Math.min(y, limit), animated: false });
      if (y < limit) {
        requestAnimationFrame(step);
        return;
      }
      const sorted = [...deltas].sort((a, b) => a - b);
      const at = (p: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0) * 10) / 10;
      const message: ComicFrameMessage = {
        type: 'scrollResult',
        result: {
          pxPerSecond,
          scrollHeight: total,
          durationMs: Math.round(time - start),
          frames: deltas.length,
          frameMs: { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) },
          over25ms: deltas.filter((d) => d > 25).length,
          over50ms: deltas.filter((d) => d > 50).length,
          droppedFrames: deltas.reduce((sum, d) => sum + Math.max(0, Math.round(d / 16.667) - 1), 0),
          blankFrames: blank,
          maxLivePages,
          maxLiveImages: 0,
          builds: tracker.builds - buildsBefore,
          releases: tracker.releases - releasesBefore,
          jsHeapMb: { start: heapStart, peak: heapPeak || null, end: jsHeapMb() },
        },
        stats: stats(),
      };
      onMessageRef.current(message);
    };
    requestAnimationFrame((time) => {
      start = time;
      last = time;
      requestAnimationFrame(step);
    });
  }, [isBlank, pageWidth, pages, stats, tracker, window.height]);

  const send = useCallback((message: ComicHostMessage) => {
    if (message.type === 'scrollTest') runScrollTest(message.pxPerSecond);
    else if (message.type === 'stats' || message.type === 'textScale') {
      // A new scale re-renders through props; give the bubbles a frame to lay out.
      setTimeout(() => onMessageRef.current({ type: 'stats', stats: stats() }), 500);
    }
  }, [runScrollTest, stats]);

  useImperativeHandle(ref, () => ({ send }), [send]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    visibleRef.current = viewableItems.map((item) => item.index ?? -1).filter((index) => index >= 0);
  }).current;

  const getItemLayout = useCallback((data: ArrayLike<ComicSpikePage> | null | undefined, index: number) => {
    let offset = 0;
    for (let i = 0; i < index; i += 1) offset += pageWidth * (data?.[i]?.aspect ?? 1.45) + PAGE_GAP;
    return { length: pageWidth * (data?.[index]?.aspect ?? 1.45) + PAGE_GAP, offset, index };
  }, [pageWidth]);

  return (
    <View style={[{ flex: 1, alignSelf: 'stretch', backgroundColor: '#141417' }, style]}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(page) => page.id}
        renderItem={({ item, index }) => (
          <Page page={item} index={index} pageWidth={pageWidth} textScale={textScale} images={images} tracker={tracker} />
        )}
        getItemLayout={getItemLayout}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        // windowSize counts viewports: 1 + 2 × keepScreens matches the frame's margin.
        windowSize={virtualize ? 1 + 2 * keepScreens : Math.max(21, pages.length * 2)}
        removeClippedSubviews={virtualize && Platform.OS === 'android'}
        onScroll={(event) => { scrollYRef.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: window.height * 0.3 }}
      />
    </View>
  );
});
