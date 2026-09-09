/**
 * Everything one story leaves on the device, removed together.
 *
 * Scenes and snapshots are written by different modules and were, until now,
 * cleaned up by different rules — scenes by a persist that inferred deletion
 * from absence, snapshots by nothing at all. The inference is gone (it wiped
 * stories that were merely not loaded yet), so both have to be removed on
 * purpose, and the only way to keep them in step is to have one function that
 * does both.
 */

import { deleteSceneRecordsForStory, type SceneRecordStorageLike } from '@/lib/scene-record-storage';
import { deleteAllSnapshotsForStory } from '@/lib/story-snapshots';

/**
 * Forget a story: its scene records and every snapshot of it.
 *
 * Only for a story that is actually gone. Each half is independent, so one
 * failing does not stop the other — leftovers are unreachable rather than
 * harmful, and a half-cleanup is better than none.
 */
export async function forgetStoryStorage(
  storage: SceneRecordStorageLike,
  storyId: string,
): Promise<void> {
  if (!storyId) return;

  const results = await Promise.allSettled([
    deleteSceneRecordsForStory(storage, storyId),
    deleteAllSnapshotsForStory(storage, storyId),
  ]);

  const failure = results.find((result) => result.status === 'rejected');
  if (failure && failure.status === 'rejected') throw failure.reason;
}
