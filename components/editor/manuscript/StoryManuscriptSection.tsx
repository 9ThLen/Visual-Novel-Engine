import React, { memo } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
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

  return (
    <View
      onLayout={(event) => onMeasure(scene.sceneId, event.nativeEvent.layout.y)}
      style={{
        marginBottom: 28,
        borderRadius: 28,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 20,
        paddingVertical: 20,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' }}>
        Scene {index + 1}
      </Text>
      <TextInput
        value={scene.sceneName}
        onChangeText={(sceneName) => onSceneNameChange(scene.sceneId, sceneName)}
        placeholder="Scene title"
        placeholderTextColor={colors.muted}
        style={{
          color: colors.foreground,
          fontSize: 28,
          fontWeight: '700',
          marginTop: 10,
          paddingVertical: 0,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <Button variant="secondary" size="sm" onPress={() => onAddBlock(scene.sceneId, 'narration')}>
          + Narration
        </Button>
        <Button variant="secondary" size="sm" onPress={() => onAddBlock(scene.sceneId, 'dialogue')}>
          + Dialogue
        </Button>
        <Button variant="secondary" size="sm" onPress={() => onAddBlock(scene.sceneId, 'choice_group')}>
          + Choice Group
        </Button>
      </View>

      <View style={{ marginTop: 18 }}>
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
