/**
 * components/editor/TimelinePanel.tsx — Center vertical block chain
 *
 * Renders the timeline as a vertical list of colored blocks.
 * Each block has: colored left border, header with icon+label+actions,
 * content preview, and connectors between blocks.
 * Supports drag-and-drop reordering via react-native-reanimated-dnd.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Sortable, SortableItem, type SortableRenderItemProps } from 'react-native-reanimated-dnd';
import { useColors } from '@/hooks/use-colors';
import {
  BLOCK_TYPE_INFO,
  type BackgroundBlockData,
  type BlockType,
  type CameraBlockData,
  type CharacterBlockData,
  type ChoiceBlockData,
  type DialogueBlockData,
  type EffectBlockData,
  type InteractiveObjectBlockData,
  type MusicBlockData,
  type SoundBlockData,
  type TimelineStep,
  type TransitionBlockData,
  type VariableBlockData,
} from '@/lib/engine/types';
import { isBlockComplete } from '@/lib/editor/block-validation';
import { useI18n } from '@/lib/i18n';
import { createTimelineSortableProps } from '@/lib/editor/timeline-sortable';
import { getTimelineItemLayout } from '@/lib/editor/timeline-item-layout';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getBlockIconName } from '@/lib/editor/block-icon';
import { withAlpha } from '@/lib/_core/theme';

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
  onBlockMove,
}: TimelinePanelProps) {
  const colors = useColors();
  const { t } = useI18n();

  const handleMove = useCallback((_: string, fromIndex: number, toIndex: number) => {
    if (fromIndex !== toIndex) {
      onBlockMove(fromIndex, toIndex);
    }
  }, [onBlockMove]);

  if (timeline.length === 0) {
    return (
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}>
        <IconSymbol name="blocks" size={48} color={colors.primary} style={{ marginBottom: 12 }} />
        <Text style={{
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
          marginBottom: 4,
        }}>
          {t('editor.noBlocksYet')}
        </Text>
        <Text style={{
          fontSize: 13,
          color: colors.muted,
          textAlign: 'center',
          maxWidth: 280,
        }}>
          {t('editor.addBlocksHint')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          {t('editor.timeline')}
        </Text>
        <Text style={{
          fontSize: 11,
          color: colors.muted,
        }}>
          {t('editor.preview.blockCount', { count: timeline.length })}
        </Text>
      </View>

      <View style={{ flex: 1, paddingVertical: 12 }}>
        <Sortable
          {...createTimelineSortableProps(timeline)}
          itemKeyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item: step, index, ...sortableItemProps }: SortableRenderItemProps<TimelineStep>) => {
              const info = BLOCK_TYPE_INFO[step.blockType];
              const isSelected = step.id === selectedBlockId;
              const layout = getTimelineItemLayout(index);

              return (
                <SortableItem
                  key={step.id}
                  data={step}
                  {...sortableItemProps}
                  onMove={handleMove}
                >
                  <View style={layout.containerStyle}>
                    {index > 0 && (
                      <View style={{
                        alignItems: 'center',
                        paddingVertical: 2,
                      }}>
                        <View style={{
                          width: 2,
                          height: layout.connectorStyle.height,
                          backgroundColor: colors.border,
                          borderRadius: 1,
                        }} />
                      </View>
                    )}

                    <View
                      style={{
                        ...layout.cardStyle,
                        borderRadius: 10,
                        backgroundColor: isSelected
                          ? colors['surface-2'] || colors.surface
                          : colors['surface-container'] || colors.surface,
                        borderLeftWidth: 4,
                        borderLeftColor: step.enabled ? info.color : colors.border,
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: isSelected ? colors.primary : 'transparent',
                        opacity: step.enabled ? 1 : 0.5,
                        elevation: isSelected ? 4 : 1,
                        shadowColor: colors.foreground,
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isSelected ? 0.3 : 0.1,
                        shadowRadius: 3,
                      }}
                    >
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                      }}>
                        <SortableItem.Handle>
                          <View style={{
                            width: 20,
                            paddingVertical: 10,
                            alignItems: 'center',
                            marginRight: 6,
                          }}>
                            <View style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: withAlpha(info.color, 0.25),
                            }} />
                          </View>
                        </SortableItem.Handle>

                        <Pressable
                          onPress={() => onBlockSelect(isSelected ? null : step.id)}
                          style={({ pressed }) => ({
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          })}
                          accessibilityRole="button"
                          accessibilityLabel={t(`editor.block.${step.blockType}`, undefined, info.label)}
                          accessibilityHint={isSelected ? t('editor.blockDeselectHint') : t('editor.blockSelectHint')}
                        >
                          <View style={{ position: 'relative' }}>
                            <View style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              backgroundColor: info.bgColor,
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 8,
                            }}>
                              <IconSymbol name={getBlockIconName(step.blockType)} size={16} color={info.color} />
                            </View>
                            <View style={{
                              position: 'absolute',
                              top: -4,
                              right: 4,
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: isBlockComplete(step.blockType, step.data)
                                ? colors.success
                                : colors.warning,
                              borderWidth: 1.5,
                              borderColor: colors.background,
                            }} />
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: colors.foreground,
                            }}>
                              {t(`editor.block.${step.blockType}`, undefined, info.label)}
                            </Text>
                            {!step.collapsed && info.description && (
                              <Text style={{
                                fontSize: 11,
                                lineHeight: 15,
                                color: colors.muted,
                                marginTop: 4,
                              }}>
                              {getBlockPreviewText(step, info.label, t)}
                              </Text>
                            )}
                          </View>
                        </Pressable>

                        {isSelected && (
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); onBlockToggleCollapse(step.id); }}
                              style={{ padding: 4 }}
                              accessibilityRole="button"
                              accessibilityLabel={step.collapsed ? t('editor.expandBlock') : t('editor.collapseBlock')}
                              accessibilityHint={step.collapsed ? t('editor.expandBlockHint') : t('editor.collapseBlockHint')}
                            >
                              <IconSymbol name={step.collapsed ? 'expand' : 'collapse'} size={16} color={colors.muted} />
                            </Pressable>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); onBlockDuplicate(step.id); }}
                              style={{ padding: 4 }}
                              accessibilityRole="button"
                              accessibilityLabel={t('common.duplicate')}
                              accessibilityHint={t('editor.duplicateBlockHint')}
                            >
                              <IconSymbol name="duplicate" size={16} color={colors.muted} />
                            </Pressable>
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); onBlockRemove(step.id); }}
                              style={{ padding: 4 }}
                              accessibilityRole="button"
                              accessibilityLabel={t('common.delete')}
                              accessibilityHint={t('editor.deleteBlockHint')}
                            >
                              <IconSymbol name="delete" size={16} color={colors.error} />
                            </Pressable>
                          </View>
                        )}
                      </View>

                      {!step.collapsed && renderBlockContent(step, colors, t)}
                    </View>
                  </View>
                </SortableItem>
              );
            }}
        />
      </View>
    </View>
  );
}

const renderBlockContent = (
  step: TimelineStep,
  colors: ReturnType<typeof useColors>,
  t: ReturnType<typeof useI18n>['t'],
) => {
  const data = step.data;

  switch (step.blockType) {
    case 'text': {
      const textData = data as { content: string };
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Text style={{ fontSize: 12, color: colors['foreground-secondary'], fontStyle: 'italic' }}>
            &quot;{textData.content || t('editor.preview.emptyNarration')}&quot;
          </Text>
        </View>
      );
    }

    case 'dialogue': {
      const dialogueData = data as DialogueBlockData;
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          {dialogueData.entries?.map((entry, i: number) => (
            <View key={entry.id || i} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>
                {entry.characterId || t('editor.preview.speaker')}:
              </Text>
              <Text style={{ fontSize: 12, color: colors.foreground }}>
                {entry.text || t('editor.preview.emptyDialogue')}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    case 'character': {
      const charData = data as CharacterBlockData;
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.block.character')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '500' }}>
            {charData.characterId || t('editor.preview.notSelected')}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>|</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.properties.position')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>{charData.position}</Text>
        </View>
      );
    }

    case 'background': {
      const bgData = data as BackgroundBlockData;
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.block.background')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>
            {bgData.assetId || t('editor.preview.notSelected')}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>|</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.properties.transition')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>{bgData.transition}</Text>
        </View>
      );
    }

    case 'choice': {
      const choiceData = data as ChoiceBlockData;
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          {choiceData.options?.map((opt, i: number) => (
            <View key={opt.id || i} style={{
              paddingVertical: 4,
              paddingHorizontal: 8,
              backgroundColor: colors.background,
              borderRadius: 6,
              marginBottom: 4,
            }}>
              <Text style={{ fontSize: 12, color: colors.foreground }}>
                {i + 1}. {opt.text || t('reader.choiceFallback', { id: i + 1 })}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    case 'effect': {
      const effectData = data as EffectBlockData;
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.block.effect')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>{effectData.effectType}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>| {t('editor.properties.intensity')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>{effectData.intensity}%</Text>
        </View>
      );
    }

    case 'music':
    case 'sound': {
      const audioData = data as MusicBlockData | SoundBlockData;
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.preview.audio')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>
            {audioData.assetId || t('editor.preview.notSelected')}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>| {t('editor.properties.volume')}:</Text>
          <Text style={{ fontSize: 12, color: colors.foreground }}>{Math.round((audioData.volume || 0) * 100)}%</Text>
        </View>
      );
    }

    default:
      return (
        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('editor.preview.configureInProperties')}</Text>
        </View>
      );
  }
};

function getBlockPreviewText(
  step: TimelineStep,
  fallback: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const data = step.data;

  switch (step.blockType) {
    case 'text':
      return (data as { content: string }).content ? `"${(data as { content: string }).content.substring(0, 40)}${(data as { content: string }).content.length > 40 ? '...' : ''}"` : t('editor.preview.emptyText');
    case 'dialogue':
      if ((data as DialogueBlockData).entries?.length > 0) {
        const first = (data as DialogueBlockData).entries[0];
        return `${first.characterId || t('editor.preview.speaker')}: ${first.text?.substring(0, 30) || t('editor.preview.empty')}...`;
      }
      return t('editor.preview.noEntries');
    case 'character':
      const characterData = data as CharacterBlockData;
      return `${characterData.characterId || t('editor.preview.noCharacter')} - ${characterData.position}`;
    case 'background':
      return (data as BackgroundBlockData).assetId || t('editor.preview.noBackgroundSelected');
    case 'choice':
      return t('editor.preview.optionCount', { count: (data as ChoiceBlockData).options?.length || 0 });
    case 'effect':
      const effectData = data as EffectBlockData;
      return t('editor.preview.effectSummary', { type: effectData.effectType, intensity: effectData.intensity });
    case 'music':
    case 'sound':
      return (data as MusicBlockData | SoundBlockData).assetId || t('editor.preview.noAudioSelected');
    case 'camera':
      const cameraData = data as CameraBlockData;
      return `${cameraData.action} - ${cameraData.duration}s`;
    case 'variable':
      const variableData = data as VariableBlockData;
      return `${variableData.variableName || 'var'} ${variableData.operation} ${variableData.value}`;
    case 'transition':
      const transitionData = data as TransitionBlockData;
      return transitionData.targetSceneId ? `-> ${transitionData.targetSceneId}` : t('editor.preview.endScene');
    case 'interactive_object':
      return (data as InteractiveObjectBlockData).name || t('editor.preview.unnamedObject');
    default:
      return fallback;
  }
}
