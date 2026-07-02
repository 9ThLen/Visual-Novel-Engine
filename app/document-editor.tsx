import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  PlateSceneEditor,
} from '@/components/editor/plate/PlateSceneEditor';
import { ScreenContainer } from '@/components/screen-container';
import { orderSceneRecordsForDocument } from '@/lib/document-editor/document-scene';
import {
  connectSourceToNext,
  createNextSceneRecordAfter,
  insertSceneAfter,
} from '@/lib/document-editor/next-scene';
import { useI18n } from '@/hooks/use-i18n';
import { addAssetToLibraryPure } from '@/lib/media-library-service';
import {
  selectCanonicalSceneRecord,
  selectSceneRecordsForStory,
  useAppStore,
} from '@/stores/use-app-store';
import type { Character } from '@/lib/character-types';
import type { DialogueBlockData, SceneRecord } from '@/lib/engine/types';
import type { VNPlateBackgroundAsset } from '@/lib/vn-plate-editor/types';

export default function DocumentEditorRoute() {
  const { t } = useI18n();
  const router = useRouter();
  const { storyId, sceneId } = useLocalSearchParams<{ storyId: string; sceneId: string }>();
  const isLoaded = useAppStore((state) => state.isLoaded);
  const setCurrentStory = useAppStore((state) => state.loadCurrentStory);

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
  const mediaLibrary = useAppStore((state) => state.mediaLibrary);
  const saveSceneRecord = useAppStore((state) => state.saveSceneRecord);
  const setCharacterLibrary = useAppStore((state) => state.setCharacterLibrary);
  const setMediaLibrary = useAppStore((state) => state.setMediaLibrary);
  const reorderScenes = useAppStore((state) => state.reorderScenes);
  const updateStoryMetadata = useAppStore((state) => state.updateStoryMetadata);
  const orderedScenes = useMemo(() => orderSceneRecordsForDocument(scenes), [scenes]);
  const backgroundAssets = useMemo<VNPlateBackgroundAsset[]>(
    () => mediaLibrary
      .filter((asset) => asset.type === 'image')
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        uri: asset.uri,
      })),
    [mediaLibrary],
  );
  const sceneIndex = Math.max(0, orderedScenes.findIndex((scene) => scene.id === sceneId));
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

  if (!storyId || !sceneId || !sceneRecord || orderedScenes.length === 0) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('document.invalidRoute')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleSave = (sceneRecords: SceneRecord[], nextCharacters: Character[]) => {
    setCharacterLibrary(storyId, nextCharacters);
    sceneRecords.forEach((record) => saveSceneRecord(record));
  };

  const handleUploadBackgroundAsset = async (name: string, dataUri: string): Promise<VNPlateBackgroundAsset | null> => {
    if (!dataUri.startsWith('data:image/')) return null;
    const result = await addAssetToLibraryPure(dataUri, name || 'background.png', 'image', mediaLibrary);
    setMediaLibrary(result.assets);
    return {
      id: result.asset.id,
      name: result.asset.name,
      uri: result.asset.uri,
    };
  };

  const handleCreateNextScene = (
    sourceSceneId: string,
    editedRecords: SceneRecord[],
    nextCharacters: Character[],
  ) => {
    const recordsById = new Map(orderedScenes.map((scene) => [scene.id, scene]));
    editedRecords.forEach((record) => recordsById.set(record.id, record));

    const sourceRecord = recordsById.get(sourceSceneId);
    if (!sourceRecord) return;

    const nextScene = createNextSceneRecordAfter(sourceRecord, [...recordsById.values()]);
    const withNextScene = [...recordsById.values(), nextScene];
    const connectedRecords = connectSourceToNext(withNextScene, sourceSceneId, nextScene.id);
    const nextOrder = insertSceneAfter(orderedScenes.map((scene) => scene.id), sourceSceneId, nextScene.id);

    setCharacterLibrary(storyId, nextCharacters);
    connectedRecords.forEach((record) => saveSceneRecord(record));
    reorderScenes(storyId, nextOrder);
    updateStoryMetadata(storyId, { sceneCount: connectedRecords.length });
    router.push({ pathname: '/document-editor', params: { storyId, sceneId: nextScene.id } });
  };

  return (
    <PlateSceneEditor
      storyId={storyId}
      sceneRecord={sceneRecord}
      scenes={orderedScenes}
      sceneIndex={sceneIndex}
      sceneCount={orderedScenes.length}
      characters={characters}
      backgroundAssets={backgroundAssets}
      protectedCharacterIds={protectedCharacterIds}
      onSave={handleSave}
      onCreateNextScene={handleCreateNextScene}
      onUploadBackgroundAsset={handleUploadBackgroundAsset}
    />
  );
}
