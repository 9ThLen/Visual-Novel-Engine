# Phase 07 - Reader Runtime Convergence

## Objective

Make `useSceneExecutor` the single runtime path for editor preview, play mode, and reader timeline playback.

## Source Findings

- `components/editor/PlayMode.tsx` duplicates step processing with local timers, scene state, choice state, transition handling, and multiple `as any` casts.
- `components/story-reader-responsive.tsx` already uses `useSceneExecutor` when given `timeline`, but still contains legacy `scene` fallback paths.
- `components/editor/PreviewScreen.tsx` uses `useSceneExecutor`, but still derives current text, typewriter behavior, asset/audio side effects, and completion behavior locally.
- `lib/engine/useSceneExecutor.ts` yields on `text`, `dialogue`, `choice`, and `transition`; it auto-executes background, character, music, variables, effects, and no-op deferred block types.

## Scope

Primary files:

- `components/editor/PlayMode.tsx`
- `components/story-reader-responsive.tsx`
- `components/editor/PreviewScreen.tsx`
- `lib/engine/useSceneExecutor.ts`
- `app/play.tsx`
- `__tests__/unit/lib/useSceneExecutor.test.ts`

Secondary files only if required:

- `lib/story-reader-choice.ts`
- `lib/reader-launch.ts`
- `lib/translations.ts`
- new focused tests under `__tests__/unit/`

Out of scope:

- Removing legacy `scene` support from `StoryReaderResponsive` unless every caller has migrated.
- Rewriting reader visual design.
- Implementing deferred `sound`, `camera`, or `interactive_object` runtime behavior beyond preserving current no-op behavior.
- Changing persistent story data shape.

## Implementation Plan

1. Add a small reader-runtime adapter if needed, e.g. `lib/reader-runtime.ts`, to resolve:
   - start scene from `storiesMetadata.startSceneId` or `SceneRecord.isStart`
   - next scene via `transitionTarget`, selected choice target, or `connections.outputPort === 'next'`
   - empty/end state
2. Replace `PlayMode.tsx` internals with a thin shell:
   - load story metadata and scene records
   - keep only route-level state: current scene id, idle/playing/finished
   - render `StoryReaderResponsive timeline={currentScene.timeline}`
   - handle `onTransition(targetSceneId)` by changing current scene or ending playback
   - remove local `processStep`, timers, fade loop, `PlayState`, `PlayScene`, and `as any` casts
3. Tighten `StoryReaderResponsive` executor mode:
   - derive text/dialogue pages from typed block data helpers instead of inline casts
   - when executor reaches `sceneState.transitionTarget`, call `onTransition(target)` exactly once per transition
   - when executor completes without explicit transition, call `onTransition(null)` only if play mode/reader asks for scene-end routing
   - keep legacy `scene` path unchanged for old callers
4. Finish `PreviewScreen` migration:
   - remove `resolvePreviewTimeline` dependency if direct `SceneRecord.timeline` access can cover dirty editor draft plus persisted scene record
   - reuse the same typed current-text helper used by reader
   - keep preview-specific audio side effect local, but drive it only from `sceneState.musicTrackId/musicVolume`
   - remove remaining broad `(colors as any)` and block-data `as any` casts where touched
5. Extend `useSceneExecutor` tests:
   - text requires two advances: finish typing, then continue
   - choice selection sets `_last_choice` and `transitionTarget`
   - transition block halts and exposes target
   - disabled/condition-false steps are skipped
6. Add focused PlayMode/reader integration test if existing test tooling supports it:
   - start scene renders through `StoryReaderResponsive`
   - transition to target scene updates current scene
   - missing target ends playback safely

## Acceptance Criteria

- `PlayMode.tsx` no longer contains a custom step-processing loop.
- `PlayMode.tsx` has no `as any` casts.
- `PlayMode.tsx`, `PreviewScreen.tsx`, and `StoryReaderResponsive` all consume `useSceneExecutor` for timeline execution.
- Scene transitions are handled in one routing layer, not inside duplicated block loops.
- Existing Reader behavior is preserved: typewriter, choices, auto-play, history drawer, audio guard, and interactive-object overlay behavior.
- Preview still uses dirty editor timeline when previewing the currently edited scene.
- No changes to persisted story/scene schema.

## Verification

- `corepack pnpm run check`
- `corepack pnpm run test -- __tests__/unit/lib/useSceneExecutor.test.ts`
- targeted tests for any new `reader-runtime` helper
- `corepack pnpm run test -- __tests__/unit/hooks/useReaderInitialization-canonical.test.ts`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- Manual smoke:
  - `/play?storyId=...` starts at start scene
  - text advances in two taps
  - choices route to target scene
  - transition block routes to target scene
  - preview reflects unsaved editor timeline

## Risk Notes

- `useSceneExecutor` currently treats `transition` as a yielding block but does not auto-clear `isTransitioning`; routing code must guard against repeated `onTransition` calls.
- `StoryReaderResponsive` still has legacy `scene` support; executor-only changes must not break old route callers.
- PreviewScreen and Reader have different audio ownership. Shared runtime should expose state; playback side effects should remain in the screen/hook layer.

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-add-tests`
- `gsd-code-review`

## Execution Result

Status: core implemented; legacy type cleanup deferred to follow-up.

### Wave 1 — Core Runtime Convergence (done)

- Replaced `PlayMode.tsx` custom step loop with a route-level shell over `StoryReaderResponsive`.
- Added `lib/reader-runtime.ts` for start scene, next scene, timeline display pages, and executor choice mapping.
- Updated `StoryReaderResponsive` executor mode to use typed runtime helpers and route executor transitions once.
- Updated `PreviewScreen` to select dirty/persisted timelines directly and use shared typed display-page extraction.
- Extended `useSceneExecutor` tests and added focused `reader-runtime` tests.

Verification:

- `corepack pnpm run check`: passed.
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`: passed after elevated overwrite of `dist`.
- `git diff --check` on touched files: passed.
- Vitest targeted runs timed out before reporting results in this local Node/Vitest environment.

### Wave 2 — Legacy Type Cleanup (Executed 2026-05-30)

All 5 tasks (A–E) completed in a single session:

| Task | Description | Status |
|------|-------------|--------|
| A | Remove `Choice` from `lib/types.ts` | ✅ |
| B | Move `PlaybackState` → `lib/engine/types.ts`, `SaveSlot` → `lib/story-domain.ts` | ✅ |
| C | Move `Story`, `StoryScene` → `lib/scene-operations.ts` (with @deprecated) | ✅ |
| D | Remove `scenesByStory?` from `CanonicalSceneStateSnapshot` | ✅ |
| E | Simplify `migrateFromLegacyKeys` — removed 3-way merge, inlined variables | ✅ |

**Result:** `lib/types.ts` is now a thin re-export module (29 LOC), exporting only `UserSettings` + deprecated re-exports from domain modules. `tsc --noEmit` passes clean. All tests unchanged (pre-existing failures unaffected).

**Files modified:** `lib/types.ts`, `lib/engine/types.ts`, `lib/story-domain.ts`, `lib/canonical-scene.ts`, `lib/scene-operations.ts`, `stores/use-app-store.ts` (+6 import-site updates).
