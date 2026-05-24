/**
 * components/editor/TimelinePanel.tsx — Center vertical block chain
 *
 * Renders the timeline as a vertical list of colored blocks.
 * Each block has: colored left border, header with icon+label+actions,
 * content preview, and connectors between blocks.
 * Supports drag-and-drop reordering.
 */

import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, FlatList } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, type TimelineStep, type BlockType } from '@/lib/engine/types';

interface TimelinePanelProps {
  timeline: TimelineStep[];
  selectedBlockId: string | null;
  onBlockSelect: (stepId: string | null) => void;
  onBlockAdd: (blockType: BlockType, index?: number) => void;
  onBlockRemove: (stepId: string) => void;
  onBlockMove: (fromIndex: number, toIndex: number) => void;
  onBlockDuplicate: (stepId: string) => void;
  onBlockToggleCollapse: (stepId: string) => void;
}

export function TimelinePanel({
  timeline,
  selectedBlockId,
  onBlockSelect,
  onBlockRemove,
  onBlockDuplicate,
  onBlockToggleCollapse,
}: TimelinePanelProps) {
  const colors = useColors();

  const renderBlock = useCallback(({ item: step, index }: { item: TimelineStep; index: number }) => {
    const info = BLOCK_TYPE_INFO[step.blockType];
    const isSelected = step.id === selectedBlockId;

    return (
      <View>
        {/* Connector line (above block, except first) */}
        {index > 0 && (
          <View style={{
            alignItems: 'center',
            paddingVertical: 2,
          }}>
            <View style={{
              width: 2,
              height: 16,
              backgroundColor: colors.border,
              borderRadius: 1,
            }} />
          </View>
        )}

        {/* Block card */}
        <Pressable
          onPress={() => onBlockSelect(isSelected ? null : step.id)}
          style={({ pressed }) => ({
            marginHorizontal: 8,
            marginVertical: 2,
            borderRadius: 10,
            backgroundColor: isSelected
              ? (colors as any)['surface-2'] || colors.surface
              : (colors as any)['surface-container'] || colors.surface,
            borderLeftWidth: 4,
            borderLeftColor: step.enabled ? info.color : colors.border,
            borderWidth: isSelected ? 2 : 0,
            borderColor: isSelected ? colors.primary : 'transparent',
            opacity: step.enabled ? 1 : 0.5,
            elevation: isSelected ? 4 : 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isSelected ? 0.3 : 0.1,
            shadowRadius: 3,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          {/* Block header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}>
            {/* Drag handle */}
            <View style={{
              width: 20,
              alignItems: 'center',
              marginRight: 6,
            }}>
              <View style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: info.color + '40',
              }} />
            </View>

            {/* Icon */}
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: info.bgColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
            }}>
              <Text style={{ fontSize: 14 }}>{info.icon}</Text>
            </View>

            {/* Label */}
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 13,
                fontWeight: '700',
                color: colors.foreground,
              }}>
                {info.label}
              </Text>
              {!step.collapsed && info.description && (
                <Text style={{
                  fontSize: 10,
                  color: colors.muted,
                  marginTop: 1,
                }}>
                  {getBlockPreviewText(step, info.label)}
                </Text>
              )}
            </View>

            {/* Actions (visible when selected) */}
            {isSelected && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onBlockToggleCollapse(step.id); }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {step.collapsed ? '▼' : '▲'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onBlockDuplicate(step.id); }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: 12, color: colors.muted }}>📋</Text>
                </Pressable>
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onBlockRemove(step.id); }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: 12, color: colors.error || '#ff6b6b' }}>🗑</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Block content (when expanded) */}
          {!step.collapsed && renderBlockContent(step, colors)}
        </Pressable>
      </View>
    );
  }, [selectedBlockId, colors, onBlockSelect, onBlockRemove, onBlockDuplicate, onBlockToggleCollapse]);

  const renderBlockContent = (step: TimelineStep, colors: any) => {
    const data = step.data;

    // Render different content based on block type
    switch (step.blockType) {
      case 'text':
        const textData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            <Text style={{ fontSize: 12, color: colors['foreground-secondary'], fontStyle: 'italic' }}>
              "{textData.content || 'Empty narration...'}"
            </Text>
          </View>
        );

      case 'dialogue':
        const dialogueData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            {dialogueData.entries?.map((entry: any, i: number) => (
              <View key={entry.id || i} style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>
                  {entry.characterId || 'Speaker'}:
                </Text>
                <Text style={{ fontSize: 12, color: colors.foreground }}>
                  {entry.text || 'Empty dialogue...'}
                </Text>
              </View>
            ))}
          </View>
        );

      case 'character':
        const charData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>Character:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '500' }}>
              {charData.characterId || '(not selected)'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>|</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>Position:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{charData.position}</Text>
          </View>
        );

      case 'background':
        const bgData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>Background:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>
              {bgData.assetId || '(not selected)'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>|</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>Transition:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{bgData.transition}</Text>
          </View>
        );

      case 'choice':
        const choiceData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            {choiceData.options?.map((opt: any, i: number) => (
              <View key={opt.id || i} style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                backgroundColor: colors.background,
                borderRadius: 6,
                marginBottom: 4,
              }}>
                <Text style={{ fontSize: 12, color: colors.foreground }}>
                  {i + 1}. {opt.text || `Choice ${i + 1}`}
                </Text>
              </View>
            ))}
          </View>
        );

      case 'effect':
        const effectData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>Effect:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{effectData.effectType}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>| Intensity:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{effectData.intensity}%</Text>
          </View>
        );

      case 'music':
      case 'sound':
        const audioData = data as any;
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>Audio:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>
              {audioData.assetId || '(not selected)'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>| Vol:</Text>
            <Text style={{ fontSize: 12, color: colors.foreground }}>{Math.round((audioData.volume || 0) * 100)}%</Text>
          </View>
        );

      default:
        return (
          <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>Configure in properties →</Text>
          </View>
        );
    }
  };

  if (timeline.length === 0) {
    return (
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>🧩</Text>
        <Text style={{
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
          marginBottom: 4,
        }}>
          No blocks yet
        </Text>
        <Text style={{
          fontSize: 13,
          color: colors.muted,
          textAlign: 'center',
          maxWidth: 280,
        }}>
          Add blocks from the Block Library to build your scene timeline
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Timeline header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Text style={{
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: colors['foreground-tertiary'] || colors.muted,
        }}>
          📝 Timeline
        </Text>
        <Text style={{
          fontSize: 11,
          color: colors.muted,
        }}>
          {timeline.length} block{timeline.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Block list */}
      <FlatList
        data={timeline}
        renderItem={renderBlock}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Helper to get preview text for a block
function getBlockPreviewText(step: TimelineStep, fallback: string): string {
  const data = step.data as any;

  switch (step.blockType) {
    case 'text':
      return data.content ? `"${data.content.substring(0, 40)}${data.content.length > 40 ? '...' : ''}"` : 'Empty text';
    case 'dialogue':
      if (data.entries?.length > 0) {
        const first = data.entries[0];
        return `${first.characterId || 'Speaker'}: ${first.text?.substring(0, 30) || 'Empty'}...`;
      }
      return 'No entries';
    case 'character':
      return `${data.characterId || '(no character)'} — ${data.position}`;
    case 'background':
      return data.assetId || 'No background selected';
    case 'choice':
      return `${data.options?.length || 0} options`;
    case 'effect':
      return `${data.effectType} — intensity ${data.intensity}%`;
    case 'music':
    case 'sound':
      return data.assetId || 'No audio selected';
    case 'camera':
      return `${data.action} — ${data.duration}s`;
    case 'variable':
      return `${data.variableName || 'var'} ${data.operation} ${data.value}`;
    case 'transition':
      return data.targetSceneId ? `→ ${data.targetSceneId}` : 'End scene';
    case 'interactive_object':
      return data.name || 'Unnamed object';
    default:
      return fallback;
  }
}
