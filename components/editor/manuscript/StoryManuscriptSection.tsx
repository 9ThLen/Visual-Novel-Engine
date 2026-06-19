import React, { memo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { useI18n } from '@/hooks/use-i18n';
import type {
  StoryManuscriptBlock as StoryManuscriptBlockModel,
  StoryManuscriptScene,
} from '@/lib/editor/story-manuscript';
import { StoryManuscriptBlock } from './StoryManuscriptBlock';

interface StoryManuscriptSectionProps {
  scene: StoryManuscriptScene;
  index: number;
  onSceneNameChange: (sceneId: string, sceneName: string) => void;
  onBlockChange: (sceneId: string, blockId: string, nextBlock: StoryManuscriptBlockModel) => void;
  onMoveBlock: (sceneId: string, fromIndex: number, toIndex: number) => void;
  onRemoveBlock: (sceneId: string, blockId: string) => void;
  onAddBlock: (sceneId: string, kind: 'narration' | 'dialogue' | 'choice_group') => void;
  onMeasure: (sceneId: string, y: number) => void;
}

function StoryManuscriptSectionComponent({
  scene,
  index,
  onSceneNameChange,
  onBlockChange,
  onMoveBlock,
  onRemoveBlock,
  onAddBlock,
  onMeasure,
}: StoryManuscriptSectionProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View
      onLayout={(event) => onMeasure(scene.sceneId, event.nativeEvent.layout.y)}
      style={{
        marginBottom: spacing.xl,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.xl,
      }}
    >
      <Text style={{ ...typeScale.caption, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' }}>
        {t('manuscript.sceneIndex', { number: index + 1 })}
      </Text>
      <TextInput
        value={scene.sceneName}
        onChangeText={(sceneName) => onSceneNameChange(scene.sceneId, sceneName)}
        placeholder={t('manuscript.sceneTitle')}
        placeholderTextColor={colors.muted}
        style={{
          color: colors.foreground,
          ...typeScale.pageTitle,
          fontWeight: '700',
          marginTop: spacing.sm,
          paddingVertical: 0,
        }}
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.lg }}>
        <Button variant="secondary" size="sm" onPress={() => onAddBlock(scene.sceneId, 'narration')}>
          {t('manuscript.addNarration')}
        </Button>
        <Button variant="secondary" size="sm" onPress={() => onAddBlock(scene.sceneId, 'dialogue')}>
          {t('manuscript.addDialogue')}
        </Button>
        <Button variant="secondary" size="sm" onPress={() => onAddBlock(scene.sceneId, 'choice_group')}>
          {t('manuscript.addChoiceGroup')}
        </Button>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        {scene.blocks.map((block, blockIndex) => (
          <StoryManuscriptBlock
            key={block.id}
            block={block}
            canMoveUp={blockIndex > 0}
            canMoveDown={blockIndex < scene.blocks.length - 1}
            onChange={(nextBlock) => onBlockChange(scene.sceneId, block.id, nextBlock)}
            onMoveUp={() => onMoveBlock(scene.sceneId, blockIndex, blockIndex - 1)}
            onMoveDown={() => onMoveBlock(scene.sceneId, blockIndex, blockIndex + 1)}
            onRemove={() => onRemoveBlock(scene.sceneId, block.id)}
          />
        ))}
      </View>
    </View>
  );
}

export const StoryManuscriptSection = memo(StoryManuscriptSectionComponent);
