/**
 * components/document-editor/DocumentBlockDialogue.tsx
 *
 * Sub-component for rendering a single dialogue block inside the
 * document-style scene editor. Extracted from DocumentSceneEditor to keep
 * the parent file small (see phase 13 post-audit remediation, H1).
 *
 * Renders: speaker name input + dialogue text input.
 * Handles: empty-backspace block removal, character auto-registration.
 */

import React from 'react';
import { TextInput, View } from 'react-native';

import { ensureDocumentCharactersInBlocks } from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentDialogueBlock, DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { useColors } from '@/hooks/use-colors';
import type { useI18n } from '@/lib/i18n';

export interface DocumentBlockDialogueProps {
  block: DocumentDialogueBlock;
  documentScene: DocumentScene;
  isPhone: boolean;
  colors: ReturnType<typeof useColors>;
  t: ReturnType<typeof useI18n>['t'];
  localCharacters: Character[];
  setLocalCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  onUpdateBlock: (
    sceneId: string,
    blockId: string,
    updater: (current: DocumentBlock) => DocumentBlock,
  ) => void;
  onRemoveBlock: (sceneId: string, blockId: string) => void;
  onEmptyBackspace: (key: string, action: () => void) => void;
  onActiveScene: (sceneId: string) => void;
  onConvertDialogueToText: (sceneId: string, blockId: string) => void;
}

export const DocumentBlockDialogue = React.memo(function DocumentBlockDialogue({
  block,
  documentScene,
  isPhone,
  colors,
  t,
  localCharacters,
  setLocalCharacters,
  onUpdateBlock,
  onRemoveBlock,
  onEmptyBackspace,
  onActiveScene,
  onConvertDialogueToText,
}: DocumentBlockDialogueProps) {
  const textInputBaseStyle = {
    color: colors.foreground,
    fontSize: 17,
    lineHeight: 27,
    paddingVertical: isPhone ? 8 : 7,
    textAlignVertical: 'top' as const,
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingVertical: 5,
      }}
    >
      <TextInput
        value={block.speakerName}
        onFocus={() => onActiveScene(documentScene.sceneId)}
        onChangeText={(speakerName) => {
          const next = {
            ...block,
            speakerName,
            characterId: speakerName.trim()
              ? localCharacters.find((item) => item.name.toLocaleLowerCase() === speakerName.trim().toLocaleLowerCase())?.id ?? null
              : null,
          };
          const ensured = ensureDocumentCharactersInBlocks([next], localCharacters);
          onUpdateBlock(documentScene.sceneId, block.id, () => ensured.blocks[0] ?? next);
          setLocalCharacters(ensured.characters);
        }}
        onKeyPress={(event) => {
          if (event.nativeEvent.key !== 'Backspace' || block.speakerName.length > 0) return;
          onEmptyBackspace(`speaker:${block.id}`, () => {
            onConvertDialogueToText(documentScene.sceneId, block.id);
          });
        }}
        style={{
          alignSelf: 'flex-start',
          minWidth: isPhone ? 0 : 58,
          maxWidth: isPhone ? 120 : 132,
          color: isPhone ? colors.foreground : colors.primary,
          backgroundColor: isPhone ? 'transparent' : `${colors.primary}14`,
          borderColor: isPhone ? 'transparent' : `${colors.primary}55`,
          borderWidth: isPhone ? 0 : 1,
          borderRadius: 8,
          fontSize: isPhone ? 17 : 15,
          fontWeight: '800',
          paddingHorizontal: isPhone ? 0 : 8,
          paddingVertical: isPhone ? 2 : 5,
          textAlign: isPhone ? 'left' : 'center',
        }}
        placeholder={t('document.speakerPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('document.speakerPlaceholder')}
        accessibilityHint="Character name for this dialogue line"
      />
      <TextInput
        multiline
        numberOfLines={isPhone ? 2 : undefined}
        scrollEnabled={false}
        value={block.text}
        onFocus={() => onActiveScene(documentScene.sceneId)}
        onChangeText={(text) => {
          onUpdateBlock(documentScene.sceneId, block.id, (current) =>
            current.kind === 'dialogue' ? { ...current, text } : current,
          );
        }}
        onKeyPress={(event) => {
          if (event.nativeEvent.key !== 'Backspace' || block.text.length > 0) return;
          onEmptyBackspace(`dialogue:${block.id}`, () => onRemoveBlock(documentScene.sceneId, block.id));
        }}
        style={{
          ...textInputBaseStyle,
          flex: 1,
          minHeight: isPhone ? 32 : undefined,
          paddingVertical: isPhone ? 2 : 3,
        }}
        placeholder={t('document.dialoguePlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('document.dialoguePlaceholder')}
        accessibilityHint="Dialogue text for this character"
      />
    </View>
  );
});
