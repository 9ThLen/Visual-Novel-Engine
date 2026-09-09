import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { spacing, typeScale } from '@/lib/design-tokens';
import {
  computeSceneGraphLayout,
  NODE_WIDTH,
  type SceneGraphEdge,
  type SceneGraphNode,
} from '@/lib/scene-graph-layout';
import type { SceneRecord } from '@/lib/engine/types';

interface SceneGraphViewProps {
  scenes: SceneRecord[];
  startSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  /** Empty-state copy, supplied by the caller so this component stays i18n-free. */
  emptyLabel: string;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const ARROW_SIZE = 7;
const TITLE_CHAR_BUDGET = Math.floor((NODE_WIDTH - 28) / 8);

function fitTitle(text: string): string {
  if (text.length <= TITLE_CHAR_BUDGET) return text;
  return `${text.slice(0, TITLE_CHAR_BUDGET - 1)}…`;
}

/**
 * A cubic-bezier path from the right edge of the source node to the left edge
 * of the target, plus the arrowhead triangle points at the target end. Control
 * points are pulled horizontally so sibling branches fan out smoothly.
 */
function buildEdgeGeometry(from: SceneGraphNode, to: SceneGraphNode): { path: string; arrow: string } {
  const sx = from.x + from.width;
  const sy = from.y + from.height / 2;
  const tx = to.x;
  const ty = to.y + to.height / 2;
  const dx = Math.max(Math.abs(tx - sx) * 0.5, 40);
  const c1x = sx + dx;
  const c2x = tx - dx;

  const path = `M ${sx} ${sy} C ${c1x} ${sy} ${c2x} ${ty} ${tx} ${ty}`;

  // The curve arrives horizontally at the target's left edge, so the arrowhead
  // always points right into the node.
  const arrow = [
    `${tx},${ty}`,
    `${tx - ARROW_SIZE},${ty - ARROW_SIZE * 0.6}`,
    `${tx - ARROW_SIZE},${ty + ARROW_SIZE * 0.6}`,
  ].join(' ');

  return { path, arrow };
}

export function SceneGraphView({ scenes, startSceneId, onSelectScene, emptyLabel }: SceneGraphViewProps) {
  const colors = useColors();
  const containerRef = useRef<View>(null);

  const layout = useMemo(
    () => computeSceneGraphLayout(scenes, startSceneId),
    [scenes, startSceneId],
  );
  const nodeById = useMemo(() => {
    const map = new Map<string, SceneGraphNode>();
    for (const node of layout.nodes) map.set(node.sceneId, node);
    return map;
  }, [layout.nodes]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  // Web-only wheel zoom. Attached imperatively so we don't fight React Native's
  // View typings (which have no onWheel). Native falls back to pinch.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor));
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [scale]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Only activate after a small drag so taps still reach the SVG nodes.
        .activeOffsetX([-8, 8])
        .activeOffsetY([-8, 8])
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = startX.value + event.translationX;
          translateY.value = startY.value + event.translationY;
        }),
    [startX, startY, translateX, translateY],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          startScale.value = scale.value;
        })
        .onUpdate((event) => {
          scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.value * event.scale));
        }),
    [scale, startScale],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (layout.nodes.length === 0) {
    return (
      <View style={[styles.emptyState, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.muted }]}>{emptyLabel}</Text>
      </View>
    );
  }

  const nextColor = colors.primary;
  const choiceColor = colors.muted;

  return (
    <View
      ref={containerRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      collapsable={false}
    >
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.canvas, animatedStyle]}>
          <Svg width={layout.width} height={layout.height}>
            {layout.edges.map((edge: SceneGraphEdge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const { path, arrow } = buildEdgeGeometry(from, to);
              const stroke = edge.kind === 'choice' ? choiceColor : nextColor;
              const midX = (from.x + from.width + to.x) / 2;
              const midY = (from.y + to.y) / 2 + from.height / 2;
              return (
                <G key={`${edge.from}-${edge.to}-${edge.kind}`}>
                  <Path
                    d={path}
                    stroke={stroke}
                    strokeWidth={1.5}
                    fill="none"
                    strokeDasharray={edge.kind === 'choice' ? '5 4' : undefined}
                    opacity={0.75}
                  />
                  <Polygon points={arrow} fill={stroke} opacity={0.85} />
                  {edge.kind === 'choice' && edge.label ? (
                    <SvgText
                      x={midX}
                      y={midY - 5}
                      fill={colors.muted}
                      fontSize={10}
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {edge.label}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}

            {layout.nodes.map((node: SceneGraphNode) => {
              const strokeColor = node.isStart
                ? colors.success
                : node.isUnreachable
                  ? colors.warning
                  : colors.border;
              const fillColor = node.isUnreachable
                ? withAlpha(colors.warning, 0.12)
                : colors.surface;
              return (
                <G key={node.sceneId} onPress={() => onSelectScene(node.sceneId)}>
                  <Rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={12}
                    ry={12}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={node.isStart ? 2 : 1.25}
                  />
                  {node.isStart ? (
                    <SvgText
                      x={node.x + 12}
                      y={node.y + 18}
                      fill={colors.success}
                      fontSize={9}
                      fontWeight="800"
                    >
                      START
                    </SvgText>
                  ) : null}
                  <SvgText
                    x={node.x + node.width / 2}
                    y={node.y + node.height / 2 + (node.isStart ? 8 : 4)}
                    fill={colors.foreground}
                    fontSize={13}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {fitTitle(node.title)}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typeScale.label,
    textAlign: 'center',
  },
});
