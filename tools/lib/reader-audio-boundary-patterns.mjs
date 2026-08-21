/**
 * Boundary rule for reader/audio modules: they consume ReaderScene/AudioScene
 * projections, never the SceneRecord storage shape.
 *
 * Only two things count as handling that shape — a reference to the type
 * itself, and the accessor family that hands back a raw record. Both patterns
 * are word-anchored on purpose: a camelCase identifier that merely embeds the
 * word crosses no boundary (migrateSceneRecordTimeline takes and returns
 * TimelineStep[]; targetSceneRecord is a local name), and an unanchored
 * substring match reported those as violations they never made.
 *
 * Known limitation: reaching into `sceneRecordsByStory` directly would slip
 * past this guard. It is not matched because bundled-story-sync legitimately
 * names that field while typing its values as AudioScene projections, so the
 * pattern would flag correct code. Treat this as a cheap regression fence, not
 * a proof of the boundary.
 */
export const READER_AUDIO_BOUNDARY_PATTERNS = [
  /\bSceneRecord\b/,
  /\bgetSceneRecord\w*/,
];

/** Whether a single source line handles the SceneRecord storage shape. */
export function hasReaderAudioBoundaryViolation(line) {
  return READER_AUDIO_BOUNDARY_PATTERNS.some((pattern) => pattern.test(line));
}
