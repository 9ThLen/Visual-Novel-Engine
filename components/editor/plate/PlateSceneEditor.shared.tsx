import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';

import {
  DocumentSceneEditor,
} from '@/components/document-editor/DocumentSceneEditor';
import { buildDocumentsResetKey } from '@/lib/document-editor/document-reset-key';
import { resolveNextSceneIdForSave } from '@/lib/document-editor/document-scene';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset, VNPlateBranchInfo } from '@/lib/vn-plate-editor/types';
import type { PlateDocumentScene } from './types';
import { sceneRecordToPlateDocument } from './serializers/scene-to-plate';
import { plateDocumentToSceneRecord } from './serializers/plate-to-scene';

interface PlateSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  /** Scenes not reachable on the active path («Поза сюжетом»). */
  offPathScenes?: SceneRecord[];
  /** Branch info per choice block on the active path, for the branch switcher. */
  branchInfo?: VNPlateBranchInfo[];
  onSelectChoiceOption?: (choiceStepId: string, optionId: string) => void;
  onStartBranchOption?: (choiceStepId: string, optionId: string) => void;
  /** incomingCount per scene id, drives the merge-point banners. */
  incomingCountBySceneId?: Record<string, number>;
  /** Branch accent color per scene id on the active path (branch tinting). */
  branchColorBySceneId?: Record<string, string>;
  sceneIndex: number;
  sceneCount: number;
  characters: Character[];
  backgroundAssets: VNPlateBackgroundAsset[];
  audioAssets: VNPlateAudioAsset[];
  protectedCharacterIds?: string[];
  onSave: (sceneRecords: SceneRecord[], characters: Character[]) => void;
  onCreateNextScene?: (sourceSceneId: string, sceneRecords: SceneRecord[], characters: Character[]) => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string) => Promise<VNPlateBackgroundAsset | null>;
  onUploadAudioAsset?: (name: string, dataUri: string) => Promise<VNPlateAudioAsset | null>;
}

export function PlateSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  offPathScenes,
  branchInfo,
  onSelectChoiceOption,
  onStartBranchOption,
  incomingCountBySceneId,
  branchColorBySceneId,
  sceneIndex,
  sceneCount,
  characters,
  backgroundAssets,
  audioAssets,
  protectedCharacterIds,
  onSave,
  onCreateNextScene,
  onUploadBackgroundAsset,
  onUploadAudioAsset,
}: PlateSceneEditorProps) {
  const router = useRouter();
  const initialDocuments = useMemo(
    () => scenes.map((scene) => sceneRecordToPlateDocument(scene, characters)),
    [characters, scenes],
  );
  const documentsResetKey = useMemo(
    () => buildDocumentsResetKey(sceneRecord.id, scenes),
    [sceneRecord.id, scenes],
  );

  const documentsToRecords = (documentScenes: PlateDocumentScene[], nextCharacters: Character[]) => {
    const recordsById = new Map(scenes.map((scene) => [scene.id, scene]));
    return documentScenes.flatMap((documentScene, index) => {
      const sourceRecord = recordsById.get(documentScene.sceneId);
      if (!sourceRecord) return [];
      return [plateDocumentToSceneRecord(sourceRecord, documentScene, nextCharacters, {
        nextSceneId: resolveNextSceneIdForSave(sourceRecord, scenes[index + 1]?.id),
      })];
    });
  };

  const saveDocuments = (documentScenes: PlateDocumentScene[], nextCharacters: Character[]) => {
    const nextRecords = documentsToRecords(documentScenes, nextCharacters);
    onSave(nextRecords, nextCharacters);
  };

  const createNextScene = (
    sourceSceneId: string,
    documentScenes: PlateDocumentScene[],
    nextCharacters: Character[],
  ) => {
    const nextRecords = documentsToRecords(documentScenes, nextCharacters);
    onCreateNextScene?.(sourceSceneId, nextRecords, nextCharacters);
  };

  return (
    <DocumentSceneEditor
      storyId={storyId}
      sceneRecord={sceneRecord}
      scenes={scenes}
      offPathScenes={offPathScenes}
      branchInfo={branchInfo}
      onSelectChoiceOption={onSelectChoiceOption}
      onStartBranchOption={onStartBranchOption}
      incomingCountBySceneId={incomingCountBySceneId}
      branchColorBySceneId={branchColorBySceneId}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      initialDocuments={initialDocuments}
      documentsResetKey={documentsResetKey}
      characters={characters}
      backgroundAssets={backgroundAssets}
      audioAssets={audioAssets}
      protectedCharacterIds={protectedCharacterIds}
      onSave={saveDocuments}
      onCreateNextScene={createNextScene}
      onUploadBackgroundAsset={onUploadBackgroundAsset}
      onUploadAudioAsset={onUploadAudioAsset}
      onBack={() => router.back()}
      onPreview={(sceneId) => router.push({ pathname: '/preview', params: { storyId, sceneId } })}
      onSaveAndPlay={(sceneId) => router.push({ pathname: '/preview', params: { storyId, sceneId } })}
    />
  );
}
