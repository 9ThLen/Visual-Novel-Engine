# 01-01 Summary

## Status

- Completed

## Delivered

- Added canonical contract doc in `docs/SCENE-MODEL-CONTRACT.md`
- Marked `StoryScene` and `Story` as compatibility-only in `lib/types.ts`
- Clarified canonical aliases in `lib/engine/types.ts`
- Added centralized compatibility adapter in `lib/scene-record-adapter.ts`
- Added pure canonical selector/update helpers in `lib/canonical-scene.ts`
- Exposed canonical store selectors and metadata-preserving update helper from `stores/use-app-store.ts`

## Verification

- `pnpm test -- __tests__/unit/lib/scene-record-adapter.test.ts __tests__/unit/stores/use-app-store-canonical.test.ts`
  - Passed

## Notes

- Store-facing canonical helpers now read `sceneRecordsByStory` first and fall back to compatibility conversion only when needed.
- Metadata-preserving update logic is available for later editor save/load repair in Phase 2.
- Full `pnpm check` remains blocked by pre-existing typed-route errors outside this plan's scope.
