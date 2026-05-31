import React, { memo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type { StoryManuscriptBlock as StoryManuscriptBlockModel } from '@/lib/editor/story-manuscript';

interface StoryManuscriptBlockProps {
  block: StoryManuscriptBlockModel;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (nextBlock: StoryManuscriptBlockModel) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function StoryManuscriptBlockComponent({
  block,
  canMoveUp,
  canMoveDown,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: StoryManuscriptBlockProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 16,
        marginTop: 16,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>
            {block.kind === 'narration'
              ? t('manuscript.narration')
              : block.kind === 'dialogue'
                ? t('manuscript.dialogue')
                : block.kind === 'choice_group'
                  ? t('manuscript.choiceGroup')
                  : block.label}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
            {block.kind === 'technical_marker'
              ? t('manuscript.technicalBlock')
              : t('manuscript.editable')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" size="sm" onPress={onMoveUp} disabled={!canMoveUp}>
            ↑
          </Button>
          <Button variant="ghost" size="sm" onPress={onMoveDown} disabled={!canMoveDown}>
            ↓
          </Button>
          {block.kind !== 'technical_marker' && (
            <Button variant="ghost" size="sm" onPress={onRemove}>
              {t('common.delete')}
            </Button>
          )}
        </View>
      </View>

      {block.kind === 'narration' && (
        <TextInput
          multiline
          value={block.content}
          onChangeText={(content) => onChange({ ...block, content })}
          placeholder={t('manuscript.writeNarration')}
          placeholderTextColor={colors.muted}
          style={{
            minHeight: 120,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            color: colors.foreground,
            paddingHorizontal: 14,
            paddingVertical: 14,
            textAlignVertical: 'top',
            fontSize: 16,
            lineHeight: 24,
          }}
        />
      )}

      {block.kind === 'dialogue' && (
        <View style={{ gap: 12 }}>
          {block.entries.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: 14,
              }}
            >
              <TextInput
                value={entry.characterId}
                onChangeText={(characterId) => {
                  const nextEntries = [...block.entries];
                  nextEntries[index] = { ...entry, characterId };
                  onChange({ ...block, entries: nextEntries });
                }}
                placeholder={t('manuscript.speakerId')}
                placeholderTextColor={colors.muted}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  color: colors.foreground,
                  fontSize: 13,
                  fontWeight: '700',
                  paddingBottom: 8,
                  marginBottom: 12,
                }}
              />
              <TextInput
                multiline
                numberOfLines={3}
                value={entry.text}
                onChangeText={(text) => {
                  const nextEntries = [...block.entries];
                  nextEntries[index] = { ...entry, text };
                  onChange({ ...block, entries: nextEntries });
                }}
                placeholder={t('manuscript.dialogueLine')}
                placeholderTextColor={colors.muted}
                style={{
                  minHeight: 78,
                  color: colors.foreground,
                  fontSize: 15,
                  lineHeight: 22,
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    onChange({
                      ...block,
                      entries: block.entries.filter((item) => item.id !== entry.id),
                    });
                  }}
                  disabled={block.entries.length <= 1}
                >
                  {t('manuscript.removeLine')}
                </Button>
              </View>
            </View>
          ))}

          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              onChange({
                ...block,
                entries: [
                  ...block.entries,
                  {
                    id: `entry-${Date.now()}`,
                    characterId: '',
                    spriteId: '',
                    text: '',
                  },
                ],
              })
            }
          >
            {t('manuscript.addDialogueLine')}
          </Button>
        </View>
      )}

      {block.kind === 'choice_group' && (
        <View style={{ gap: 12 }}>
          {block.options.map((option, index) => (
            <View
              key={option.id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: 14,
              }}
            >
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700', marginBottom: 8 }}>
                {t('editor.properties.choice', { number: index + 1 })}
              </Text>
              <TextInput
                value={option.text}
                onChangeText={(text) => {
                  const nextOptions = [...block.options];
                  nextOptions[index] = { ...option, text };
                  onChange({ ...block, options: nextOptions });
                }}
                placeholder={t('manuscript.choiceText')}
                placeholderTextColor={colors.muted}
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  lineHeight: 22,
                  marginBottom: 12,
                }}
              />
              <TextInput
                value={option.targetSceneId ?? ''}
                onChangeText={(targetSceneId) => {
                  const nextOptions = [...block.options];
                  nextOptions[index] = { ...option, targetSceneId: targetSceneId || null };
                  onChange({ ...block, options: nextOptions });
                }}
                placeholder={t('manuscript.targetSceneId')}
                placeholderTextColor={colors.muted}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  color: colors.muted,
                  fontSize: 13,
                  paddingTop: 10,
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    onChange({
                      ...block,
                      options: block.options.filter((item) => item.id !== option.id),
                    });
                  }}
                  disabled={block.options.length <= 1}
                >
                  {t('manuscript.removeChoice')}
                </Button>
              </View>
            </View>
          ))}

          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              onChange({
                ...block,
                options: [
                  ...block.options,
                  {
                    id: `choice-${Date.now()}`,
                    text: '',
                    targetSceneId: null,
                  },
                ],
              })
            }
          >
            {t('editor.properties.addChoice')}
          </Button>
        </View>
      )}

      {block.kind === 'technical_marker' && (
        <View
          style={{
            borderRadius: 999,
            alignSelf: 'flex-start',
            backgroundColor: `${colors.primary}14`,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{block.label}</Text>
        </View>
      )}
    </View>
  );
}

export const StoryManuscriptBlock = memo(StoryManuscriptBlockComponent);
