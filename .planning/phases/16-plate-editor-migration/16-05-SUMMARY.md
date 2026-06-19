# Wave 5 Summary

Status: completed, check passed.

## Completed

- Confirmed `/document-editor` uses `PlateSceneEditor`.
- Updated project docs/rules from Lego-only to Plate-only active editing.
- Documented active editor boundary in `docs/SCENE-MODEL-CONTRACT.md`.
- Did not add `@deprecated` headers to `components/document-editor`, `components/vn-plate-editor`, `lib/document-editor`, or `lib/vn-plate-editor` because those modules are still active inside `PlateSceneEditor` and the current WebView bridge.

## Docs Updated

- `README.md`
- `AGENTS.md`
- `docs/SCENE-MODEL-CONTRACT.md`

## Verification

Passed:

```text
rg -n "Use Lego|Lego .*єдина|Lego as the only|Використовуй тільки Lego" README.md AGENTS.md docs/SCENE-MODEL-CONTRACT.md
```

Result: no matches.

Passed:

```text
corepack pnpm run check:editor-boundaries
```

Passed:

```text
corepack pnpm run test __tests__/unit/editor/plate-scene-roundtrip.test.ts __tests__/unit/editor/preview-source.test.ts __tests__/unit/lib/document-editor.test.ts
```

Result: 3 test files passed, 22 tests passed

## Final State

- Active scene editor: `components/editor/plate/PlateSceneEditor.tsx`
- Legacy Lego UI: `components/editor-legacy/`
- Canonical data contract: `SceneRecord + TimelineStep`
- Boundary command: `pnpm check:editor-boundaries`
