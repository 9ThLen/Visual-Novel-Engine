# Plan 06-02: Reader Integration — Summary

**Status:** Complete ✓

## What Was Built

### `lib/scene-record-adapter.ts` (modified)
- Added `@deprecated` JSDoc to `sceneRecordToStoryScene` — use `useSceneExecutor` instead

### `lib/runtime-story.ts` (modified)
- Added deprecation notice on `sceneRecordToStoryScene` import

### `hooks/useReaderInitialization.ts` (modified)
- Added `sceneRecord: SceneRecord | null` and `timeline: TimelineStep[]` to return value
- Uses `getCanonicalSceneRecordFromState` to resolve canonical scene record
- `currentScene` kept as `@deprecated` for backward compat

### `components/story-reader-responsive.tsx` (modified)
- Added new props: `timeline`, `initialVariables`, `onTransition` alongside existing `scene` (deprecated)
- When `timeline` is provided, uses `useSceneExecutor` internally and derives display values from executor state
- Falls back to legacy `scene`-based rendering when `timeline` is absent
- Choices rendered from executor's `sceneState.currentChoices` when in executor mode
- Tap handler uses `advance()` from executor in new mode
- Background, characters, text/dialogue, choices all driven by executor state

### `app/reader.tsx` (modified)
- Extracts `timeline` from `useReaderInitialization`
- Uses `handleTransition` callback instead of `handleContinue`/`handleChoiceSelect`
- Passes `timeline` and `onTransition` to `StoryReaderResponsive`

## Verification
- `npm run check` passes

## Files Changed
- `lib/scene-record-adapter.ts`
- `lib/runtime-story.ts`
- `lib/canonical-scene.ts`
- `hooks/useReaderInitialization.ts`
- `components/story-reader-responsive.tsx`
- `app/reader.tsx`
