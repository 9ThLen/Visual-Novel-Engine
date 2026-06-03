/**
 * components/document-editor/DocumentBlockChoice.tsx
 *
 * Sub-component for rendering a single choice block inside the
 * document-style scene editor. Extracted from DocumentSceneEditor to keep
 * the parent file small (see phase 13 post-audit remediation, H1).
 *
 * Renders: question input + list of option inputs.
 * Handles: empty-backspace block removal, option deletion.
 */

import React from 'react';
import { TextInput, View } from 'react-native';

import type { DocumentBlock, DocumentChoiceBlock, DocumentScene } from '@/lib/document-editor/types';
import type { useColors } from '@/hooks/use-colors';

export interface DocumentBlockChoiceProps {
  block: DocumentChoiceBlock;
  documentScene: DocumentScene;
  isPhone: boolean;
  colors: ReturnType<typeof useColors>;
  onUpdateBlock: (
    sceneId: string,
    blockId: string,
    updater: (current: DocumentBlock) => DocumentBlock,
  ) => void;
  onRemoveBlock: (sceneId: string, blockId: string) => void;
  onEmptyBackspace: (key: string, action: () => void) => void;
  onActiveScene: (sceneId: string) => void;
}

export const DocumentBlockChoice = React.memo(function DocumentBlockChoice({
  block,
  documentScene,
  isPhone,
  colors,
  onUpdateBlock,
  onRemoveBlock,
  onEmptyBackspace,
  onActiveScene,
}: DocumentBlockChoiceProps) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: isPhone ? colors.surface : 'transparent',
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 10,
      }}
    >
      <TextInput
        value={`? ${block.question}`}
        onFocus={() => onActiveScene(documentScene.sceneId)}
        onChangeText={(value) => onUpdateBlock(documentScene.sceneId, block.id, (current) =>
          current.kind === 'choice' ? { ...current, question: value.replace(/^\?\s*/, '') } : current,
        )}
        onKeyPress={(event) => {
          if (event.nativeEvent.key !== 'Backspace' || block.question.length > 0) return;
          onEmptyBackspace(`choice:${block.id}`, () => onRemoveBlock(documentScene.sceneId, block.id));
        }}
        style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', paddingVertical: 6 }}
        accessibilityLabel="Choice question"
        accessibilityHint="Question text for the player to choose from"
      />
      {block.options.map((option, index) => (
        <TextInput
          key={option.id}
          value={`- ${option.text}`}
          onFocus={() => onActiveScene(documentScene.sceneId)}
          onChangeText={(value) => {
            onUpdateBlock(documentScene.sceneId, block.id, (current) => {
              if (current.kind !== 'choice') return current;
              const options = [...current.options];
              options[index] = { ...option, text: value.replace(/^-\s*/, '') };
              return { ...current, options };
            });
          }}
          onKeyPress={(event) => {
            if (event.nativeEvent.key !== 'Backspace' || option.text.length > 0) return;
            onEmptyBackspace(`choice-option:${option.id}`, () => {
              onUpdateBlock(documentScene.sceneId, block.id, (current) => {
                if (current.kind !== 'choice') return current;
                const options = current.options.filter((item) => item.id !== option.id);
                return options.length > 0 ? { ...current, options } : current;
              });
            });
          }}
          style={{ color: colors.foreground, fontSize: 15, paddingVertical: 4, marginLeft: 10 }}
          accessibilityLabel={`Choice option ${index + 1}`}
          accessibilityHint="Text for this answer choice"
        />
      ))}
    </View>
  );
});
