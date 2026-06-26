/**
 * DocumentSceneEditor hosts the Plate/WebView document editor.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentEditorHeader } from '@/components/document-editor/DocumentEditorHeader';
import { DocumentInspectorPanel } from '@/components/document-editor/DocumentInspectorPanel';
import { DocumentSceneSidebar } from '@/components/document-editor/DocumentSceneSidebar';
import {
  PlateWebViewEditor,
  type PlateWebViewEditorHandle,
  type PlateWebViewEditorSnapshot,
} from '@/components/vn-plate-editor/PlateWebViewEditor';
import { useColors } from '@/hooks/use-colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { ensureDocumentCharactersInBlocks } from '@/lib/document-editor/document-scene';
import type { VNPlateBackgroundAsset } from '@/lib/vn-plate-editor/types';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { SceneRecord } from '@/lib/engine/types';

interface DocumentSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  sceneIndex: number;
  sceneCount: number;
  initialDocuments: DocumentScene[];
  documentsResetKey: string;
  characters: Character[];
  backgroundAssets: VNPlateBackgroundAsset[];
  protectedCharacterIds?: string[];
  onSave: (documentScenes: DocumentScene[], characters: Character[]) => void;
  onCreateNextScene: (sourceSceneId: string, documentScenes: DocumentScene[], characters: Character[]) => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string) => Promise<VNPlateBackgroundAsset | null>;
  onBack?: () => void;
  onPreview?: (sceneId: string) => void;
  onSaveAndPlay?: (sceneId: string) => void;
}

export function DocumentSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  sceneIndex,
  sceneCount,
  initialDocuments,
  documentsResetKey,
  characters,
  backgroundAssets,
  onSave,
  onCreateNextScene,
  onUploadBackgroundAsset,
  onBack,
  onPreview,
  onSaveAndPlay,
}: DocumentSceneEditorProps) {
  const router = useRouter();
  const documentColorScheme = 'light';
  const colors = useColors(documentColorScheme);
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isPhone = layout.deviceType === 'phone';

  const [documentScenes, setDocumentScenes] = useState(initialDocuments);
  const [localCharacters, setLocalCharacters] = useState(characters);
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [dirtySceneIds, setDirtySceneIds] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<PlateWebViewEditorHandle>(null);
  const draftRegistryRef = useRef(new Map<string, PlateWebViewEditorSnapshot>());
  const prevResetKeyRef = useRef(documentsResetKey);
  const prevRouteSceneIdRef = useRef(sceneRecord.id);
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savingTimerRef.current) {
        clearTimeout(savingTimerRef.current);
        savingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (prevResetKeyRef.current === documentsResetKey) return;
    const routeSceneChanged = prevRouteSceneIdRef.current !== sceneRecord.id;
    prevResetKeyRef.current = documentsResetKey;
    prevRouteSceneIdRef.current = sceneRecord.id;
    if (!routeSceneChanged && dirtySceneIds.has(activeSceneId)) return;
    setDocumentScenes(initialDocuments);
    setLocalCharacters(characters);
    setActiveSceneId(routeSceneChanged ? sceneRecord.id : activeSceneId);
    draftRegistryRef.current.clear();
  }, [activeSceneId, characters, dirtySceneIds, documentsResetKey, initialDocuments, sceneRecord.id]);

  const activeDocument = documentScenes.find((ds) => ds.sceneId === activeSceneId) ?? documentScenes[0];
  const activeSceneIndex = Math.max(0, scenes.findIndex((scene) => scene.id === activeSceneId));

  const applyDraftSnapshot = useCallback((snapshot: PlateWebViewEditorSnapshot, dirty = true) => {
    draftRegistryRef.current.set(snapshot.scene.sceneId, snapshot);
    setLocalCharacters(snapshot.characters);
    setDocumentScenes((current) =>
      current.map((documentScene) =>
        documentScene.sceneId === snapshot.scene.sceneId ? snapshot.scene : documentScene,
      ),
    );
    if (dirty) {
      setDirtySceneIds((current) => {
        const next = new Set(current);
        next.add(snapshot.scene.sceneId);
        return next;
      });
    }
  }, []);

  const flushActiveEditor = useCallback(async () => {
    const snapshot = await editorRef.current?.flush();
    if (!snapshot) return null;
    applyDraftSnapshot(snapshot);
    return snapshot;
  }, [applyDraftSnapshot]);

  const documentsWithDrafts = useCallback(() => {
    return documentScenes.map((documentScene) =>
      draftRegistryRef.current.get(documentScene.sceneId)?.scene ?? documentScene,
    );
  }, [documentScenes]);

  const handleSave = useCallback(async () => {
    const flushed = await flushActiveEditor();
    const saveCharacters = flushed?.characters ?? localCharacters;
    setIsSaving(true);
    const nextDocuments = documentsWithDrafts().map((ds) => ({ ...ds, blocks: [...ds.blocks] }));
    const ensured = ensureDocumentCharactersInBlocks(
      nextDocuments.flatMap((ds) => ds.blocks),
      saveCharacters,
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
    draftRegistryRef.current.clear();
    setDirtySceneIds(new Set());

    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
    }
    savingTimerRef.current = setTimeout(() => {
      setIsSaving(false);
      savingTimerRef.current = null;
    }, 250);
  }, [documentsWithDrafts, flushActiveEditor, localCharacters, onSave]);

  const handlePlateChange = useCallback((nextScene: DocumentScene, nextCharacters: Character[]) => {
    applyDraftSnapshot({ scene: nextScene, characters: nextCharacters });
  }, [applyDraftSnapshot]);

  const handleCreateNextScene = useCallback((nextScene: DocumentScene, nextCharacters: Character[]) => {
    const nextDocuments = documentsWithDrafts().map((documentScene) =>
      documentScene.sceneId === nextScene.sceneId ? nextScene : documentScene,
    );
    draftRegistryRef.current.set(nextScene.sceneId, { scene: nextScene, characters: nextCharacters });
    setActiveSceneId(nextScene.sceneId);
    setLocalCharacters(nextCharacters);
    setDocumentScenes(nextDocuments);
    onCreateNextScene(nextScene.sceneId, nextDocuments, nextCharacters);
  }, [documentsWithDrafts, onCreateNextScene]);

  const handleBack = useCallback(async () => {
    await handleSave();
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  }, [handleSave, onBack, router]);

  const handlePreview = useCallback(async () => {
    await handleSave();
    if (onPreview) {
      onPreview(activeSceneId);
      return;
    }
    router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
  }, [activeSceneId, handleSave, onPreview, router, storyId]);

  const handleSaveAndPlay = useCallback(async () => {
    await handleSave();
    if (onSaveAndPlay) {
      onSaveAndPlay(activeSceneId);
      return;
    }
    router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
  }, [activeSceneId, handleSave, onSaveAndPlay, router, storyId]);

  const handleScenePress = useCallback(async (nextSceneId: string) => {
    if (nextSceneId === activeSceneId) return;
    await flushActiveEditor();
    setActiveSceneId(nextSceneId);
  }, [activeSceneId, flushActiveEditor]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={0}
    >
      <DocumentEditorHeader
        activeTitle={activeDocument?.sceneName || sceneRecord.name}
        colorScheme={documentColorScheme}
        isPhone={isPhone}
        isSaving={isSaving}
        safeTop={insets.top}
        sceneIndex={activeSceneIndex >= 0 ? activeSceneIndex : sceneIndex}
        sceneCount={sceneCount}
        onBack={handleBack}
        onPreview={handlePreview}
        onSave={handleSave}
        onSaveAndPlay={handleSaveAndPlay}
      />

      <View style={{ flex: 1, flexDirection: isPhone ? 'column' : 'row' }}>
        {!isPhone ? (
          <DocumentSceneSidebar
            activeSceneId={activeSceneId}
            colorScheme={documentColorScheme}
            dirtySceneIds={dirtySceneIds}
            scenes={scenes}
            onScenePress={handleScenePress}
          />
        ) : null}

        <ScrollView
          style={{
            flex: 1,
            backgroundColor: colors.background,
          }}
          contentContainerStyle={{
            paddingHorizontal: isPhone ? 0 : 28,
            paddingTop: isPhone ? 0 : 28,
            paddingBottom: isPhone ? insets.bottom + 20 : 36,
            gap: isPhone ? 18 : 34,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {activeDocument ? (
            <PlateWebViewEditor
              ref={editorRef}
              key={activeDocument.sceneId}
              editorId={`vn-plate-${storyId}-${activeDocument.sceneId}`}
              scene={activeDocument}
              characters={localCharacters}
              backgroundAssets={backgroundAssets}
              isPhone={isPhone}
              style={{
                width: '100%',
                maxWidth: isPhone ? undefined : 920,
                alignSelf: 'center',
                overflow: 'visible',
              }}
              onChange={handlePlateChange}
              onCreateNextScene={handleCreateNextScene}
              onUploadBackgroundAsset={onUploadBackgroundAsset}
            />
          ) : null}
        </ScrollView>

        {!isPhone ? (
          <DocumentInspectorPanel colorScheme={documentColorScheme} scene={activeDocument ?? null} />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
