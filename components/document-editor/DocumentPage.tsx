/**
 * components/document-editor/DocumentPage.tsx
 *
 * Renders a single page (one document-scene) inside the document-style
 * scene editor. Extracted from DocumentSceneEditor to keep the parent file
 * small (see phase 13 post-audit remediation, H1).
 *
 * Renders: page chrome (scene counter, scene title), block list.
 * Owns the onLayout → page registration side-effect for the active-page
 * scroll synchronization.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { DocumentBlockDialogue } from '@/components/document-editor/DocumentBlockDialogue';
import { DocumentBlockChoice } from '@/components/document-editor/DocumentBlockChoice';
import { DocumentChip } from '@/components/document-editor/DocumentChip';
import { DocumentCommandMenu } from '@/components/document-editor/DocumentCommandMenu';
import { replaceBlockById } from '@/components/document-editor/useBlockOperations';
import { useColors } from '@/hooks/use-colors';
import type { useI18n } from '@/hooks/use-i18n';
import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { useDocumentScroll } from '@/components/document-editor/useDocumentScroll';
import type { useBlockOperations } from '@/components/document-editor/useBlockOperations';

const PAGE_MAX_WIDTH = 760;

export interface DocumentPageProps {
  documentScene: DocumentScene;
  pageIndex: number;
  isPhone: boolean;
  sceneCount: number;
  sceneRecordId: string;
  selectedBlockId: string | null;
  localCharacters: Character[];
  setLocalCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  setActiveSceneId: (id: string) => void;
  setSelectedBlockId: (id: string | null) => void;
  ops: ReturnType<typeof useBlockOperations>;
  scroll: ReturnType<typeof useDocumentScroll>;
  t: ReturnType<typeof useI18n>['t'];
}

export const DocumentPage = React.memo(function DocumentPage({
  documentScene,
  pageIndex,
  isPhone,
  sceneCount,
  sceneRecordId,
  selectedBlockId,
  localCharacters,
  setLocalCharacters,
  setActiveSceneId,
  setSelectedBlockId,
  ops,
  scroll,
  t,
}: DocumentPageProps) {
  const colors = useColors();
  const [slashBlockId, setSlashBlockId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState('');

  const textInputBaseStyle = useMemo(
    () => ({
      color: colors.foreground,
      fontSize: 17,
      lineHeight: 27,
      paddingVertical: isPhone ? 8 : 7,
      textAlignVertical: 'top' as const,
    }),
    [colors.foreground, isPhone],
  );

  const handleConvertDialogueToText = useCallback(
    (sceneId: string, blockId: string) => {
      ops.updateDocumentScene(sceneId, (current) => {
        const target = current.blocks.find((item) => item.id === blockId);
        if (!target || target.kind !== 'dialogue') return current;
        const textBlock: DocumentBlock = {
          id: target.id,
          kind: 'text',
          sourceStepId: target.sourceStepId,
          content: target.text,
        };
        const blocks = replaceBlockById(current.blocks, blockId, [textBlock]);
        setLocalCharacters((items) => ops.pruneCharacter(items, blocks, target.characterId));
        return { ...current, blocks };
      });
    },
    [ops, setLocalCharacters],
  );

  return (
    <View
      onLayout={(event) => {
        const layoutY = event.nativeEvent.layout.y;
        scroll.registerPageLayout(documentScene.sceneId, layoutY, event.nativeEvent.layout.height);
        if (!scroll.didScrollToActiveRef.current && documentScene.sceneId === sceneRecordId) {
          scroll.didScrollToActiveRef.current = true;
          requestAnimationFrame(() => {
            const animated = scroll.shouldAnimateToActivePageRef.current;
            scroll.shouldAnimateToActivePageRef.current = false;
            scroll.scrollViewRef.current?.scrollTo({ y: Math.max(0, layoutY - 12), animated });
          });
        }
      }}
      style={{
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        alignSelf: 'center',
        backgroundColor: colors['surface-1'],
        borderWidth: isPhone ? 0 : 1,
        borderColor: colors.border,
        borderRadius: isPhone ? 0 : 8,
        paddingHorizontal: isPhone ? 24 : 48,
        paddingVertical: isPhone ? 28 : 42,
        marginBottom: isPhone ? 1 : 1,
      }}
    >
      {!isPhone ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
            {t('document.sceneCounter', { current: pageIndex + 1, total: Math.max(sceneCount, 1) })}
          </Text>
          <TextInput
            value={documentScene.sceneName}
            onFocus={() => setActiveSceneId(documentScene.sceneId)}
            onChangeText={(sceneName) => ops.updateDocumentScene(documentScene.sceneId, (current) => ({ ...current, sceneName }))}
            placeholder={t('document.sceneNamePlaceholder')}
            placeholderTextColor={colors.muted}
            style={{ color: colors.foreground, fontSize: 36, fontWeight: '800', paddingVertical: 8 }}
            accessibilityLabel={t('document.sceneNamePlaceholder')}
            accessibilityHint={t('document.a11y.sceneTitle')}
          />
        </>
      ) : null}

      <View style={{ justifyContent: 'flex-start', marginTop: isPhone ? 0 : 12 }}>
        {documentScene.blocks.map((block) => {
          if (block.kind === 'technical') {
            return (
              <DocumentChip
                key={block.id}
                block={block}
                selected={block.id === selectedBlockId}
                onPress={() => {
                  setActiveSceneId(documentScene.sceneId);
                  setSelectedBlockId(block.id);
                }}
              />
            );
          }

          if (block.kind === 'dialogue') {
            return (
              <DocumentBlockDialogue
                key={block.id}
                block={block}
                documentScene={documentScene}
                isPhone={isPhone}
                colors={colors}
                t={t}
                localCharacters={localCharacters}
                setLocalCharacters={setLocalCharacters}
                onUpdateBlock={ops.updateBlock}
                onRemoveBlock={ops.removeBlock}
                onEmptyBackspace={ops.handleEmptyBackspace}
                onActiveScene={setActiveSceneId}
                onConvertDialogueToText={handleConvertDialogueToText}
              />
            );
          }

          if (block.kind === 'choice') {
            return (
              <DocumentBlockChoice
                key={block.id}
                block={block}
                documentScene={documentScene}
                isPhone={isPhone}
                colors={colors}
                t={t}
                onUpdateBlock={ops.updateBlock}
                onRemoveBlock={ops.removeBlock}
                onEmptyBackspace={ops.handleEmptyBackspace}
                onActiveScene={setActiveSceneId}
              />
            );
          }

          // Default: text block
          // Check if this is the last empty text block on a scene where all text blocks are empty
          const isLastEmptyTextBlock =
            block.id === documentScene.blocks[documentScene.blocks.length - 1].id &&
            block.kind === 'text' &&
            !block.content.trim() &&
            documentScene.blocks.every(
              (b) => b.kind !== 'text' || !b.content.trim() || b.id === block.id,
            );

          const textPlaceholder = isLastEmptyTextBlock && documentScene.blocks.length <= 2
            ? t('document.storyBeginPlaceholder')
            : t('document.narrationPlaceholder');

          const isSlashOpen = slashBlockId === block.id;

          return (
            <View key={block.id} style={{ position: 'relative' }}>
              <TextInput
                multiline
                scrollEnabled={false}
                value={block.content}
                onFocus={() => {
                  setActiveSceneId(documentScene.sceneId);
                  // Close slash menu when focusing a different block
                  if (slashBlockId !== null && slashBlockId !== block.id) {
                    setSlashBlockId(null);
                    setSlashQuery('');
                  }
                }}
                onChangeText={(content) => {
                  // Check for slash command trigger
                  const lines = content.split(/\r?\n/);
                  const slashLine = lines.find((line) => line.trimStart().startsWith('/'));
                  if (slashLine) {
                    const query = slashLine.trimStart().slice(1);
                    setSlashBlockId(block.id);
                    setSlashQuery(query);
                    // Remove the slash line from the block content
                    const nextContent = lines.filter((line) => line !== slashLine).join('\n').trimEnd();
                    ops.handleTextBlockChange(documentScene.sceneId, block.id, nextContent);
                    return;
                  }
                  ops.handleTextBlockChange(documentScene.sceneId, block.id, content);
                }}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === 'Backspace' && block.content.length === 0) {
                    ops.handleEmptyBackspace(`text:${block.id}`, () => ops.removeBlock(documentScene.sceneId, block.id));
                  }
                  if (event.nativeEvent.key === 'Escape') {
                    setSlashBlockId(null);
                    setSlashQuery('');
                  }
                }}
                style={{
                  color: colors.foreground,
                  fontSize: 17,
                  lineHeight: 27,
                  paddingVertical: 7,
                  marginBottom: isPhone ? 10 : 0,
                  outline: 'none',
                }}
                textAlignVertical="top"
                placeholder={textPlaceholder}
                placeholderTextColor={colors.muted}
                accessibilityLabel={textPlaceholder}
                accessibilityHint={t('document.a11y.narration')}
              />
              <DocumentCommandMenu
                query={slashQuery}
                visible={isSlashOpen}
                isPhone={isPhone}
                onPick={(command) => {
                  ops.insertCommand(documentScene.sceneId, command);
                  setSlashBlockId(null);
                  setSlashQuery('');
                }}
                onClose={() => {
                  setSlashBlockId(null);
                  setSlashQuery('');
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
});
