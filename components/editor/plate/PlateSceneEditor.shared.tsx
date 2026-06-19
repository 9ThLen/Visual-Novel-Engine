import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';

import {
  DocumentSceneEditor,
} from '@/components/document-editor/DocumentSceneEditor';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { PlateDocumentScene } from './types';
import { sceneRecordToPlateDocument } from './serializers/scene-to-plate';
import { plateDocumentToSceneRecord } from './serializers/plate-to-scene';

interface PlateSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  sceneIndex: number;
  sceneCount: number;
  characters: Character[];
  protectedCharacterIds?: string[];
  onSave: (sceneRecords: SceneRecord[], characters: Character[]) => void;
  onCreateNextScene?: (sourceSceneId: string, sceneRecords: SceneRecord[], characters: Character[]) => void;
}

export function PlateSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  sceneIndex,
  sceneCount,
  characters,
  protectedCharacterIds,
  onSave,
  onCreateNextScene,
}: PlateSceneEditorProps) {
  const router = useRouter();
  const initialDocuments = useMemo(
    () => scenes.map((scene) => sceneRecordToPlateDocument(scene, characters)),
    [characters, scenes],
  );

  const documentsToRecords = (documentScenes: PlateDocumentScene[], nextCharacters: Character[]) => {
    const recordsById = new Map(scenes.map((scene) => [scene.id, scene]));
    return documentScenes.flatMap((documentScene, index) => {
      const sourceRecord = recordsById.get(documentScene.sceneId);
      if (!sourceRecord) return [];
      return [plateDocumentToSceneRecord(sourceRecord, documentScene, nextCharacters, {
        nextSceneId: scenes[index + 1]?.id,
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
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      initialDocuments={initialDocuments}
      characters={characters}
      protectedCharacterIds={protectedCharacterIds}
      onSave={saveDocuments}
      onCreateNextScene={createNextScene}
      onBack={() => router.back()}
      onPreview={(sceneId) => router.push({ pathname: '/preview', params: { storyId, sceneId } })}
      onSaveAndPlay={(sceneId) => router.push({ pathname: '/preview', params: { storyId, sceneId } })}
    />
  );
}
