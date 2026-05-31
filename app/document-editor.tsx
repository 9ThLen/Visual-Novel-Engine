import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  DocumentSceneEditor,
  saveDocumentSceneToRecord,
} from '@/components/document-editor/DocumentSceneEditor';
import { ScreenContainer } from '@/components/screen-container';
import { orderSceneRecordsForDocument, sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import { createSceneRecordFromEditorDraft } from '@/lib/editor-scene-draft';
import { generateId } from '@/lib/id-utils';
import { useStoryActions, useStoryState } from '@/lib/story-hooks';
import { useI18n } from '@/lib/i18n';
import {
  selectCanonicalSceneRecord,
  selectSceneRecordsForStory,
  useAppStore,
} from '@/stores/use-app-store';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { DialogueBlockData } from '@/lib/engine/types';

export default function DocumentEditorRoute() {
  const router = useRouter();
  const { t } = useI18n();
  const { storyId, sceneId } = useLocalSearchParams<{ storyId: string; sceneId: string }>();
  const { isLoaded } = useStoryState();
  const { setCurrentStory } = useStoryActions();

  const sceneRecord = useAppStore(
    useMemo(() => {
      if (!storyId || !sceneId) return () => undefined;
      return selectCanonicalSceneRecord(storyId, sceneId);
    }, [storyId, sceneId])
  );

  const scenes = useAppStore(
    useMemo(() => {
      if (!storyId) return () => [];
      return selectSceneRecordsForStory(storyId);
    }, [storyId])
  );

  const characters = useAppStore((state) => (storyId ? state.characterLibraries[storyId] || [] : []));
  const saveSceneRecord = useAppStore((state) => state.saveSceneRecord);
  const setCharacterLibrary = useAppStore((state) => state.setCharacterLibrary);
  const orderedScenes = useMemo(() => orderSceneRecordsForDocument(scenes), [scenes]);
  const sceneIndex = Math.max(0, orderedScenes.findIndex((scene) => scene.id === sceneId));
  const initialDocuments = useMemo(
    () => orderedScenes.map((scene) => sceneRecordToDocumentScene(scene, characters)),
    [characters, orderedScenes]
  );
  const protectedCharacterIds = useMemo(() => {
    return scenes
      .filter((scene) => scene.id !== sceneId)
      .flatMap((scene) => scene.timeline)
      .flatMap((step) => {
        if (step.blockType !== 'dialogue') return [];
        const data = step.data as DialogueBlockData;
        return data.entries
          .map((entry) => entry.characterId)
          .filter((characterId): characterId is string => Boolean(characterId));
      });
  }, [sceneId, scenes]);

  useEffect(() => {
    if (storyId) {
      setCurrentStory(storyId);
    }
  }, [setCurrentStory, storyId]);

  if (!isLoaded) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 12, fontSize: 14 }}>{t('document.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!storyId || !sceneId || !sceneRecord || initialDocuments.length === 0) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('document.invalidRoute')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleSave = (documentScenes: DocumentScene[], nextCharacters: Character[]) => {
    setCharacterLibrary(storyId, nextCharacters);
    const documentsBySceneId = new Map(documentScenes.map((documentScene) => [documentScene.sceneId, documentScene]));
    orderedScenes.forEach((orderedScene, index) => {
      const documentScene = documentsBySceneId.get(orderedScene.id);
      if (!documentScene) return;
      saveSceneRecord(saveDocumentSceneToRecord(orderedScene, documentScene, {
        nextSceneId: orderedScenes[index + 1]?.id,
      }));
    });
  };

  const handleCreateNextScene = (sourceSceneId: string, documentScenes: DocumentScene[], nextCharacters: Character[]) => {
    const sourceIndex = Math.max(0, orderedScenes.findIndex((scene) => scene.id === sourceSceneId));
    const sourceSceneRecord = orderedScenes[sourceIndex] ?? sceneRecord;
    const nextSceneId = generateId('scene');
    const nextSceneName = t('document.generatedSceneName', { number: sourceIndex + 2 });
    const oldNextSceneId = orderedScenes[sourceIndex + 1]?.id
      ?? sourceSceneRecord.connections?.find((connection) => connection.outputPort === 'next')?.targetSceneId;
    const nextSceneRecord = createSceneRecordFromEditorDraft(storyId, {
      sceneId: nextSceneId,
      sceneName: nextSceneName,
      timeline: [],
    });
    const documentsBySceneId = new Map(documentScenes.map((documentScene) => [documentScene.sceneId, documentScene]));

    setCharacterLibrary(storyId, nextCharacters);
    orderedScenes.forEach((orderedScene, index) => {
      const documentScene = documentsBySceneId.get(orderedScene.id);
      if (!documentScene) return;
      const sequentialNextSceneId = orderedScene.id === sourceSceneRecord.id
        ? nextSceneId
        : orderedScenes[index + 1]?.id;
      saveSceneRecord(saveDocumentSceneToRecord(orderedScene, documentScene, {
        nextSceneId: sequentialNextSceneId,
      }));
    });
    saveSceneRecord({
      ...nextSceneRecord,
      flowX: (sourceSceneRecord.flowX ?? 0) + 260,
      flowY: sourceSceneRecord.flowY ?? 0,
      connections: oldNextSceneId ? [{ targetSceneId: oldNextSceneId, outputPort: 'next', label: 'Next' }] : [],
    });
    router.setParams({ storyId, sceneId: nextSceneId } as never);
  };

  return (
    <DocumentSceneEditor
      storyId={storyId}
      sceneRecord={sceneRecord}
      scenes={orderedScenes}
      sceneIndex={sceneIndex}
      sceneCount={orderedScenes.length}
      initialDocuments={initialDocuments}
      characters={characters}
      protectedCharacterIds={protectedCharacterIds}
      onSave={handleSave}
      onCreateNextScene={handleCreateNextScene}
    />
  );
}
