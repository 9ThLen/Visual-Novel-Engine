/**
 * SceneGraph — interactive visual node graph for scene editing.
 *
 * Layout: BFS from startSceneId assigns each scene a (col, row) position.
 * SVG arrows drawn between nodes.
 * Tap a node to navigate to it.
 * "Link mode": tap source → tap target to create a new choice link.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions } from 'react-native';
import Svg, { Line, Defs, Marker, Path } from 'react-native-svg';
import { useColors } from '@/hooks/use-colors';
import { Story } from '@/lib/types';

const NODE_W = 110;
const NODE_H = 52;
const H_GAP = 40;
const V_GAP = 36;

interface NodePos { id: string; col: number; row: number; x: number; y: number }

function layoutGraph(story: Story): { nodes: NodePos[]; totalW: number; totalH: number } {
  const sceneIds = Object.keys(story.scenes);
  const levelMap = new Map<string, number>();
  const colMap = new Map<string, number>();

  // BFS to assign levels
  const queue: string[] = [story.startSceneId];
  levelMap.set(story.startSceneId, 0);
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const scene = story.scenes[id];
    if (!scene) continue;
    for (const choice of scene.choices) {
      if (!levelMap.has(choice.nextSceneId)) {
        levelMap.set(choice.nextSceneId, (levelMap.get(id) ?? 0) + 1);
      }
      queue.push(choice.nextSceneId);
    }
  }

  // Scenes not reachable from start get level = max+1
  const maxLevel = Math.max(0, ...[...levelMap.values()]);
  for (const id of sceneIds) {
    if (!levelMap.has(id)) levelMap.set(id, maxLevel + 1);
  }

  // Group by level, sort
  const byLevel = new Map<number, string[]>();
  for (const [id, lvl] of levelMap.entries()) {
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(id);
  }

  const nodes: NodePos[] = [];
  let maxCol = 0;

  for (const [lvl, ids] of [...byLevel.entries()].sort(([a], [b]) => a - b)) {
    ids.forEach((id, col) => {
      colMap.set(id, col);
      maxCol = Math.max(maxCol, col);
      nodes.push({
        id,
        col,
        row: lvl,
        x: col * (NODE_W + H_GAP),
        y: lvl * (NODE_H + V_GAP),
      });
    });
  }

  const maxRow = Math.max(0, ...[...levelMap.values()]);
  return {
    nodes,
    totalW: (maxCol + 1) * (NODE_W + H_GAP) + 20,
    totalH: (maxRow + 1) * (NODE_H + V_GAP) + 20,
  };
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  story: Story;
  currentSceneId: string;
  onNavigate: (sceneId: string) => void;
  onLinkScenes?: (fromSceneId: string, toSceneId: string) => void;
}

export function SceneGraph({ story, currentSceneId, onNavigate, onLinkScenes }: Props) {
  const colors = useColors();
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);

  const { nodes, totalW, totalH } = useMemo(() => layoutGraph(story), [story]);
  const nodeMap = useMemo(() => {
    const m = new Map<string, NodePos>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Build edge list
  const edges = useMemo(() => {
    const list: { from: NodePos; to: NodePos; label: string }[] = [];
    for (const scene of Object.values(story.scenes)) {
      const fromNode = nodeMap.get(scene.id);
      if (!fromNode) continue;
      for (const choice of scene.choices) {
        const toNode = nodeMap.get(choice.nextSceneId);
        if (toNode) list.push({ from: fromNode, to: toNode, label: choice.text });
      }
    }
    return list;
  }, [story, nodeMap]);

  const handleNodePress = (id: string) => {
    if (linkMode) {
      if (!linkSource) {
        setLinkSource(id);
      } else if (linkSource !== id) {
        onLinkScenes?.(linkSource, id);
        setLinkSource(null);
        setLinkMode(false);
      }
    } else {
      onNavigate(id);
    }
  };

  const PAD = 10;

  return (
    <View>
      {/* Toolbar */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
        <Pressable
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: linkMode ? colors.primary : colors.surface,
            borderWidth: 1,
            borderColor: linkMode ? colors.primary : colors.border,
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => { setLinkMode(!linkMode); setLinkSource(null); }}
        >
          <Text style={{ color: linkMode ? '#fff' : colors.foreground, fontSize: 12, fontWeight: '600' }}>
            {linkMode
              ? (linkSource ? `Link from: ${linkSource} → tap target` : '🔗 Pick source scene')
              : '🔗 Link Mode'}
          </Text>
        </Pressable>
        {linkMode && (
          <Pressable
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
              backgroundColor: colors.error, opacity: pressed ? 0.8 : 1,
            })}
            onPress={() => { setLinkMode(false); setLinkSource(null); }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        )}
        <Text style={{ color: colors.muted, fontSize: 11, alignSelf: 'center' }}>
          {linkMode ? '' : 'Tap node to edit'}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ width: totalW + PAD * 2, height: totalH + PAD * 2 }}>
            {/* SVG edges */}
            <Svg
              style={{ position: 'absolute', top: 0, left: 0 }}
              width={totalW + PAD * 2}
              height={totalH + PAD * 2}
            >
              <Defs>
                <Marker
                  id="arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <Path d="M0,0 L0,6 L8,3 z" fill={colors.primary} />
                </Marker>
              </Defs>
              {edges.map((e, i) => {
                const x1 = PAD + e.from.x + NODE_W / 2;
                const y1 = PAD + e.from.y + NODE_H;
                const x2 = PAD + e.to.x + NODE_W / 2;
                const y2 = PAD + e.to.y;
                return (
                  <Line
                    key={i}
                    x1={x1} y1={y1}
                    x2={x2} y2={y2 - 6}
                    stroke={colors.primary}
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                    markerEnd="url(#arrow)"
                  />
                );
              })}
            </Svg>

            {/* Nodes */}
            {nodes.map((node) => {
              const isActive = node.id === currentSceneId;
              const isStart = node.id === story.startSceneId;
              const isLinkSrc = node.id === linkSource;
              return (
                <Pressable
                  key={node.id}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    left: PAD + node.x,
                    top: PAD + node.y,
                    width: NODE_W,
                    height: NODE_H,
                    borderRadius: 10,
                    backgroundColor: isLinkSrc
                      ? colors.warning
                      : isActive
                      ? colors.primary
                      : colors.surface,
                    borderWidth: isStart ? 2 : 1,
                    borderColor: isStart
                      ? colors.success
                      : isActive
                      ? colors.primary
                      : colors.border,
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 6,
                    opacity: pressed ? 0.75 : 1,
                    shadowColor: '#000',
                    shadowOpacity: isActive ? 0.25 : 0.08,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: isActive ? 4 : 1,
                  })}
                  onPress={() => handleNodePress(node.id)}
                >
                  {isStart && (
                    <Text style={{ fontSize: 8, color: colors.success, fontWeight: '700', marginBottom: 1 }}>
                      START
                    </Text>
                  )}
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: isActive || isLinkSrc ? '#fff' : colors.foreground,
                      textAlign: 'center',
                    }}
                    numberOfLines={2}
                  >
                    {node.id}
                  </Text>
                  <Text
                    style={{ fontSize: 9, color: isActive ? 'rgba(255,255,255,0.7)' : colors.muted, marginTop: 1 }}
                  >
                    {story.scenes[node.id]?.choices.length ?? 0} choices
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
