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

import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ensureDocumentCharactersInBlocks } from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentDialogueBlock, DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
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
  // Local state for speaker name to prevent keyboard dismissal on every keystroke.
  // The parent state is synced on blur or when the block is committed.
  const [localSpeakerName, setLocalSpeakerName] = useState(block.speakerName);
  const localSpeakerNameRef = useRef(block.speakerName);
  const charactersRef = useRef(localCharacters);
  charactersRef.current = localCharacters;

  const syncSpeakerName = (speakerName: string) => {
    const next = {
      ...block,
      speakerName,
      characterId: speakerName.trim()
        ? charactersRef.current.find((item) => item.name.toLocaleLowerCase() === speakerName.trim().toLocaleLowerCase())?.id ?? null
        : null,
    };
    const ensured = ensureDocumentCharactersInBlocks([next], charactersRef.current);
    onUpdateBlock(documentScene.sceneId, block.id, () => ensured.blocks[0] ?? next);
    // Only update characters if the array actually changed (new character created)
    if (ensured.characters.length !== charactersRef.current.length) {
      setLocalCharacters(ensured.characters);
    }
    return ensured;
  };

  // Sync local state when block.speakerName changes from outside
  // (e.g. on initial load or programmatic update)
  useEffect(() => {
    setLocalSpeakerName(block.speakerName);
    localSpeakerNameRef.current = block.speakerName;
  }, [block.speakerName]);

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
        value={localSpeakerName}
        onFocus={() => onActiveScene(documentScene.sceneId)}
        onChangeText={(speakerName) => {
          setLocalSpeakerName(speakerName);
          localSpeakerNameRef.current = speakerName;
          syncSpeakerName(speakerName);
        }}
        onBlur={() => {
          // Sync with parent on blur to ensure consistency
          syncSpeakerName(localSpeakerNameRef.current);
        }}
        onKeyPress={(event) => {
          if (event.nativeEvent.key !== 'Backspace' || localSpeakerName.length > 0) return;
          onEmptyBackspace(`speaker:${block.id}`, () => {
            onConvertDialogueToText(documentScene.sceneId, block.id);
          });
        }}
        style={{
          alignSelf: 'flex-start',
          minWidth: isPhone ? 0 : 58,
          maxWidth: isPhone ? 120 : 132,
          color: isPhone ? colors.foreground : colors.primary,
          backgroundColor: isPhone ? 'transparent' : withAlpha(colors.primary, 0x14 / 255),
          borderColor: isPhone ? 'transparent' : withAlpha(colors.primary, 0x55 / 255),
          borderWidth: isPhone ? 0 : 1,
          borderRadius: 8,
          fontSize: isPhone ? 17 : 15,
          fontWeight: '800',
          paddingHorizontal: isPhone ? 0 : 8,
          paddingVertical: isPhone ? 2 : 5,
          textAlign: isPhone ? 'left' : 'center',
          outline: 'none',
        }}
        placeholder={t('document.speakerPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('document.speakerPlaceholder')}
        accessibilityHint={t('document.dialogue.characterHint')}
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
          outline: 'none',
        }}
        placeholder={t('document.dialoguePlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('document.dialoguePlaceholder')}
        accessibilityHint={t('document.dialogue.lineHint')}
      />
    </View>
  );
});
