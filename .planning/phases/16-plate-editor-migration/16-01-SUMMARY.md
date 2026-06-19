# Wave 1 Summary

Status: completed, check passed.

## Completed

- Added the canonical Plate serializer boundary under `components/editor/plate`.
- Kept `DocumentScene` as the current Plate document compatibility shape.
- Added targeted roundtrip coverage for `SceneRecord -> Plate document -> SceneRecord`.
- Fixed technical block data loss in the current bridge path.
- Preserved canonical `TimelineStep` payloads through `sourceStep` for text, dialogue, and choice blocks.
- Preserved unchanged WebView/iframe block payloads during embedded HTML serialization.

## Key Changes

- `DocumentBlock` can now carry `sourceStep?: TimelineStep`.
- `sceneRecordToDocumentScene` stores `sourceStep` on text/dialogue/choice blocks.
- `documentSceneToTimeline` updates editable fields while preserving:
  - `step.id`
  - `blockType`
  - `collapsed`
  - `enabled`
  - `conditions`
  - full source `data`
- `normalizePlateDocumentScene` no longer replaces a valid technical `step` with a default step.
- `embedded-html` returns original block payloads for unchanged existing blocks instead of serializing technical blocks as `step: null`.

## Files Changed

- `lib/document-editor/types.ts`
- `lib/document-editor/document-scene.ts`
- `lib/vn-plate-editor/scene-normalizer.ts`
- `lib/vn-plate-editor/embedded-html.ts`
- `components/editor/plate/types.ts`
- `components/editor/plate/serializers/scene-to-plate.ts`
- `components/editor/plate/serializers/plate-to-scene.ts`
- `components/editor/plate/commands/step-validation.ts`
- `__tests__/unit/editor/plate-scene-roundtrip.test.ts`

## Verification

Passed:

```text
corepack pnpm run test __tests__/unit/editor/plate-scene-roundtrip.test.ts
```

Result: 4 tests passed

Follow-up (document-editor test correction):

```text
corepack pnpm run test __tests__/unit/lib/document-editor.test.ts
```

Result: 16 passed — test expectation updated to reflect the intentional trailing empty text block used as the editor typing target.

## Notes For Wave 2

Serializer contract is covered by passing tests. Wave 2 can proceed.
