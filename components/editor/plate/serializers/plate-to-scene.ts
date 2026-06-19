import type { Character } from '@/lib/character-types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import type { SceneRecord } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { PlateDocumentScene } from '../types';

export function plateDocumentToSceneRecord(
  record: SceneRecord,
  documentScene: PlateDocumentScene,
  characters: Character[] = [],
  options: { nextSceneId?: string } = {},
): SceneRecord {
  // Normalization repairs the document-shaped payload from the embedded editor;
  // saveDocumentSceneToRecord owns the DocumentScene -> SceneRecord mapping.
  const normalized = normalizePlateDocumentScene(documentScene, characters);
  return saveDocumentSceneToRecord(record, normalized.scene, options);
}
