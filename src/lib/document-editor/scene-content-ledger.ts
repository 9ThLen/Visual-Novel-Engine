/**
 * Tells the document editor's own save apart from somebody else's write.
 *
 * An editor frame is built once from a scene and never refreshed from props, so
 * a scene rewritten in the store — an applied AI change, a rollback, a restored
 * snapshot — keeps showing its old text until the frame is rebuilt. The editor's
 * own save changes the store too, but its frames already show that content, and
 * rebuilding them would drop the caret on every save.
 *
 * `updatedAt` cannot make that distinction: the store stamps every write alike.
 * The ledger compares content instead — what the editor loaded or last wrote
 * against what the store holds now.
 */
import { stableStringify } from '@/lib/ai/scene-revision';
import type { SceneRecord } from '@/lib/engine/types';

/**
 * The part of a record a frame is built from. Connections, flow position and
 * timestamps never reach the frame, so a change to them alone is not a reason
 * to rebuild it.
 */
export type SceneContent = Pick<SceneRecord, 'id' | 'name' | 'timeline'>;

export function sameSceneContent(
  a: Pick<SceneContent, 'name' | 'timeline'>,
  b: Pick<SceneContent, 'name' | 'timeline'>,
): boolean {
  if (a.name !== b.name) return false;
  // The store keeps the timeline array it is handed, so the editor's own write
  // comes back by reference and the common case costs nothing.
  if (a.timeline === b.timeline) return true;
  return stableStringify(a.timeline) === stableStringify(b.timeline);
}

export interface SceneContentLedger {
  /**
   * The editor is about to write these records. Call it before the write, so
   * the store's echo can never be compared against the content it replaced.
   */
  noteWritten: (scenes: SceneContent[]) => void;
  /**
   * Ids of scenes whose stored content is no longer what the editor loaded or
   * wrote. The answer is consumed: the ledger now knows the content it was
   * shown, and scenes that left the document are forgotten.
   */
  reconcile: (scenes: SceneContent[]) => string[];
}

export function createSceneContentLedger(initialScenes: SceneContent[]): SceneContentLedger {
  let known = new Map<string, Pick<SceneContent, 'name' | 'timeline'>>();
  const remember = (scene: SceneContent) => {
    known.set(scene.id, { name: scene.name, timeline: scene.timeline });
  };
  initialScenes.forEach(remember);

  return {
    noteWritten: (scenes) => scenes.forEach(remember),
    reconcile: (scenes) => {
      const previous = known;
      known = new Map();
      const rewritten: string[] = [];
      for (const scene of scenes) {
        const before = previous.get(scene.id);
        // A scene the editor has not seen has no frame to go stale.
        if (before && !sameSceneContent(before, scene)) rewritten.push(scene.id);
        remember(scene);
      }
      return rewritten;
    },
  };
}
