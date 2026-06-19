# Wave 4 Summary

Status: completed, check passed.

## Completed

- Added production Plate entrypoint:
  - `components/editor/plate/PlateSceneEditor.tsx`
  - `components/editor/plate/PlateSceneEditor.web.tsx`
  - `components/editor/plate/PlateSceneEditor.native.tsx`
- Connected `/document-editor` to `PlateSceneEditor`.
- Moved route-level conversion out of `app/document-editor.tsx`.
- Kept the existing `DocumentSceneEditor + PlateWebViewEditor` shell as the production baseline.
- Added Plate module scaffolding:
  - `commands/index.ts`
  - `elements/index.ts`
  - `plugins/index.ts`
  - `character-colors.ts`
- Preserved canonical save contract:
  - route receives `SceneRecord[]`
  - Plate module owns `SceneRecord <-> PlateDocumentScene` conversion
  - no separate Plate JSON persistence path was added

## Runtime Decision

Web and native both continue through the existing `PlateWebViewEditor` bridge for now.

Direct `platejs/react` remains a valid future implementation detail, but Wave 4 did not replace the working bridge because the current bridge now has serializer coverage and works for both web/native with one document shape.

## Files Changed

- `app/document-editor.tsx`
- `components/document-editor/DocumentSceneEditor.tsx`
- `components/editor/index.ts`
- `components/editor/plate/PlateSceneEditor.tsx`
- `components/editor/plate/PlateSceneEditor.web.tsx`
- `components/editor/plate/PlateSceneEditor.native.tsx`
- `components/editor/plate/commands/index.ts`
- `components/editor/plate/elements/index.ts`
- `components/editor/plate/plugins/index.ts`
- `components/editor/plate/character-colors.ts`

## Verification

Passed:

```text
corepack pnpm run test __tests__/unit/editor/plate-scene-roundtrip.test.ts __tests__/unit/editor/preview-source.test.ts __tests__/unit/lib/document-editor.test.ts
```

Result: 3 test files passed, 22 tests passed

Passed:

```text
corepack pnpm run check:editor-boundaries
```

Passed:

```text
rg -n "DocumentSceneEditor|PlateSceneEditor|sceneRecordToDocumentScene|saveDocumentSceneToRecord" app/document-editor.tsx components/editor/plate components/document-editor/DocumentSceneEditor.tsx
```

Result confirms `/document-editor` imports `PlateSceneEditor`, while conversion lives under `components/editor/plate/serializers`.

## Notes For Wave 5

Docs should now state that Plate is the only active scene editing system, with legacy Lego UI isolated under `components/editor-legacy`.
