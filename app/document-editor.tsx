import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  PlateSceneEditor,
} from '@/components/editor/plate/PlateSceneEditor';
import { ScreenContainer } from '@/components/screen-container';
import { startBranchScene } from '@/lib/document-editor/branch-actions';
import { buildBranchBreadcrumbTrail } from '@/lib/document-editor/branch-breadcrumb';
import { computeBranchColorBySceneId } from '@/lib/document-editor/branch-colors';
import { expandActivePath } from '@/lib/document-editor/story-path';
import {
  connectSourceToNext,
  createNextSceneRecordAfter,
  insertSceneAfter,
} from '@/lib/document-editor/next-scene';
import { useI18n } from '@/hooks/use-i18n';
import { getPlaybackAudioLibraryPure } from '@/lib/audio-library';
import { addAssetToLibraryPure } from '@/lib/media-library-service';
import {
  selectCanonicalSceneRecord,
  selectSceneRecordsForStory,
  useAppStore,
} from '@/stores/use-app-store';
import {
  selectBranchSelections,
  selectDocumentViewMode,
  useBranchSelections,
  type DocumentViewMode,
} from '@/stores/use-branch-selections';
import type { Character } from '@/lib/character-types';
import type { DialogueBlockData, SceneRecord } from '@/lib/engine/types';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset } from '@/lib/vn-plate-editor/types';

export default function DocumentEditorRoute() {
  const { t } = useI18n();
  const router = useRouter();
  const { storyId, sceneId } = useLocalSearchParams<{ storyId: string; sceneId: string }>();
  const isLoaded = useAppStore((state) => state.isLoaded);
  const setCurrentStory = useAppStore((state) => state.loadCurrentStory);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const [sceneRecordsHydrated, setSceneRecordsHydrated] = useState(false);

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
  const audioLibraries = useAppStore((state) => state.audioLibraries);
  const mediaLibrary = useAppStore((state) => state.mediaLibrary);
  const saveSceneRecord = useAppStore((state) => state.saveSceneRecord);
  const setCharacterLibrary = useAppStore((state) => state.setCharacterLibrary);
  const setMediaLibrary = useAppStore((state) => state.setMediaLibrary);
  const reorderScenes = useAppStore((state) => state.reorderScenes);
  const updateStoryMetadata = useAppStore((state) => state.updateStoryMetadata);
  const branchSelections = useBranchSelections(useMemo(() => selectBranchSelections(storyId), [storyId]));
  const selectChoiceOption = useBranchSelections((state) => state.selectChoiceOption);
  const viewMode = useBranchSelections(useMemo(() => selectDocumentViewMode(storyId), [storyId]));
  const setDocumentViewMode = useBranchSelections((state) => state.setDocumentViewMode);
  const activePath = useMemo(() => expandActivePath(scenes, branchSelections), [branchSelections, scenes]);
  const orderedScenes = useMemo(() => {
    // «Всі сцени»: every scene in story order, no branch filtering.
    if (viewMode === 'all') return scenes;
    // The document renders the active path. If the route scene fell off it
    // (orphaned tail, or the author opened a scene from «Поза сюжетом»), append
    // the off-path scenes so the target scene is still reachable and editable.
    const onActivePath = !sceneId || activePath.activeScenes.some((scene) => scene.id === sceneId);
    return onActivePath
      ? activePath.activeScenes
      : [...activePath.activeScenes, ...activePath.offPathScenes];
  }, [activePath, sceneId, scenes, viewMode]);
  const branchInfo = useMemo(
    () => Object.values(activePath.branchInfoByChoiceStepId),
    [activePath.branchInfoByChoiceStepId],
  );
  const incomingCountBySceneId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [id, metadata] of Object.entries(activePath.metadataBySceneId)) {
      counts[id] = metadata.incomingCount;
    }
    return counts;
  }, [activePath.metadataBySceneId]);
  const branchColorBySceneId = useMemo(() => computeBranchColorBySceneId(activePath), [activePath]);
  const branchBreadcrumbTrail = useMemo(() => buildBranchBreadcrumbTrail(activePath), [activePath]);
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
  const audioAssets = useMemo<VNPlateAudioAsset[]>(
    () => storyId
      ? getPlaybackAudioLibraryPure(storyId, audioLibraries, mediaLibrary).map((asset) => ({
          id: asset.id,
          name: asset.name,
          uri: asset.uri,
          type: asset.type,
          duration: asset.duration,
        }))
      : [],
    [audioLibraries, mediaLibrary, storyId],
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

  useEffect(() => {
    let cancelled = false;
    setSceneRecordsHydrated(false);

    if (!storyId) {
      setSceneRecordsHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    if (!isLoaded) {
      return () => {
        cancelled = true;
      };
    }

    void hydrateSceneRecordsForStory(storyId).finally(() => {
      if (!cancelled) setSceneRecordsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [hydrateSceneRecordsForStory, isLoaded, storyId]);

  if (!isLoaded || !sceneRecordsHydrated) {
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

  const handleUploadAudioAsset = async (name: string, dataUri: string): Promise<VNPlateAudioAsset | null> => {
    if (!dataUri.startsWith('data:audio/')) return null;
    const result = await addAssetToLibraryPure(dataUri, name || 'audio.mp3', 'audio', mediaLibrary);
    setMediaLibrary(result.assets);
    const playbackAsset = getPlaybackAudioLibraryPure(storyId, audioLibraries, result.assets)
      .find((asset) => asset.id === result.asset.id);
    return {
      id: result.asset.id,
      name: result.asset.name,
      uri: result.asset.uri,
      type: playbackAsset?.type ?? 'sfx',
      duration: playbackAsset?.duration,
    };
  };

  const handleCreateNextScene = (
    sourceSceneId: string,
    editedRecords: SceneRecord[],
    nextCharacters: Character[],
  ) => {
    // Base everything on ALL story scenes, not just the rendered active path:
    // scene numbering, sceneCount metadata, and the reorder list must include
    // off-path scenes («Поза сюжетом») or they would be renumbered/pushed to
    // the end and the story metadata would undercount.
    const allScenes = selectSceneRecordsForStory(storyId)(useAppStore.getState());
    const recordsById = new Map(allScenes.map((scene) => [scene.id, scene]));
    editedRecords.forEach((record) => recordsById.set(record.id, record));

    const sourceRecord = recordsById.get(sourceSceneId);
    if (!sourceRecord) return;

    const nextScene = createNextSceneRecordAfter(sourceRecord, [...recordsById.values()]);
    const withNextScene = [...recordsById.values(), nextScene];
    const connectedRecords = connectSourceToNext(withNextScene, sourceSceneId, nextScene.id);
    const nextOrder = insertSceneAfter(
      [...recordsById.keys()],
      sourceSceneId,
      nextScene.id,
    );

    setCharacterLibrary(storyId, nextCharacters);
    connectedRecords.forEach((record) => saveSceneRecord(record));
    reorderScenes(storyId, nextOrder);
    updateStoryMetadata(storyId, { sceneCount: connectedRecords.length });
    router.push({ pathname: '/document-editor', params: { storyId, sceneId: nextScene.id } });
  };

  const handleSelectChoiceOption = (choiceStepId: string, optionId: string) => {
    selectChoiceOption(storyId, choiceStepId, optionId);
  };

  const handleSetViewMode = (mode: DocumentViewMode) => {
    setDocumentViewMode(storyId, mode);
  };

  const handleStartBranchOption = (choiceStepId: string, optionId: string) => {
    // The editor flushed and saved right before invoking this callback, so
    // this component's `scenes` snapshot may predate that save — read fresh.
    const freshScenes = selectSceneRecordsForStory(storyId)(useAppStore.getState());
    const result = startBranchScene(freshScenes, choiceStepId, optionId);
    if (!result) return;

    saveSceneRecord(result.updatedSourceScene);
    saveSceneRecord(result.newScene);
    const nextOrder = insertSceneAfter(
      freshScenes.map((scene) => scene.id),
      result.updatedSourceScene.id,
      result.newScene.id,
    );
    reorderScenes(storyId, nextOrder);
    updateStoryMetadata(storyId, { sceneCount: freshScenes.length + 1 });
    selectChoiceOption(storyId, choiceStepId, optionId);
    router.push({ pathname: '/document-editor', params: { storyId, sceneId: result.newScene.id } });
  };

  return (
    <PlateSceneEditor
      storyId={storyId}
      sceneRecord={sceneRecord}
      scenes={orderedScenes}
      offPathScenes={viewMode === 'all' ? [] : activePath.offPathScenes}
      branchInfo={branchInfo}
      onSelectChoiceOption={handleSelectChoiceOption}
      onStartBranchOption={handleStartBranchOption}
      incomingCountBySceneId={incomingCountBySceneId}
      branchColorBySceneId={viewMode === 'all' ? undefined : branchColorBySceneId}
      branchBreadcrumbTrail={viewMode === 'all' ? undefined : branchBreadcrumbTrail}
      viewMode={viewMode}
      onSetViewMode={handleSetViewMode}
      sceneIndex={sceneIndex}
      sceneCount={orderedScenes.length}
      characters={characters}
      backgroundAssets={backgroundAssets}
      audioAssets={audioAssets}
      protectedCharacterIds={protectedCharacterIds}
      onSave={handleSave}
      onCreateNextScene={handleCreateNextScene}
      onUploadBackgroundAsset={handleUploadBackgroundAsset}
      onUploadAudioAsset={handleUploadAudioAsset}
    />
  );
}
