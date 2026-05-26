/**
 * components/editor/StoryFlowScreen.tsx — Node graph editor for story flow
 *
 * Shows scenes as draggable nodes on a canvas with connections.
 * Features:
 * - Drag-and-drop scene nodes via PanResponder
 * - Visual connection lines between scenes
 * - Double-tap to connect scenes
 * - Auto-layout (BFS tree from start scene)
 * - Minimap for navigation
 * - Context menu: Edit, Set Start, Delete
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useAppStore } from '@/stores/use-app-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { Button } from '@/components/ui';
import { generateId } from '@/lib/id-utils';
import type { SceneConnection, SceneRecord } from '@/lib/engine/types';
import { createSceneRecordFromEditorDraft } from '@/lib/editor-scene-draft';
import { buildStoryFlowGraph } from '@/lib/story-flow-graph';
import type { StoryFlowGraphNode } from '@/lib/story-flow-graph';

const DESKTOP_NODE_WIDTH = 200;
const PHONE_NODE_WIDTH = 168;
const DESKTOP_NODE_HEIGHT = 80;
const PHONE_NODE_HEIGHT = 88;
const GRID_SIZE = 24;

export function StoryFlowScreen({ storyId }: { storyId: string }) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { deviceType } = useResponsiveLayout();
  const isPhone = deviceType === 'phone';
  const nodeWidth = isPhone ? PHONE_NODE_WIDTH : DESKTOP_NODE_WIDTH;
  const nodeHeight = isPhone ? PHONE_NODE_HEIGHT : DESKTOP_NODE_HEIGHT;

  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);
  const saveSceneRecord = useAppStore((s) => s.saveSceneRecord);
  const setStartScene = useAppStore((s) => s.setStartScene);
  const updateSceneConnection = useAppStore((s) => s.updateSceneConnection);
  const removeSceneConnection = useAppStore((s) => s.removeSceneConnection);

  const storyScenes: Record<string, SceneRecord> = sceneRecordsByStory[storyId] || {};
  const derivedGraph = useMemo(
    () => buildStoryFlowGraph({ storiesMetadata, sceneRecordsByStory }, storyId),
    [sceneRecordsByStory, storiesMetadata, storyId]
  );
  const [nodes, setNodes] = useState<StoryFlowGraphNode[]>(derivedGraph.nodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);

  useEffect(() => {
    setNodes(derivedGraph.nodes);
  }, [derivedGraph.nodes]);

  // Drag state
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Create PanResponder for drag
  const createPanResponder = useCallback((nodeId: string) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gesture) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        dragRef.current = {
          nodeId,
          startX: node.x,
          startY: node.y,
          currentX: node.x,
          currentY: node.y,
        };
      },
      onPanResponderMove: (_, gesture) => {
        if (!dragRef.current || dragRef.current.nodeId !== nodeId) return;
        const dx = gesture.dx;
        const dy = gesture.dy;
        const newX = Math.max(0, dragRef.current.startX + dx);
        const newY = Math.max(0, dragRef.current.startY + dy);
        // Snap to grid
        const snappedX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
        dragRef.current = {
          ...dragRef.current,
          currentX: snappedX,
          currentY: snappedY,
        };
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, x: snappedX, y: snappedY } : n
          )
        );
      },
      onPanResponderRelease: () => {
        if (!dragRef.current) return;
        // Save new position
        const scene = storyScenes[dragRef.current.nodeId];
        if (scene) {
          saveSceneRecord({
            ...scene,
            flowX: dragRef.current.currentX,
            flowY: dragRef.current.currentY,
          });
        }
        dragRef.current = null;
      },
    });
  }, [storyScenes, saveSceneRecord]);

  // Auto-layout: BFS tree from start scene
  const handleAutoLayout = useCallback(() => {
    if (!derivedGraph.startSceneId) return;
    const nodeMap = new Map(nodes.map((n) => [n.id, { ...n }]));
    const visited = new Set<string>();
    const queue: { id: string; depth: number; offset: number }[] = [
      { id: derivedGraph.startSceneId, depth: 0, offset: 0 },
    ];

    while (queue.length > 0) {
      const { id, depth, offset } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodeMap.get(id);
      if (!node) continue;

      node.x = 60 + depth * (nodeWidth + (isPhone ? 48 : 80));
      node.y = 60 + offset * (nodeHeight + (isPhone ? 32 : 40));

      const connections = storyScenes[id]?.connections || [];
      connections.forEach((conn, i) => {
        if (!visited.has(conn.targetSceneId)) {
          queue.push({ id: conn.targetSceneId, depth: depth + 1, offset: i });
        }
      });
    }

    setNodes(Array.from(nodeMap.values()));
    // Save positions
    nodeMap.forEach((node, id) => {
      const scene = storyScenes[id];
      if (scene) {
        saveSceneRecord({ ...scene, flowX: node.x, flowY: node.y });
      }
    });
  }, [derivedGraph.startSceneId, isPhone, nodeHeight, nodeWidth, nodes, storyScenes, saveSceneRecord]);

  // Handle node press (select or connect)
  const handleNodePress = useCallback((nodeId: string) => {
    if (connectMode && connectFromId && nodeId !== connectFromId) {
      // Create connection
      const conn: SceneConnection = {
        targetSceneId: nodeId,
        outputPort: 'next',
        label: '',
      };
      updateSceneConnection(storyId, connectFromId, conn);
      setConnectMode(false);
      setConnectFromId(null);
    } else {
      setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    }
  }, [connectMode, connectFromId, storyId, updateSceneConnection]);

  // Handle node long press (start connect mode)
  const handleNodeLongPress = useCallback((nodeId: string) => {
    setConnectMode(true);
    setConnectFromId(nodeId);
    setSelectedNodeId(nodeId);
  }, []);

  // Edit scene
  const handleEditScene = useCallback((sceneId: string) => {
    const scene = storyScenes[sceneId];
    if (scene) {
      useEditorStore.getState().setScene(scene.id, scene.name, scene.timeline || []);
    }
    router.push({
      pathname: '/scene-editor',
      params: { storyId, sceneId },
    } as never);
  }, [storyId, storyScenes, router]);

  // Create new scene
  const handleNewScene = useCallback(() => {
    const newId = generateId('scene');
    const record: SceneRecord = {
      ...createSceneRecordFromEditorDraft(storyId, {
        sceneId: newId,
        sceneName: `Scene ${Object.keys(storyScenes).length + 1}`,
        timeline: [],
      }),
      flowX: 100 + Math.round(Math.random() * 200),
      flowY: 100 + Math.round(Math.random() * 200),
    };
    saveSceneRecord(record);
  }, [storyId, storyScenes, saveSceneRecord]);

  // Connection lines
  const renderConnections = useMemo(() => {
    const lines: React.ReactNode[] = [];
    derivedGraph.edges.forEach((edge) => {
        const node = nodes.find((item) => item.id === edge.fromSceneId);
        const target = nodes.find((item) => item.id === edge.toSceneId);
        if (!target) return;
        if (!node) return;
        const x1 = node.x + nodeWidth;
        const y1 = node.y + nodeHeight / 2;
        const x2 = target.x;
        const y2 = target.y + nodeHeight / 2;
        const midX = (x1 + x2) / 2;

        lines.push(
          <View
            key={edge.id}
            style={{
              position: 'absolute',
              left: x1,
              top: y1 - 3,
              width: Math.max(x2 - x1, 2),
              height: 3,
              backgroundColor: colors.muted,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            }}
          />
        );
        // Arrow head
        lines.push(
          <View
            key={`arrow-${edge.id}`}
            style={{
              position: 'absolute',
              left: x2 - 8,
              top: y2 - 4,
              width: 0,
              height: 0,
              borderLeftWidth: 8,
              borderLeftColor: colors.muted,
              borderTopWidth: 4,
              borderTopColor: 'transparent',
              borderBottomWidth: 4,
              borderBottomColor: 'transparent',
            }}
          />
        );
        // Port label
        if (edge.outputPort) {
          lines.push(
            <View
              key={`label-${edge.id}`}
              style={{
                position: 'absolute',
                left: midX - 20,
                top: y1 - 18,
                backgroundColor: colors.surface,
                paddingHorizontal: 4,
                paddingVertical: 1,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 8, color: colors.muted }}>{edge.outputPort}</Text>
            </View>
          );
        }
    });
    return lines;
  }, [colors, derivedGraph.edges, nodeHeight, nodeWidth, nodes]);

  const canvasSize = useMemo(() => {
    const maxX = nodes.reduce((max, node) => Math.max(max, node.x), 0);
    const maxY = nodes.reduce((max, node) => Math.max(max, node.y), 0);

    return {
      width: Math.max(isPhone ? 1200 : 2400, maxX + nodeWidth + 160),
      height: Math.max(isPhone ? 1200 : 1600, maxY + nodeHeight + 160),
    };
  }, [isPhone, nodeHeight, nodeWidth, nodes]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: isPhone ? 'column' : 'row',
        alignItems: isPhone ? 'stretch' : 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
        gap: isPhone ? 12 : 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} style={{ padding: 8, marginRight: 8 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
            <Text style={{ color: colors.primary, fontSize: 18 }}>←</Text>
          </Pressable>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
              Story Flow
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {nodes.length} scenes · Long-press node to connect
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onPress={handleAutoLayout}>
            📐 Auto Layout
          </Button>
          <Button variant="secondary" size="sm" onPress={handleNewScene}>
            + Scene
          </Button>
        </View>
      </View>

      {/* Connect mode banner */}
      {connectMode && connectFromId && (
        <View style={{
          flexDirection: isPhone ? 'column' : 'row',
          alignItems: isPhone ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: colors.primary + '20',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: isPhone ? 8 : 12,
        }}>
          <Text style={{ color: colors.foreground, fontSize: 12 }}>
            Tap target scene to connect from{' '}
            <Text style={{ fontWeight: '600', color: colors.primary }}>
              {nodes.find((n) => n.id === connectFromId)?.name}
            </Text>
          </Text>
          <Pressable onPress={() => { setConnectMode(false); setConnectFromId(null); }} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
            <Text style={{ color: colors.danger, fontSize: 12 }}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      )}

      {/* Canvas */}
      <ScrollView
        horizontal
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsHorizontalScrollIndicator
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ minWidth: canvasSize.width, minHeight: canvasSize.height }}
          showsVerticalScrollIndicator
        >
          <View style={{
            width: canvasSize.width,
            height: canvasSize.height,
            position: 'relative',
            backgroundColor: colors.background,
          }}>
          {/* Grid dots */}
          {renderConnections}

          {/* Nodes */}
          {nodes.map((node) => {
            const panResponder = createPanResponder(node.id);
            return (
              <Pressable
                key={node.id}
                onPress={() => handleNodePress(node.id)}
                onLongPress={() => handleNodeLongPress(node.id)}
                accessibilityRole="button"
                accessibilityLabel={node.name}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: nodeWidth,
                  minHeight: nodeHeight,
                  backgroundColor: selectedNodeId === node.id
                    ? colors.primary + '30'
                    : colors.surface,
                  borderRadius: 12,
                  borderWidth: node.isStart ? 2 : selectedNodeId === node.id ? 2 : 1,
                  borderColor: node.isStart
                    ? colors.success
                    : selectedNodeId === node.id
                      ? colors.primary
                      : colors.border,
                  padding: 12,
                  elevation: selectedNodeId === node.id ? 6 : 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                }}
                {...panResponder.panHandlers}
              >
                {/* Start indicator */}
                {node.isStart && (
                  <View style={{
                    position: 'absolute',
                    top: -8,
                    left: 8,
                    backgroundColor: colors.success,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 4,
                  }}>
                    <Text style={{ fontSize: 9, color: colors['text-inverse'] ?? '#fff', fontWeight: '700' }}>START</Text>
                  </View>
                )}

                {/* Node title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.foreground,
                    flex: 1,
                  }} numberOfLines={1}>
                    {node.name}
                  </Text>
                </View>

                {/* Output ports */}
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                  {node.connections.map((conn) => (
                    <Text key={conn.targetSceneId + conn.outputPort} style={{
                      fontSize: 9,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 3,
                      backgroundColor: colors.primary + '20',
                      color: colors.primary,
                    }}>
                      ▶ {conn.outputPort}
                    </Text>
                  ))}
                </View>

                {/* Step count */}
                <Text style={{ fontSize: 10, color: colors.muted }}>
                  {node.stepCount} block{node.stepCount !== 1 ? 's' : ''}
                  {node.connections.length > 0 ? ` · ${node.connections.length} connection${node.connections.length !== 1 ? 's' : ''}` : ''}
                </Text>

                {/* Input port indicator */}
                <View style={{
                  position: 'absolute',
                  left: -6,
                  top: nodeHeight / 2 - 6,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: colors.success,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }} />
                {/* Output port indicator */}
                <View style={{
                  position: 'absolute',
                  right: -6,
                  top: nodeHeight / 2 - 6,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }} />
              </Pressable>
            );
          })}

          {/* Empty state */}
          {nodes.length === 0 && (
            <View style={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 16 }}>
                No scenes yet. Create a scene to see the story flow.
              </Text>
              <Button variant="primary" size="base" onPress={handleNewScene}>
                + Create First Scene
              </Button>
            </View>
          )}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Bottom toolbar */}
      <View style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        gap: 10,
      }}>
        <View style={{ flexDirection: isPhone ? 'column' : 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {nodes.length} scenes · {nodes.reduce((acc, n) => acc + n.connections.length, 0)} connections
          </Text>
          <Button
            variant="primary"
            size="sm"
            onPress={() => router.push({ pathname: '/play', params: { storyId } } as never)}
          >
            ▶ Play
          </Button>
        </View>
        {selectedNodeId && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => handleEditScene(selectedNodeId)}
            >
              ✏️ Edit
            </Button>
            {!nodes.find((n) => n.id === selectedNodeId)?.isStart && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => { setStartScene(storyId, selectedNodeId); setSelectedNodeId(null); }}
              >
                ▶ Set Start
              </Button>
            )}
            {(nodes.find((n) => n.id === selectedNodeId)?.connections || []).map((connection) => (
              <Button
                key={`${selectedNodeId}-${connection.targetSceneId}-${connection.outputPort}`}
                variant="ghost"
                size="sm"
                onPress={() =>
                  removeSceneConnection(
                    storyId,
                    selectedNodeId,
                    connection.targetSceneId,
                    connection.outputPort
                  )
                }
              >
                ✕ {connection.outputPort}
              </Button>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
