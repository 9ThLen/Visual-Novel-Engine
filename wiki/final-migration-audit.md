# Final Migration Audit

Last updated: 2026-07-02

## Current Status

- Runtime and editor paths use canonical `SceneRecord + TimelineStep`.
- The old adapter files `scene-record-adapter.ts`, `runtime-story.ts`, and `canonical-scene.ts` are no longer part of the active codebase.
- `addStory` was removed from `useAppStore`; bundled demo sync now writes canonical payloads directly.
- `StorySceneExtended` was removed from `lib/audio-types.ts`.
- `hooks/use-story-state.ts` was removed; active code uses `useAppStore()` directly.
- Removed dead UI shells: `ReaderTransitions`, `SplashScreen`, `WebTopBar`, and `ShortcutHint`.
- Test-only diagnostic noise is suppressed through `shouldLogDevDiagnostics()`.
- Legacy `Story`, `StoryScene`, and `Choice` remain only for JSON import and legacy storage migration.

## Remaining Cleanup

| Area | Status | Why it remains |
|---|---|---|
| Legacy storage migration | Keep for now | Protects existing user data in old storage keys |
| `StoryValidator.validateStory` | Keep for now | Validates legacy imports and bundled story JSON |
| `Story` / `StoryScene` types | Keep for now | Migration/import boundary still consumes them |
| `asset-resolver` store import | Cleanup candidate | `lib` still imports a store wrapper for media-library lookup |

## Removal Rule

Delete compatibility code only after its runtime caller is gone and tests cover the replacement path. Do not keep deprecated code solely because older tests import it.
