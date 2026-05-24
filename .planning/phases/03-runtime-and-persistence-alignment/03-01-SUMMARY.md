# 03-01 Summary

## Status

- Completed

## Delivered

- Added `lib/runtime-story.ts` as the centralized canonical-first helper layer for runtime scene/story snapshots and preview timeline resolution
- Updated `lib/story-hooks.ts` to reconstruct runtime-facing stories through `runtime-story` instead of a separate story reconstruction path
- Updated `components/editor/PreviewScreen.tsx` so preview reads persisted canonical timeline data first and falls back to in-memory editor draft only when the same scene has unsaved changes
- Added regression coverage in `__tests__/unit/lib/runtime-story.test.ts` for canonical-first runtime scene/story snapshots and explicit preview draft fallback

## Verification

- `pnpm test -- __tests__/unit/lib/runtime-story.test.ts __tests__/unit/lib/story-hooks-canonical-scene.test.ts`
  - Passed

## Notes

- Preview no longer depends solely on `useEditorStore.timeline` for persisted scenes.
- Legacy `StoryScene` remains an explicit fallback path when canonical `SceneRecord` data is missing.
