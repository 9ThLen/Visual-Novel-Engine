/**
 * lib/document-scene-persistence.ts
 *
 * Persistence helpers for converting document-scene data into the canonical
 * SceneRecord format used by the engine. This module exists as a separate
 * file to keep `components/document-editor/DocumentSceneEditor.tsx` small
 * — see phase 13 (post-audit remediation) for the decomposition context.
 */

import type { SceneRecord } from '@/lib/engine/types';
import type { DocumentScene } from '@/lib/document-editor/types';
import { documentSceneToConnections, documentSceneToTimeline } from '@/lib/document-editor/document-scene';

/**
 * Convert a document-scene edit back into the engine's canonical SceneRecord.
 *
 * Used by parent screens (e.g. `app/document-editor.tsx`) when the user saves
 * a scene from the document-style editor. The original SceneRecord provides
 * engine metadata (flowX/flowY, etc.) that is preserved; only the user-facing
 * fields (name, timeline, connections) are overwritten with the new content.
 */
export function saveDocumentSceneToRecord(
  record: SceneRecord,
  documentScene: DocumentScene,
  options: { nextSceneId?: string } = {},
): SceneRecord {
  return {
    ...record,
    name: documentScene.sceneName.trim() || record.name,
    timeline: documentSceneToTimeline(documentScene),
    connections: documentSceneToConnections(documentScene, options.nextSceneId),
    updatedAt: Date.now(),
  };
}
