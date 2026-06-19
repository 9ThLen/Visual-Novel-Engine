# Wave 2 Summary

Status: completed, check passed.

## Completed

- Removed active `useEditorStore` dependency from `PreviewScreen`.
- Removed `useEditorStore.getState().setScene(...)` draft hydration from `SceneManager`.
- Confirmed `app/document-editor.tsx` already owns `SceneRecord -> DocumentScene` conversion through `useAppStore`.
- Added `components/editor/preview-source.ts` as a pure persisted timeline selector.
- Added regression tests for preview source-of-truth behavior.

## Files Changed

- `components/editor/PreviewScreen.tsx`
- `components/editor/SceneManager.tsx`
- `components/editor/preview-source.ts`
- `__tests__/unit/editor/preview-source.test.ts`

## Verification

Passed:

```text
corepack pnpm run test __tests__/unit/editor/preview-source.test.ts
```

Result: 2 tests passed

Passed:

```text
corepack pnpm run test __tests__/unit/editor/preview-source.test.ts __tests__/unit/lib/document-editor.test.ts
```

Result: 2 test files passed, 18 tests passed

Passed:

```text
rg -n "useEditorStore" components/editor/PreviewScreen.tsx components/editor/SceneManager.tsx app/document-editor.tsx
```

Result: no matches.

## Notes For Wave 3

Active preview/navigation is now cut away from Lego draft state. Remaining `useEditorStore` imports are legacy/store tests and `SceneComposer`, which Wave 3 must isolate under the active/legacy boundary.
