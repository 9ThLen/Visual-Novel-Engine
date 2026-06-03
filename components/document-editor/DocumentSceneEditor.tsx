/**
 * DocumentSceneEditor — main document-style scene editor screen.
 *
 * Refactored from 719 LOC God Component to <350 LOC by extracting:
 * - useDocumentScroll — scroll management, keyboard tracking, page layout refs
 * - useBlockOperations — block/line mutations, backspace handling, commands
 * - saveDocumentSceneToRecord — persistence helper (see lib/document-scene-persistence.ts)
 * - DocumentBlockDialogue — dialogue block sub-component
 * - DocumentBlockChoice — choice block sub-component
 *
 * Sub-components:
 * - DocumentEditorHeader — top bar with save/back/preview
 * - DocumentSceneSidebar — scene list (desktop only)
 * - DocumentTechnicalPropertiesPanel — properties for technical blocks
 * - DocumentChip — inline technical block chip
 * - DocumentCommandMenu — slash command palette
 */

import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, View, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentEditorHeader } from '@/components/document-editor/DocumentEditorHeader';
import { DocumentPage } from '@/components/document-editor/DocumentPage';
import { DocumentSceneSidebar } from '@/components/document-editor/DocumentSceneSidebar';
import { DocumentTechnicalPropertiesPanel } from '@/components/document-editor/DocumentTechnicalPropertiesPanel';
import { useDocumentScroll } from '@/components/document-editor/useDocumentScroll';
import { useBlockOperations } from '@/components/document-editor/useBlockOperations';
import { useColors } from '@/hooks/use-colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useI18n } from '@/lib/i18n';
import {
  ensureDocumentCharactersInBlocks,
  refreshDocumentTechnicalBlock,
} from '@/lib/document-editor/document-scene';
import type { DocumentScene, DocumentTechnicalBlock } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';

interface DocumentSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  sceneIndex: number;
  sceneCount: number;
  initialDocuments: DocumentScene[];
  characters: Character[];
  protectedCharacterIds?: string[];
  onSave: (documentScenes: DocumentScene[], characters: Character[]) => void;
  onCreateNextScene: (sourceSceneId: string, documentScenes: DocumentScene[], characters: Character[]) => void;
}

export function DocumentSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  sceneIndex,
  sceneCount,
  initialDocuments,
  characters,
  protectedCharacterIds = [],
  onSave,
  onCreateNextScene,
}: DocumentSceneEditorProps) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isPhone = layout.deviceType === 'phone';

  // ── State ────────────────────────────────────────────────────────────────
  const [documentScenes, setDocumentScenes] = useState(initialDocuments);
  const [localCharacters, setLocalCharacters] = useState(characters);
  const [lineDrafts, setLineDrafts] = useState<Record<string, string>>({});
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [prevDocuments, setPrevDocuments] = useState(initialDocuments);

  // Sync state when props change
  if (prevDocuments !== initialDocuments) {
    setDocumentScenes(initialDocuments);
    setLocalCharacters(characters);
    setActiveSceneId(sceneRecord.id);
    setSelectedBlockId(null);
    setLineDrafts({});
    setPrevDocuments(initialDocuments);
  }

  // ── Hooks ────────────────────────────────────────────────────────────────
  const scroll = useDocumentScroll({
    activeSceneId,
    isPhone,
    screenHeight: layout.screenHeight,
  });

  const ops = useBlockOperations({
    documentScenes,
    localCharacters,
    lineDrafts,
    selectedBlockId,
    protectedCharacterIds,
    onDocumentScenesChange: setDocumentScenes,
    onLocalCharactersChange: setLocalCharacters,
    onLineDraftsChange: setLineDrafts,
    onSelectedBlockIdChange: setSelectedBlockId,
    onCreateNextScene,
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeDocument = documentScenes.find((ds) => ds.sceneId === activeSceneId) ?? documentScenes[0];
  const selectedTechnicalBlockInfo = documentScenes
    .flatMap((ds) => ds.blocks.map((block) => ({ sceneId: ds.sceneId, block })))
    .find((item): item is { sceneId: string; block: DocumentTechnicalBlock } =>
      item.block.kind === 'technical' && item.block.id === selectedBlockId,
    ) ?? null;
  const selectedTechnicalBlock = selectedTechnicalBlockInfo?.block ?? null;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    setIsSaving(true);
    const nextDocuments = documentScenes.map((ds) => ({ ...ds, blocks: [...ds.blocks] }));
    const ensured = ensureDocumentCharactersInBlocks(
      nextDocuments.flatMap((ds) => ds.blocks),
      localCharacters,
    );
    let cursor = 0;
    const ensuredDocuments = nextDocuments.map((ds) => {
      const blocks = ensured.blocks.slice(cursor, cursor + ds.blocks.length);
      cursor += ds.blocks.length;
      return { ...ds, blocks };
    });
    onSave(ensuredDocuments, ensured.characters);
    setLocalCharacters(ensured.characters);
    setDocumentScenes(ensuredDocuments);
    setTimeout(() => setIsSaving(false), 250);
  }, [documentScenes, localCharacters, onSave]);

  // ── Page render ──────────────────────────────────────────────────────────
  const renderPage = useCallback((documentScene: DocumentScene, pageIndex: number) => {
    const lineDraft = lineDrafts[documentScene.sceneId] ?? '';
    const slashOpen = lineDraft.trimStart().startsWith('/');
    const slashQuery = slashOpen ? lineDraft.trimStart().slice(1) : '';
    return (
      <DocumentPage
        documentScene={documentScene}
        pageIndex={pageIndex}
        isPhone={isPhone}
        sceneCount={sceneCount}
        sceneRecordId={sceneRecord.id}
        lineDraft={lineDraft}
        slashOpen={slashOpen}
        slashQuery={slashQuery}
        selectedBlockId={selectedBlockId}
        localCharacters={localCharacters}
        setLocalCharacters={setLocalCharacters}
        setActiveSceneId={setActiveSceneId}
        setSelectedBlockId={setSelectedBlockId}
        ops={ops}
        scroll={scroll}
        t={t}
      />
    );
  }, [isPhone, lineDrafts, localCharacters, ops, sceneCount, sceneRecord.id, scroll, selectedBlockId, t]);

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={0}
    >
      <DocumentEditorHeader
        activeTitle={activeDocument?.sceneName || sceneRecord.name}
        isPhone={isPhone}
        isSaving={isSaving}
        safeTop={insets.top}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        onBack={() => router.back()}
        onPreview={() => router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } })}
        onSave={handleSave}
        onSaveAndPlay={() => {
          handleSave();
          router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
        }}
      />

      <View style={{ flex: 1, flexDirection: isPhone ? 'column' : 'row' }}>
        {!isPhone ? (
          <DocumentSceneSidebar
            activeSceneId={sceneRecord.id}
            scenes={scenes}
            onScenePress={(sceneId) => router.push({ pathname: '/document-editor', params: { storyId, sceneId } })}
          />
        ) : null}

        <ScrollView
          ref={scroll.scrollViewRef}
          style={{ flex: 1 }}
          onLayout={(event) => {
            scroll.scrollViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          contentContainerStyle={{
            paddingHorizontal: isPhone ? 0 : 28,
            paddingVertical: isPhone ? 0 : 24,
            paddingBottom: isPhone ? insets.bottom + scroll.keyboardHeight + 180 : 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={120}
          onScroll={(event) => {
            const scrollY = event.nativeEvent.contentOffset.y + 120;
            const visibleSceneId = documentScenes.reduce((currentSceneId, ds) => {
              const pageOffset = scroll.pageOffsetsRef.current[ds.sceneId] ?? 0;
              return pageOffset <= scrollY ? ds.sceneId : currentSceneId;
            }, documentScenes[0]?.sceneId ?? activeSceneId);
            if (visibleSceneId !== activeSceneId) {
              setActiveSceneId(visibleSceneId);
            }
          }}
          onContentSizeChange={() => {
            if (scroll.shouldFollowWritingRef.current) {
              scroll.scrollToWritingPosition();
            }
          }}
        >
          {documentScenes.map((documentScene, index) => renderPage(documentScene, index))}
        </ScrollView>

        <DocumentTechnicalPropertiesPanel
          block={selectedTechnicalBlock}
          isPhone={isPhone}
          onClose={() => setSelectedBlockId(null)}
          onChange={(nextBlock) => {
            if (!selectedTechnicalBlockInfo) return;
            ops.updateBlock(selectedTechnicalBlockInfo.sceneId, nextBlock.id, () =>
              refreshDocumentTechnicalBlock(nextBlock, localCharacters),
            );
          }}
          onRemoveBlock={
            selectedTechnicalBlock && selectedTechnicalBlock.blockType !== 'background' && selectedTechnicalBlockInfo
              ? () => ops.removeBlock(selectedTechnicalBlockInfo.sceneId, selectedTechnicalBlock.id)
              : undefined
          }
          onEmptyBackspace={ops.handleEmptyBackspace}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
