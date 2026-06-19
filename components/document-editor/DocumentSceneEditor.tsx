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
import { PlateWebViewEditor } from '@/components/vn-plate-editor/PlateWebViewEditor';
import { useColors } from '@/hooks/use-colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useI18n } from '@/hooks/use-i18n';
import { ensureDocumentCharactersInBlocks } from '@/lib/document-editor/document-scene';
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
  characters: Character[];
  protectedCharacterIds?: string[];
  onSave: (documentScenes: DocumentScene[], characters: Character[]) => void;
  onCreateNextScene: (sourceSceneId: string, documentScenes: DocumentScene[], characters: Character[]) => void;
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
  characters,
  onSave,
  onCreateNextScene,
  onBack,
  onPreview,
  onSaveAndPlay,
}: DocumentSceneEditorProps) {
  const router = useRouter();
  const documentColorScheme = 'light';
  const colors = useColors(documentColorScheme);
  const { t } = useI18n();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isPhone = layout.deviceType === 'phone';

  const [documentScenes, setDocumentScenes] = useState(initialDocuments);
  const [localCharacters, setLocalCharacters] = useState(characters);
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [isSaving, setIsSaving] = useState(false);
  const [prevDocuments, setPrevDocuments] = useState(initialDocuments);
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savingTimerRef.current) {
        clearTimeout(savingTimerRef.current);
        savingTimerRef.current = null;
      }
    };
  }, []);

  if (prevDocuments !== initialDocuments) {
    setDocumentScenes(initialDocuments);
    setLocalCharacters(characters);
    setActiveSceneId(sceneRecord.id);
    setPrevDocuments(initialDocuments);
  }

  const activeDocument = documentScenes.find((ds) => ds.sceneId === activeSceneId) ?? documentScenes[0];

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

    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
    }
    savingTimerRef.current = setTimeout(() => {
      setIsSaving(false);
      savingTimerRef.current = null;
    }, 250);
  }, [documentScenes, localCharacters, onSave]);

  const handlePlateChange = useCallback((nextScene: DocumentScene, nextCharacters: Character[]) => {
    setActiveSceneId(nextScene.sceneId);
    setLocalCharacters(nextCharacters);
    setDocumentScenes((current) =>
      current.map((documentScene) =>
        documentScene.sceneId === nextScene.sceneId ? nextScene : documentScene,
      ),
    );
  }, []);

  const handleCreateNextScene = useCallback((nextScene: DocumentScene, nextCharacters: Character[]) => {
    const nextDocuments = documentScenes.map((documentScene) =>
      documentScene.sceneId === nextScene.sceneId ? nextScene : documentScene,
    );
    setActiveSceneId(nextScene.sceneId);
    setLocalCharacters(nextCharacters);
    setDocumentScenes(nextDocuments);
    onCreateNextScene(nextScene.sceneId, nextDocuments, nextCharacters);
  }, [documentScenes, onCreateNextScene]);

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
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        onBack={onBack ?? (() => router.back())}
        onPreview={() => {
          if (onPreview) {
            onPreview(activeSceneId);
            return;
          }
          router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
        }}
        onSave={handleSave}
        onSaveAndPlay={() => {
          handleSave();
          if (onSaveAndPlay) {
            onSaveAndPlay(activeSceneId);
            return;
          }
          router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
        }}
      />

      <View style={{ flex: 1, flexDirection: isPhone ? 'column' : 'row' }}>
        {!isPhone ? (
          <DocumentSceneSidebar
            activeSceneId={activeSceneId}
            colorScheme={documentColorScheme}
            scenes={scenes}
            onScenePress={(sceneId) => router.push({ pathname: '/document-editor', params: { storyId, sceneId } })}
          />
        ) : null}

        <ScrollView
          style={{
            flex: 1,
          }}
          contentContainerStyle={{
            paddingHorizontal: isPhone ? 0 : 28,
            paddingVertical: isPhone ? 0 : 24,
            paddingBottom: isPhone ? insets.bottom : 24,
            gap: isPhone ? 0 : 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {documentScenes.map((documentScene) => (
            <PlateWebViewEditor
              key={documentScene.sceneId}
              editorId={`vn-plate-${storyId}-${documentScene.sceneId}`}
              scene={documentScene}
              characters={localCharacters}
              isPhone={isPhone}
              style={{
                height: isPhone ? Math.max(layout.screenHeight - insets.top - 88, 620) : 760,
                minHeight: isPhone ? 620 : 760,
              }}
              onChange={handlePlateChange}
              onCreateNextScene={handleCreateNextScene}
            />
          ))}
        </ScrollView>

        {!isPhone ? (
          <DocumentInspectorPanel colorScheme={documentColorScheme} scene={activeDocument ?? null} />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
