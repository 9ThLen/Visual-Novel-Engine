import { hasReaderAudioBoundaryViolation } from '../../../tools/lib/reader-audio-boundary-patterns.mjs';

describe('reader/audio boundary patterns', () => {
  it('flags references to the SceneRecord storage shape', () => {
    const violations = [
      "import type { SceneRecord } from '@/lib/engine/types';",
      'const record: SceneRecord | undefined = lookup();',
      'const records: SceneRecord[] = [];',
      'sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;',
    ];

    violations.forEach((line) => {
      expect(hasReaderAudioBoundaryViolation(line)).toBe(true);
    });
  });

  it('flags the accessor family that hands back a raw record', () => {
    const violations = [
      "import { getSceneRecordFromAccess } from '@/lib/scene-access';",
      'getSceneRecordFromAccess(snapshot, storyId, sceneId)',
      'access.getSceneRecord(storyId, sceneId)',
      'snapshot.getSceneRecordMapForStory(storyId)',
    ];

    violations.forEach((line) => {
      expect(hasReaderAudioBoundaryViolation(line)).toBe(true);
    });
  });

  it('leaves identifiers that only embed the word alone', () => {
    const allowed = [
      // Takes and returns TimelineStep[], never the record itself.
      'const migrated = migrateSceneRecordTimeline(timeline);',
      // Word-anchoring matters: both of these contain "getSceneRecord".
      'const targetSceneRecord = pickTarget();',
      'forgetSceneRecordCache();',
      // A projected value under the same field name is not the storage shape.
      'const map = snapshot.sceneRecordsByStory[storyId];',
      'const sceneRecord = useAppStore((s) => s.currentScene);',
    ];

    allowed.forEach((line) => {
      expect(hasReaderAudioBoundaryViolation(line)).toBe(false);
    });
  });
});
