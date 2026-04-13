/**
 * NodeCanvas Component
 * Interactive canvas with zoom, pan, and node management
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import Svg, { Path, Defs, Marker, G, Line } from 'react-native-svg';
import { useColors } from '@/hooks/use-colors';
import { StoryNode } from './StoryNode';
import type { Story } from '@/lib/types';
import type { NodeData, EdgeData, ViewportState, SelectionState } from './types';

interface Props {
  story: Story;
  selectedSceneId: string | null;
  onNodeSelect: (nodeId: string) => void;
  onNodeConnect: (sourceId: string, targetId: string) => void;
  onNodeContextMenu: (nodeId: string) => void;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 140;
const GRID_SIZE = 20;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

export function NodeCanvas({
  story,
  selectedSceneId,
  onNodeSelect,
  onNodeConnect,
  onNodeContextMenu,
}: Props) {
  const colors = useColors();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Viewport state
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  // Selection state
  const [selection, setSelection] = useState<SelectionState>({
    selectedNodeId: selectedSceneId,
    hoveredNodeId: null,
    isDragging: false,
    isConnecting: false,
    connectionSource: null,
  });

  const [connectionEnd, setConnectionEnd] = useState<{ x: number; y: number } | null>(null);

  // Build node data from story
  const nodes = useMemo(() => {
    return buildNodeLayout(story);
  }, [story]);

  // Build edges from choices
  const edges = useMemo(() => {
    return buildEdges(story, nodes);
  }, [story, nodes]);

  // Canvas dimensions
  const canvasWidth = Math.max(screenWidth * 2, ...nodes.map(n => n.position.x + NODE_WIDTH + 200));
  const canvasHeight = Math.max(screenHeight * 2, ...nodes.map(n => n.position.y + NODE_HEIGHT + 200));

  // Handle node press
  const handleNodePress = useCallback((nodeId: string) => {
    if (selection.isConnecting && selection.connectionSource) {
      // Complete connection
      if (selection.connectionSource !== nodeId) {
        onNodeConnect(selection.connectionSource, nodeId);
      }
      setSelection(prev => ({
        ...prev,
        isConnecting: false,
        connectionSource: null,
      }));
      setConnectionEnd(null);
    } else {
      // Select node
      onNodeSelect(nodeId);
      setSelection(prev => ({ ...prev, selectedNodeId: nodeId }));
    }
  }, [selection.isConnecting, selection.connectionSource, onNodeSelect, onNodeConnect]);

  // Handle connection start
  const handleConnectionStart = useCallback((nodeId: string) => {
    setSelection(prev => ({
      ...prev,
      isConnecting: true,
      connectionSource: nodeId,
    }));
  }, []);

  // Handle node long press
  const handleNodeLongPress = useCallback((nodeId: string) => {
    onNodeContextMenu(nodeId);
  }, [onNodeContextMenu]);

  // Zoom controls
  const handleZoomIn = () => {
    setViewport(prev => ({
      ...prev,
      zoom: Math.min(prev.zoom + 0.2, MAX_ZOOM),
    }));
  };

  const handleZoomOut = () => {
    setViewport(prev => ({
      ...prev,
      zoom: Math.max(prev.zoom - 0.2, MIN_ZOOM),
    }));
  };

  const handleResetView = () => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  // Pan responder for canvas dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setSelection(prev => ({ ...prev, isDragging: true }));
      },
      onPanResponderMove: (_, gesture) => {
        if (selection.isConnecting) {
          // Update connection line end point
          setConnectionEnd({
            x: gesture.moveX / viewport.zoom - viewport.x,
            y: gesture.moveY / viewport.zoom - viewport.y,
          });
        } else {
          // Pan canvas
          setViewport(prev => ({
            ...prev,
            x: prev.x + gesture.dx / viewport.zoom,
            y: prev.y + gesture.dy / viewport.zoom,
          }));
        }
      },
      onPanResponderRelease: () => {
        setSelection(prev => ({ ...prev, isDragging: false }));
        if (selection.isConnecting) {
          // Cancel connection if not completed
          setSelection(prev => ({
            ...prev,
            isConnecting: false,
            connectionSource: null,
          }));
          setConnectionEnd(null);
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.toolbarLeft}>
          <Text style={[styles.toolbarTitle, { color: colors.foreground }]}>
            Story Graph
          </Text>
          <Text style={[styles.toolbarSubtitle, { color: colors.muted }]}>
            {nodes.length} scenes
          </Text>
        </View>
        <View style={styles.toolbarRight}>
          <Pressable
            style={[styles.toolButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleZoomOut}
          >
            <Text style={[styles.toolButtonText, { color: colors.foreground }]}>−</Text>
          </Pressable>
          <Text style={[styles.zoomText, { color: colors.muted }]}>
            {Math.round(viewport.zoom * 100)}%
          </Text>
          <Pressable
            style={[styles.toolButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleZoomIn}
          >
            <Text style={[styles.toolButtonText, { color: colors.foreground }]}>+</Text>
          </Pressable>
          <Pressable
            style={[styles.toolButton, { backgroundColor: colors.primary }]}
            onPress={handleResetView}
          >
            <Text style={[styles.toolButtonText, { color: '#fff' }]}>⟲</Text>
          </Pressable>
        </View>
      </View>

      {/* Canvas */}
      <View style={styles.canvasContainer} {...panResponder.panHandlers}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
          >
            <View
              style={[
                styles.canvas,
                {
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: [
                    { translateX: viewport.x },
                    { translateY: viewport.y },
                    { scale: viewport.zoom },
                  ],
                },
              ]}
            >
              {/* Grid background */}
              <Svg style={StyleSheet.absoluteFillObject} width={canvasWidth} height={canvasHeight}>
                <Defs>
                  <Marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="3"
                    orient="auto"
                  >
                    <Path d="M0,0 L0,6 L9,3 z" fill={colors.primary} />
                  </Marker>
                </Defs>

                {/* Grid pattern */}
                <G opacity={0.1}>
                  {Array.from({ length: Math.ceil(canvasHeight / GRID_SIZE) }).map((_, i) => (
                    <Line
                      key={`h-${i}`}
                      x1={0}
                      y1={i * GRID_SIZE}
                      x2={canvasWidth}
                      y2={i * GRID_SIZE}
                      stroke={colors.border}
                      strokeWidth={1}
                    />
                  ))}
                  {Array.from({ length: Math.ceil(canvasWidth / GRID_SIZE) }).map((_, i) => (
                    <Line
                      key={`v-${i}`}
                      x1={i * GRID_SIZE}
                      y1={0}
                      x2={i * GRID_SIZE}
                      y2={canvasHeight}
                      stroke={colors.border}
                      strokeWidth={1}
                    />
                  ))}
                </G>

                {/* Edges */}
                {edges.map((edge) => {
                  const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
                  const targetNode = nodes.find(n => n.id === edge.targetNodeId);
                  if (!sourceNode || !targetNode) return null;

                  const x1 = sourceNode.position.x + NODE_WIDTH / 2;
                  const y1 = sourceNode.position.y + NODE_HEIGHT;
                  const x2 = targetNode.position.x + NODE_WIDTH / 2;
                  const y2 = targetNode.position.y;

                  // Bezier curve for smooth connections
                  const midY = (y1 + y2) / 2;
                  const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                  return (
                    <Path
                      key={edge.id}
                      d={path}
                      stroke={colors.primary}
                      strokeWidth={2}
                      fill="none"
                      opacity={0.6}
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })}

                {/* Active connection line */}
                {selection.isConnecting && selection.connectionSource && connectionEnd && (
                  <Line
                    x1={nodes.find(n => n.id === selection.connectionSource)!.position.x + NODE_WIDTH / 2}
                    y1={nodes.find(n => n.id === selection.connectionSource)!.position.y + NODE_HEIGHT}
                    x2={connectionEnd.x}
                    y2={connectionEnd.y}
                    stroke={colors.warning}
                    strokeWidth={2}
                    strokeDasharray="5,5"
                  />
                )}
              </Svg>

              {/* Nodes */}
              {nodes.map((node) => (
                <View
                  key={node.id}
                  style={[
                    styles.nodeWrapper,
                    {
                      left: node.position.x,
                      top: node.position.y,
                    },
                  ]}
                >
                  <StoryNode
                    node={node}
                    isSelected={node.id === selection.selectedNodeId}
                    isHovered={node.id === selection.hoveredNodeId}
                    onPress={() => handleNodePress(node.id)}
                    onLongPress={() => handleNodeLongPress(node.id)}
                    onConnectionStart={() => handleConnectionStart(node.id)}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {/* Status bar */}
      {selection.isConnecting && (
        <View style={[styles.statusBar, { backgroundColor: colors.warning }]}>
          <Text style={styles.statusText}>
            🔗 Connecting from "{selection.connectionSource}" - tap target scene or drag to cancel
          </Text>
        </View>
      )}
    </View>
  );
}

// Helper: Build node layout using force-directed algorithm
function buildNodeLayout(story: Story): NodeData[] {
  const scenes = Object.values(story.scenes);
  const nodes: NodeData[] = [];

  // Simple hierarchical layout (BFS-based)
  const levels = new Map<string, number>();
  const queue: string[] = [story.startSceneId];
  levels.set(story.startSceneId, 0);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const scene = story.scenes[id];
    if (!scene) continue;

    for (const choice of scene.choices) {
      if (!levels.has(choice.nextSceneId)) {
        levels.set(choice.nextSceneId, (levels.get(id) ?? 0) + 1);
      }
      queue.push(choice.nextSceneId);
    }
  }

  // Assign positions
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels.entries()) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  }

  // Unreachable scenes go to bottom
  const maxLevel = Math.max(0, ...levels.values());
  for (const scene of scenes) {
    if (!levels.has(scene.id)) {
      levels.set(scene.id, maxLevel + 1);
      if (!levelGroups.has(maxLevel + 1)) levelGroups.set(maxLevel + 1, []);
      levelGroups.get(maxLevel + 1)!.push(scene.id);
    }
  }

  // Position nodes
  for (const [level, ids] of levelGroups.entries()) {
    ids.forEach((id, index) => {
      const scene = story.scenes[id];
      const isEnd = scene.choices.length === 0;
      const warnings: string[] = [];

      if (!scene.text.trim()) warnings.push('No dialogue text');
      if (scene.choices.length === 0 && id !== story.startSceneId) warnings.push('Dead end');

      nodes.push({
        id,
        position: {
          x: 100 + index * (NODE_WIDTH + 60),
          y: 100 + level * (NODE_HEIGHT + 80),
        },
        size: { width: NODE_WIDTH, height: NODE_HEIGHT },
        isStart: id === story.startSceneId,
        isEnd,
        hasImage: !!scene.backgroundImageUri,
        hasAudio: !!scene.musicUri,
        hasVoice: !!scene.voiceAudioUri,
        choiceCount: scene.choices.length,
        textPreview: scene.text.slice(0, 60),
        warnings,
      });
    });
  }

  return nodes;
}

// Helper: Build edges from story choices
function buildEdges(story: Story, nodes: NodeData[]): EdgeData[] {
  const edges: EdgeData[] = [];

  for (const scene of Object.values(story.scenes)) {
    for (const choice of scene.choices) {
      edges.push({
        id: `${scene.id}-${choice.id}`,
        sourceNodeId: scene.id,
        targetNodeId: choice.nextSceneId,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        label: choice.text,
        choiceId: choice.id,
      });
    }
  }

  return edges;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  toolbarLeft: {
    flex: 1,
  },
  toolbarTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  toolbarSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  zoomText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 45,
    textAlign: 'center',
  },
  canvasContainer: {
    flex: 1,
  },
  canvas: {
    position: 'relative',
  },
  nodeWrapper: {
    position: 'absolute',
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
