# Phase 16 Plan Review Fix

**Date:** 2026-06-18
**Input:** External model review of Phase 16 GSD plan
**Result:** Accepted major corrections; updated CONTEXT, PLAN 00/01/02/04/05, and ROADMAP.

## Accepted Corrections

1. Existing Document/Plate bridge is real migration baseline.
   - Updated context to state current active route already uses
     `DocumentSceneEditor -> PlateWebViewEditor`.
   - Updated Wave 4 to extract/evolve existing shell instead of greenfield rewrite.

2. Installed Plate version must drive research.
   - Updated Wave 0 to start from installed `platejs@53.1.2`.
   - Decision file must list whether additional `@platejs/*` packages are needed.

3. `app/document-editor.tsx` already owns canonical loading.
   - Updated Wave 2: preserve this invariant instead of treating it as missing work.
   - Remaining active `useEditorStore` targets are `PreviewScreen` and `SceneManager`.

4. Serializer work must start from current bridge.
   - Updated Wave 1 to test/harden `sceneRecordToDocumentScene`,
     `saveDocumentSceneToRecord`, `documentSceneToTimeline`, and
     `normalizePlateDocumentScene` before introducing new wrappers.

5. Do not deprecate reused bridge files.
   - Updated Wave 5 to mark only superseded files as deprecated.
   - Header/sidebar/inspector can be reused or moved into `components/editor/plate`.

## Remaining Locked Direction

- `SceneRecord + TimelineStep` remains the only persisted scene contract.
- First serializer test still verifies:
  `background(assetId: "bg_forest", transition: "dissolve", duration: 1000)`
  survives roundtrip unchanged.
- Legacy Lego UI still moves out of active editor paths.
- Active routes must not import legacy editor UI or `useEditorStore`.

## Follow-up Recommendations Applied

1. `16-02-PLAN.md` path typo was checked.
   - No `teststs__` typo exists; the file already uses
     `__tests__/unit/editor/preview-source.test.ts`.

2. Wave 0 now asks concrete Plate research questions.
   - Includes installed/declarative version check for `platejs@53.1.2`.
   - Requires answers for React APIs, direct web use, minimum package set,
     custom elements, React Native support, and expected node shape.

3. Wave 1 now has an explicit type decision branch.
   - Re-export `DocumentScene` types if enough.
   - Create new Plate node types if required by Plate.
   - Add mapping layer only if both shapes are necessary.

4. Wave 3 now has a file classification gate.
   - Confirmed `hooks/useSceneComposerShortcuts.ts` exists.
   - `SceneSelector`, `PlayMode`, `AssetPicker`, and `lib/editor-scene-draft.ts`
     are treated as active/shared unless replacement imports exist.
   - Legacy move list is limited to confirmed Lego composer UI.

5. Wave 4 now ties commands/elements to existing code.
   - Commands start from `lib/document-editor/commands.ts`.
   - Commands create steps through `lib/engine/event-factory.ts`.
   - Element requirements explicitly preserve full `TimelineStep` payloads.

6. Rollback sections were added to Waves 0-5.
