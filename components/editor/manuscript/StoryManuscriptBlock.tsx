import React, { memo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
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
        paddingTop: spacing.lg,
        marginTop: spacing.lg,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          marginBottom: spacing.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ ...typeScale.micro, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>
            {block.kind === 'narration'
              ? t('manuscript.narration')
              : block.kind === 'dialogue'
                ? t('manuscript.dialogue')
                : block.kind === 'choice_group'
                  ? t('manuscript.choiceGroup')
                  : block.label}
          </Text>
          <Text style={{ ...typeScale.caption, color: colors.muted, marginTop: spacing.xs }}>
            {block.kind === 'technical_marker'
              ? t('manuscript.technicalBlock')
              : t('manuscript.editable')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            variant="ghost"
            size="sm"
            onPress={onMoveUp}
            disabled={!canMoveUp}
            icon={<IconSymbol name="chevron.right" size={14} color={colors.primary} style={{ transform: [{ rotate: '-90deg' }] }} />}
            accessibilityLabel={t('editor.moveUp')}
          >
            {t('editor.moveUp')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={onMoveDown}
            disabled={!canMoveDown}
            icon={<IconSymbol name="chevron.right" size={14} color={colors.primary} style={{ transform: [{ rotate: '90deg' }] }} />}
            accessibilityLabel={t('editor.moveDown')}
          >
            {t('editor.moveDown')}
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
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            color: colors.foreground,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            textAlignVertical: 'top',
            ...typeScale.body,
          }}
        />
      )}

      {block.kind === 'dialogue' && (
        <View style={{ gap: spacing.md }}>
          {block.entries.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: spacing.md,
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
                  ...typeScale.caption,
                  fontWeight: '700',
                  paddingBottom: spacing.sm,
                  marginBottom: spacing.md,
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
                  ...typeScale.label,
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
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
        <View style={{ gap: spacing.md }}>
          {block.options.map((option, index) => (
            <View
              key={option.id}
              style={{
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: spacing.md,
              }}
            >
              <Text style={{ ...typeScale.micro, color: colors.muted, fontWeight: '700', marginBottom: spacing.sm }}>
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
                  ...typeScale.label,
                  marginBottom: spacing.md,
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
                  ...typeScale.caption,
                  paddingTop: spacing.sm,
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
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
            borderRadius: radius.full,
            alignSelf: 'flex-start',
            backgroundColor: withAlpha(colors.primary, 0x14 / 255),
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Text style={{ color: colors.primary, ...typeScale.caption }}>{block.label}</Text>
        </View>
      )}
    </View>
  );
}

export const StoryManuscriptBlock = memo(StoryManuscriptBlockComponent);
