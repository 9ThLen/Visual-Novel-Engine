import type { Character } from '@/lib/character-types';
import { sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import type { SceneRecord } from '@/lib/engine/types';
import type { PlateDocumentScene } from '../types';

export function sceneRecordToPlateDocument(
  sceneRecord: SceneRecord,
  characters: Character[] = [],
): PlateDocumentScene {
  // Plate uses DocumentScene as its transport model. Keep all TimelineStep ->
  // document block mapping in the shared document editor adapter.
  return sceneRecordToDocumentScene(sceneRecord, characters);
}
