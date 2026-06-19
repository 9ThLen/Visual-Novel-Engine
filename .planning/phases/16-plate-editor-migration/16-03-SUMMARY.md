# Wave 3 Summary

Status: completed, check passed.

## Completed

- Moved confirmed Lego editor UI into `components/editor-legacy/`.
- Kept active/shared files in `components/editor/`:
  - `PreviewScreen.tsx`
  - `SceneManager.tsx`
  - `PlayMode.tsx`
  - `SceneSelector.tsx`
  - `StoryManuscriptScreen.tsx`
  - `manuscript/*`
  - `modals/AssetPicker.tsx`
  - `plate/*`
- Kept `AssetPicker` active because `DocumentTechnicalPropertiesPanel` imports it.
- Kept `SceneSelector` active because `SceneManager` and legacy composer still use it as shared UI.
- Kept `PlayMode` active because `app/play.tsx` imports it.
- Kept `lib/editor-scene-draft.ts` active because `SceneManager` uses it to create `SceneRecord`s.
- Removed Lego exports from `components/editor/index.ts`.
- Added `tools/check-editor-boundaries.ps1`.
- Added `check:editor-boundaries` package script.

## Moved To Legacy

- `components/editor-legacy/SceneComposer.tsx`
- `components/editor-legacy/SceneComposerDesktop.tsx`
- `components/editor-legacy/SceneComposerPhone.tsx`
- `components/editor-legacy/TimelinePanel.tsx`
- `components/editor-legacy/BlockLibraryPanel.tsx`
- `components/editor-legacy/PropertiesPanel.tsx`
- `components/editor-legacy/properties/*`
- `components/editor-legacy/MiniPreview.tsx`
- `components/editor-legacy/useSceneComposerShortcuts.ts`

## Verification

Passed:

```text
corepack pnpm run check:editor-boundaries
```

Passed:

```text
rg -n "components/editor-legacy|SceneComposer|TimelinePanel|BlockLibraryPanel|PropertiesPanel|useEditorStore" app components/editor
```

Result: no matches.

Passed:

```text
corepack pnpm run test __tests__/unit/editor/plate-scene-roundtrip.test.ts __tests__/unit/editor/preview-source.test.ts __tests__/unit/lib/document-editor.test.ts
```

Result: 3 test files passed, 22 tests passed

## Notes For Wave 4

The active editor directory is now ready for `components/editor/plate` to become the production scene editor module. Legacy Lego UI remains available as reference only under `components/editor-legacy`.
