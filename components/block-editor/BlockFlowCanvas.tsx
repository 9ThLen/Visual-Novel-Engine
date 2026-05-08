import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  PanResponder,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Defs, Marker, Line as SvgLine, G } from 'react-native-svg';
import { Block, BlockType, createDefaultBlock } from '../../lib/block-types';
import { getBlockEntry } from '../../lib/block-registry';
import { BlockPickerModal } from './BlockPickerModal';
import { BlockConfigPanel } from './BlockConfigPanel';
import { BlockConnectionPort, getPortCenter } from './BlockConnectionPort';
import {
  FlowEdge,
  PortSide,
  ConnectionDrag,
  Viewport,
  BLOCK_SIZE,
  GRID_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  SceneGroup,
  SceneEdge,
} from './types';
import { detectSceneGroups, assignSceneIds } from '../../lib/scene-groups';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_SIZE = 4000;
const PORT_SIDES: PortSide[] = ['top', 'bottom', 'left', 'right'];

// Memoized Grid component - renders only once since it's completely static
const Grid = React.memo<{ colors: { border: string } }>(({ colors }) => (
  <G opacity={0.06}>
    {Array.from({ length: Math.ceil(CANVAS_SIZE / GRID_SIZE) }).map((_, i) => (
      <React.Fragment key={i}>
        <SvgLine
          x1={0}
          y1={i * GRID_SIZE}
          x2={CANVAS_SIZE}
          y2={i * GRID_SIZE}
          stroke={colors.border}
          strokeWidth={1}
        />
        <SvgLine
          x1={i * GRID_SIZE}
          y1={0}
          x2={i * GRID_SIZE}
          y2={CANVAS_SIZE}
          stroke={colors.border}
          strokeWidth={1}
        />
      </React.Fragment>
    ))}
  </G>
));

interface BlockFlowCanvasProps {
  root: Block;
  onChange: (root: Block) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sceneList: string[];
  characterList: string[];
  colors: {
    foreground: string;
    background: string;
    surface: string;
    border: string;
    muted: string;
    primary: string;
  };
}

export const BlockFlowCanvas: React.FC<BlockFlowCanvasProps> = ({
  root,
  onChange,
  selectedId,
  onSelect,
  sceneList,
  characterList,
  colors,
}) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [sceneEdges, setSceneEdges] = useState<SceneEdge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ nodeId: string; side: PortSide } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const lastTouchRef = useRef({ x: 0, y: 0 });
  const isDraggingBlockRef = useRef(false);
  const dragInitialStateRef = useRef<Record<string, { initialBlockX: number; initialBlockY: number; initialTouchX: number; initialTouchY: number }>>({});
  const dragTempPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const isDraggingSceneRef = useRef(false);

  // Store root.children in a ref to avoid recreating PanResponder on every change
  const rootChildrenRef = useRef(root.children);
  const viewportRef = useRef(viewport);

  // Update refs when values change
  React.useEffect(() => {
    rootChildrenRef.current = root.children;
  }, [root.children]);

  React.useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // ── Block operations ──

  // Memoize children with positions to avoid recreating array on every call
  const childrenWithPosition = useMemo((): (Block & { x: number; y: number })[] => {
    return root.children.map((b, i) => ({
      ...b,
      x: b.x ?? (i % 5) * (BLOCK_SIZE + 40) + 200,
      y: b.y ?? Math.floor(i / 5) * (BLOCK_SIZE + 60) + 200,
    }));
  }, [root.children]);

  const updateBlockPosition = useCallback(
    (id: string, x: number, y: number, snap: boolean = true) => {
      const finalX = snap ? Math.round(x / GRID_SIZE) * GRID_SIZE : x;
      const finalY = snap ? Math.round(y / GRID_SIZE) * GRID_SIZE : y;
      const newChildren = root.children.map((b) =>
        b.id === id ? { ...b, x: finalX, y: finalY } : b
      );
      onChange({ ...root, children: newChildren });
    },
    [root, onChange]
  );

  // ── Scene grouping ──

  const sceneGroups = useMemo(() => {
    if (childrenWithPosition.length === 0) return [];
    return detectSceneGroups(childrenWithPosition, 120);
  }, [childrenWithPosition]);

  // Assign scene IDs to blocks based on groups
  const blocksWithSceneIds = useMemo(() => {
    return assignSceneIds(root.children, sceneGroups);
  }, [root.children, sceneGroups]);

  const getGroupForBlock = useCallback(
    (blockId: string) => {
      return sceneGroups.find((g) => g.blockIds.includes(blockId)) || null;
    },
    [sceneGroups]
  );

  const handleAddBlock = useCallback(
    (type: BlockType) => {
      const newBlock = createDefaultBlock(type);
      const centerX = -viewport.x / viewport.zoom + SCREEN_W / 2 / viewport.zoom;
      const centerY = -viewport.y / viewport.zoom + SCREEN_H / 2 / viewport.zoom;
      newBlock.x = Math.round((centerX - BLOCK_SIZE / 2) / GRID_SIZE) * GRID_SIZE;
      newBlock.y = Math.round((centerY - BLOCK_SIZE / 2) / GRID_SIZE) * GRID_SIZE;

      onChange({ ...root, children: [...root.children, newBlock] });
    },
    [root, onChange, viewport]
  );

  const handleDeleteBlock = useCallback(
    (id: string) => {
      onChange({ ...root, children: root.children.filter((b) => b.id !== id) });
      setEdges((prev) => prev.filter((e) => e.fromNodeId !== id && e.toNodeId !== id));
      setSceneEdges((prev) => prev.filter((e) => {
        const fromGroup = sceneGroups.find((g) => g.blockIds.includes(e.fromSceneId));
        const toGroup = sceneGroups.find((g) => g.blockIds.includes(e.toSceneId));
        if (fromGroup && fromGroup.blockIds.length <= 1) return false;
        if (toGroup && toGroup.blockIds.length <= 1) return false;
        return true;
      }));
      if (selectedId === id) onSelect(null);
    },
    [root, onChange, selectedId, onSelect, sceneGroups]
  );

  const handleDuplicateBlock = useCallback(
    (id: string) => {
      const src = root.children.find((b) => b.id === id);
      if (!src) return;
      const clone = JSON.parse(JSON.stringify(src)) as Block;
      clone.id = 'block_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      clone.x = (src.x ?? 0) + BLOCK_SIZE + 20;
      clone.y = (src.y ?? 0);
      onChange({ ...root, children: [...root.children, clone] });
    },
    [root, onChange]
  );

  // ── Connection operations ──

  const handleConnectionStart = useCallback(
    (nodeId: string, side: PortSide) => {
      const block = childrenWithPosition.find((b) => b.id === nodeId);
      if (!block) return;
      const center = getPortCenter(side, block.x, block.y, BLOCK_SIZE);
      setConnectionDrag({
        fromNodeId: nodeId,
        fromSide: side,
        currentX: center.x,
        currentY: center.y,
      });
    },
    [childrenWithPosition]
  );

  const handleConnectionMove = useCallback(
    (screenX: number, screenY: number) => {
      if (!connectionDrag) return;
      const canvasX = (screenX - viewport.x) / viewport.zoom;
      const canvasY = (screenY - viewport.y) / viewport.zoom;
      setConnectionDrag((prev) =>
        prev ? { ...prev, currentX: canvasX, currentY: canvasY } : null
      );
    },
    [connectionDrag, viewport]
  );

  const handleConnectionEnd = useCallback(
    (toNodeId: string, toSide: PortSide) => {
      if (!connectionDrag) return;
      if (connectionDrag.fromNodeId === toNodeId) {
        setConnectionDrag(null);
        return;
      }

      const fromGroup = sceneGroups.find((g) => g.blockIds.includes(connectionDrag.fromNodeId));
      const toGroup = sceneGroups.find((g) => g.blockIds.includes(toNodeId));

      if (fromGroup && toGroup && fromGroup.id !== toGroup.id) {
        const exists = sceneEdges.find(
          (e) => e.fromSceneId === fromGroup.id && e.toSceneId === toGroup.id
        );
        if (!exists) {
          const newSceneEdge: SceneEdge = {
            id: 'scene_edge_' + Date.now(),
            fromSceneId: fromGroup.id,
            toSceneId: toGroup.id,
          };
          setSceneEdges((prev) => [...prev, newSceneEdge]);
        }
      } else {
        const exists = edges.find(
          (e) =>
            e.fromNodeId === connectionDrag.fromNodeId &&
            e.toNodeId === toNodeId
        );
        if (!exists) {
          const newEdge: FlowEdge = {
            id: 'edge_' + Date.now(),
            fromNodeId: connectionDrag.fromNodeId,
            fromSide: connectionDrag.fromSide,
            toNodeId,
            toSide,
          };
          setEdges((prev) => [...prev, newEdge]);
        }
      }
      setConnectionDrag(null);
    },
    [connectionDrag, edges, sceneEdges, sceneGroups]
  );

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  // ── Pan responder for canvas background ──

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isDraggingBlockRef.current,
        onMoveShouldSetPanResponder: () => !isDraggingBlockRef.current,
        onPanResponderGrant: (_, gesture) => {
          lastTouchRef.current = { x: gesture.x0, y: gesture.y0 };
          setIsPanning(true);
        },
        onPanResponderMove: (_, gesture) => {
          if (connectionDrag) {
            handleConnectionMove(gesture.moveX, gesture.moveY);
          } else {
            const dx = gesture.moveX - lastTouchRef.current.x;
            const dy = gesture.moveY - lastTouchRef.current.y;
            setViewport((prev) => ({
              ...prev,
              x: prev.x + dx,
              y: prev.y + dy,
            }));
            lastTouchRef.current = { x: gesture.moveX, y: gesture.moveY };
          }
        },
        onPanResponderRelease: () => {
          setIsPanning(false);
          if (connectionDrag) {
            setConnectionDrag(null);
          }
        },
      }),
    [connectionDrag, handleConnectionMove]
  );

  // ── Drag responder for blocks ──

  const createBlockDragResponder = useCallback(
    (blockId: string, groupBlockIds?: string[]) => {
      let startTouchX = 0;
      let startTouchY = 0;
      let startBlockX = 0;
      let startBlockY = 0;
      let isDragging = false;

      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, gesture) => {
          isDraggingBlockRef.current = true;
          isDragging = true;
          onSelect(blockId);

          const block = rootChildrenRef.current.find((b) => b.id === blockId);
          if (block) {
            startTouchX = gesture.x0;
            startTouchY = gesture.y0;
            startBlockX = block.x ?? 0;
            startBlockY = block.y ?? 0;

            // Initialize temp positions for all blocks in the group
            if (groupBlockIds && groupBlockIds.length > 1) {
              groupBlockIds.forEach((bid) => {
                const b = rootChildrenRef.current.find((bl) => bl.id === bid);
                if (b) {
                  dragTempPositionsRef.current[bid] = { x: b.x ?? 0, y: b.y ?? 0 };
                }
              });
            } else {
              dragTempPositionsRef.current[blockId] = { x: startBlockX, y: startBlockY };
            }
          }
        },
        onPanResponderMove: (_, gesture) => {
          if (!isDragging) return;

          const deltaScreenX = gesture.moveX - startTouchX;
          const deltaScreenY = gesture.moveY - startTouchY;
          const deltaCanvasX = deltaScreenX / viewportRef.current.zoom;
          const deltaCanvasY = deltaScreenY / viewportRef.current.zoom;

          // Update temp position for dragged block
          const newX = startBlockX + deltaCanvasX;
          const newY = startBlockY + deltaCanvasY;
          dragTempPositionsRef.current[blockId] = { x: newX, y: newY };

          // Update temp positions for grouped blocks
          if (groupBlockIds && groupBlockIds.length > 1) {
            groupBlockIds.forEach((bid) => {
              if (bid === blockId) return;
              const b = rootChildrenRef.current.find((bl) => bl.id === bid);
              if (b) {
                dragTempPositionsRef.current[bid] = {
                  x: (b.x ?? 0) + deltaCanvasX,
                  y: (b.y ?? 0) + deltaCanvasY,
                };
              }
            });
          }
        },
        onPanResponderRelease: () => {
          isDraggingBlockRef.current = false;
          isDragging = false;

          // Update React state with final positions
          Object.entries(dragTempPositionsRef.current).forEach(([bid, pos]) => {
            const snappedX = Math.round(pos.x / GRID_SIZE) * GRID_SIZE;
            const snappedY = Math.round(pos.y / GRID_SIZE) * GRID_SIZE;
            updateBlockPosition(bid, snappedX, snappedY, true);
          });

          dragTempPositionsRef.current = {};
        },
      });
    },
    [updateBlockPosition, onSelect]
  );

  // ── Drag responder for scenes ──

  const createSceneDragResponder = useCallback(
    (group: SceneGroup) => {
      let sceneInitialTouchX = 0;
      let sceneInitialTouchY = 0;

      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, gesture) => {
          isDraggingSceneRef.current = true;
          sceneInitialTouchX = gesture.x0;
          sceneInitialTouchY = gesture.y0;
        },
        onPanResponderMove: (_, gesture) => {
          const deltaScreenX = gesture.moveX - sceneInitialTouchX;
          const deltaScreenY = gesture.moveY - sceneInitialTouchY;
          const deltaCanvasX = deltaScreenX / viewportRef.current.zoom;
          const deltaCanvasY = deltaScreenY / viewportRef.current.zoom;

          // Move all blocks in the scene
          group.blockIds.forEach((bid) => {
            const b = rootChildrenRef.current.find((bl) => bl.id === bid);
            if (b) {
              const newX = (b.x ?? 0) + deltaCanvasX;
              const newY = (b.y ?? 0) + deltaCanvasY;
              updateBlockPosition(bid, newX, newY, false);
            }
          });

          sceneInitialTouchX = gesture.moveX;
          sceneInitialTouchY = gesture.moveY;
        },
        onPanResponderRelease: () => {
          isDraggingSceneRef.current = false;
          // Snap all blocks in scene to grid
          group.blockIds.forEach((bid) => {
            const b = rootChildrenRef.current.find((bl) => bl.id === bid);
            if (b && b.x !== undefined && b.y !== undefined) {
              const snappedX = Math.round(b.x / GRID_SIZE) * GRID_SIZE;
              const snappedY = Math.round(b.y / GRID_SIZE) * GRID_SIZE;
              if (snappedX !== b.x || snappedY !== b.y) {
                updateBlockPosition(bid, snappedX, snappedY, true);
              }
            }
          });
        },
      });
    },
    [updateBlockPosition]
  );

  const selectedBlock = root.children.find((b) => b.id === selectedId) || null;
  const childrenWithPos = childrenWithPosition;

  // Get effective position (temp position during drag, otherwise stored position)
  const getEffectivePosition = useCallback((block: Block & { x: number; y: number }) => {
    // Check if there's a temp position for this block (either from block drag or scene drag)
    if (dragTempPositionsRef.current[block.id]) {
      return dragTempPositionsRef.current[block.id];
    }
    return { x: block.x ?? 0, y: block.y ?? 0 };
  }, []);

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Canvas area */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
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
              style={{
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                transform: [
                  { translateX: viewport.x },
                  { translateY: viewport.y },
                  { scale: viewport.zoom },
                ],
              }}
            >
              {/* Grid */}
              <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ position: 'absolute' }}>
                <Defs>
                  <Marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <Path d="M0,0 L0,8 L8,4 z" fill={colors.primary} />
                  </Marker>
                </Defs>
                <Grid colors={colors} />

                {/* Scene bounding boxes - rendered BEFORE blocks so scenes are behind */}
                {sceneGroups.map((group) => {
                  const sceneResponder = createSceneDragResponder(group);
                  return (
                    <View
                      key={group.id}
                      style={{
                        position: 'absolute',
                        left: group.bounds.minX - 5,
                        top: group.bounds.minY - 15,
                        width: group.bounds.maxX - group.bounds.minX + 10,
                        height: group.bounds.maxY - group.bounds.minY + 30,
                        borderWidth: 2,
                        borderColor: group.color + '40',
                        borderRadius: 16,
                        backgroundColor: group.color + '08',
                      }}
                      {...sceneResponder.panHandlers}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          top: -14,
                          left: 12,
                          backgroundColor: group.color + '20',
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: group.color,
                          }}
                        >
                          {group.label} ({group.blockIds.length})
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* Edges */}
                {edges.map((edge) => {
                  const fromBlock = childrenWithPos.find((b) => b.id === edge.fromNodeId);
                  const toBlock = childrenWithPos.find((b) => b.id === edge.toNodeId);
                  if (!fromBlock || !toBlock) return null;
                  const from = getPortCenter(edge.fromSide, fromBlock.x, fromBlock.y, BLOCK_SIZE);
                  const to = getPortCenter(edge.toSide, toBlock.x, toBlock.y, BLOCK_SIZE);
                  const dx = Math.abs(to.x - from.x) * 0.4;
                  const dy = Math.abs(to.y - from.y) * 0.4;
                  const cp1x = from.x + (edge.fromSide === 'left' ? -dx : edge.fromSide === 'right' ? dx : 0);
                  const cp1y = from.y + (edge.fromSide === 'top' ? -dy : edge.fromSide === 'bottom' ? dy : 0);
                  const cp2x = to.x + (edge.toSide === 'left' ? -dx : edge.toSide === 'right' ? dx : 0);
                  const cp2y = to.y + (edge.toSide === 'top' ? -dy : edge.toSide === 'bottom' ? dy : 0);
                  const d = 'M ' + from.x + ' ' + from.y + ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + to.x + ' ' + to.y;
                  return (
                    <React.Fragment key={edge.id}>
                      <Path d={d} stroke={colors.primary} strokeWidth={3} fill="none" opacity={0.5} markerEnd="url(#arrow)" />
                      <Path d={d} stroke="transparent" strokeWidth={16} fill="none" />
                    </React.Fragment>
                  );
                })}

                {/* Scene edges */}
                {sceneEdges.map((edge) => {
                  const fromGroup = sceneGroups.find((g) => g.blockIds.includes(edge.fromSceneId));
                  const toGroup = sceneGroups.find((g) => g.blockIds.includes(edge.toSceneId));
                  if (!fromGroup || !toGroup) return null;

                  const fromX = (fromGroup.bounds.minX + fromGroup.bounds.maxX) / 2;
                  const fromY = (fromGroup.bounds.minY + fromGroup.bounds.maxY) / 2;
                  const toX = (toGroup.bounds.minX + toGroup.bounds.maxX) / 2;
                  const toY = (toGroup.bounds.minY + toGroup.bounds.maxY) / 2;

                  const dx = Math.abs(toX - fromX) * 0.4;
                  const dy = Math.abs(toY - fromY) * 0.4;
                  const d = 'M ' + fromX + ' ' + fromY + ' C ' + (fromX + dx) + ' ' + fromY + ', ' + (toX - dx) + ' ' + toY + ', ' + toX + ' ' + toY;

                  return (
                    <React.Fragment key={edge.id}>
                      <Path d={d} stroke={fromGroup.color} strokeWidth={3} fill="none" opacity={0.6} markerEnd="url(#arrow)" strokeDasharray="8,4" />
                      <Path d={d} stroke="transparent" strokeWidth={16} fill="none" />
                    </React.Fragment>
                  );
                })}

                {/* Active connection line */}
                {connectionDrag && (() => {
                  const fromBlock = childrenWithPos.find((b) => b.id === connectionDrag.fromNodeId);
                  if (!fromBlock) return null;
                  const from = getPortCenter(connectionDrag.fromSide, fromBlock.x, fromBlock.y, BLOCK_SIZE);
                  return (
                    <SvgLine
                      x1={from.x}
                      y1={from.y}
                      x2={connectionDrag.currentX}
                      y2={connectionDrag.currentY}
                      stroke={colors.primary}
                      strokeWidth={2}
                      strokeDasharray="6,4"
                      opacity={0.7}
                    />
                  );
                })()}
              </Svg>

              {/* Blocks */}
              {childrenWithPos.map((block) => {
                const entry = getBlockEntry(block.type);
                const isSelected = selectedId === block.id;
                const group = getGroupForBlock(block.id);
                const dragResponder = createBlockDragResponder(
                  block.id,
                  group ? group.blockIds : undefined
                );
                const pos = getEffectivePosition(block);

                return (
                  <View
                    key={block.id}
                    style={{
                      position: 'absolute',
                      left: pos.x,
                      top: pos.y,
                      width: BLOCK_SIZE,
                      height: BLOCK_SIZE,
                    }}
                    {...dragResponder.panHandlers}
                  >
                    {/* Square block */}
                    <View
                      style={{
                        width: BLOCK_SIZE,
                        height: BLOCK_SIZE,
                        borderRadius: 16,
                        borderWidth: isSelected ? 3 : 2,
                        borderColor: isSelected ? colors.primary : entry.borderColor + '80',
                        backgroundColor: entry.colorLight,
                        justifyContent: 'center',
                        alignItems: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSelected ? 0.2 : 0.1,
                        shadowRadius: 4,
                        elevation: isSelected ? 4 : 2,
                      }}
                    >
                      <Text style={{ fontSize: 32 }}>{entry.icon}</Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: entry.borderColor,
                          marginTop: 4,
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {entry.labelUa}
                      </Text>
                    </View>

                    {/* Connection ports */}
                    {PORT_SIDES.map((side) => (
                      <BlockConnectionPort
                        key={side}
                        side={side}
                        blockX={0}
                        blockY={0}
                        blockSize={BLOCK_SIZE}
                        isActive={
                          connectionDrag?.fromNodeId === block.id &&
                          connectionDrag.fromSide === side
                        }
                        isHovered={
                          hoveredPort?.nodeId === block.id &&
                          hoveredPort?.side === side
                        }
                        onDragStart={(s) => handleConnectionStart(block.id, s)}
                        onDragEnd={() => setConnectionDrag(null)}
                        onDrop={(s) => handleConnectionEnd(block.id, s)}
                        colors={colors}
                      />
                    ))}

                    {/* Delete button when selected */}
                    {isSelected && (
                      <Pressable
                        onPress={() => handleDeleteBlock(block.id)}
                        style={{
                          position: 'absolute',
                          top: -8,
                          right: -8,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: '#EF4444',
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 20,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>x</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>

        {/* Toolbar */}
        <View
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            flexDirection: 'row',
            gap: 6,
          }}
        >
          <ToolBtn label="-" onPress={() => setViewport((p) => ({ ...p, zoom: Math.max(p.zoom - 0.2, MIN_ZOOM) }))} colors={colors} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 10,
              paddingVertical: 6,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>
              {Math.round(viewport.zoom * 100)}%
            </Text>
          </View>
          <ToolBtn label="+" onPress={() => setViewport((p) => ({ ...p, zoom: Math.min(p.zoom + 0.2, MAX_ZOOM) }))} colors={colors} />
          <ToolBtn label="⟲" onPress={() => setViewport({ x: 0, y: 0, zoom: 1 })} colors={colors} />
        </View>

        {/* Stats */}
        <View
          style={{
            position: 'absolute',
            bottom: 80,
            left: 12,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {root.children.length} block{root.children.length !== 1 ? 's' : ''} / {sceneGroups.length} scene{sceneGroups.length !== 1 ? 's' : ''} / {edges.length + sceneEdges.length} edge{(edges.length + sceneEdges.length) !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* FAB */}
        <Pressable
          onPress={() => setPickerVisible(true)}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Text style={{ fontSize: 28, color: '#fff', fontWeight: '300', marginTop: -2 }}>+</Text>
        </Pressable>

        {/* Empty state */}
        {root.children.length === 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: 12, opacity: 0.6 }}>🎬</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.foreground, opacity: 0.6 }}>
              Натисніть + щоб додати блок
            </Text>
          </View>
        )}
      </View>

      {/* Config panel */}
      {selectedBlock && (
        <BlockConfigPanel
          block={selectedBlock}
          onChange={(data) => {
            const newChildren = root.children.map((b) =>
              b.id === selectedId ? { ...b, data } : b
            );
            onChange({ ...root, children: newChildren });
          }}
          onClose={() => onSelect(null)}
          sceneList={sceneList}
          characterList={characterList}
          colors={colors}
        />
      )}

      {/* Picker modal */}
      <BlockPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleAddBlock}
        colors={colors}
      />
    </View>
  );
};

const ToolBtn: React.FC<{
  label: string;
  onPress: () => void;
  colors: any;
}> = ({ label, onPress, colors }) => (
  <Pressable
    onPress={onPress}
    style={{
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <Text style={{ fontSize: 18, fontWeight: '600', color: colors.foreground }}>{label}</Text>
  </Pressable>
);
