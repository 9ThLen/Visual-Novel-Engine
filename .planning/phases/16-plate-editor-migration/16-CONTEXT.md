# Phase 16: Plate Editor Migration - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning
**Source:** Chat discussion + local code inspection

<domain>

## Phase Boundary

Replace the active scene editing system with Plate while preserving the canonical
runtime/persistence contract: `SceneRecord + TimelineStep`.

In scope:
- Decide the exact Plate runtime/package architecture before serializer work,
  using the installed `platejs` version as the starting point.
- Create a backup migration branch as the first execution action.
- Make serializer roundtrip tests pass before UI replacement.
- Stop remaining active screens from using Lego editor state (`useEditorStore`).
- Split active Plate editor, legacy Lego editor, and manuscript editor.
- Evolve the current `/document-editor` Plate bridge into the active Plate scene
  editor, reusing existing header/sidebar/inspector UI where it is sound.
- Mark only superseded document-editor/vn-plate bridge modules as deprecated
  compatibility/reference code after replacement.
- Update README/AGENTS and add import boundaries.

Out of scope:
- Rewriting `lib/engine/`, `stores/use-app-store.ts`, reader runtime, assets, or persistence.
- Replacing `SceneRecord` or `TimelineStep` with Plate JSON as persisted data.
- Removing legacy code before the new active path is verified.

</domain>

<decisions>

## Locked Decisions

### Canonical Data
- `SceneRecord + TimelineStep` remains the only persisted scene format.
- Plate is an editor surface over canonical scene records, not a separate saved world.
- Serializers must preserve every `TimelineStep.data` payload.

### Architecture
- Step 0 must decide the Plate library and runtime model before serializer shape is finalized.
- `package.json` declares `platejs`; local install resolves to `platejs@53.1.2`.
- Expected direction: web uses real Plate APIs from the installed package set;
  native uses a WebView bridge running the same Plate document/runtime if direct
  React Native support is not viable.
- Current active route already uses `DocumentSceneEditor -> PlateWebViewEditor`.
  That bridge is the migration baseline, not something to ignore. Its current
  embedded `contenteditable` implementation is temporary only if Wave 0 confirms
  real Plate can replace it safely.

### Safety
- Execution must start from a backup branch: `codex/plate-editor-migration`.
- The first passing implementation test must verify no technical block data loss for a real background payload.
- `useEditorStore` must leave active editor/preview/navigation paths.
- `app/document-editor.tsx` already loads canonical scene records from
  `useAppStore`; keep that invariant and do not reintroduce draft hydration.

### Active/Legacy Split
- `components/editor/plate/*` becomes the active scene editor.
- `components/editor/manuscript/*` remains active and must not break.
- Lego UI moves to `components/editor-legacy/*`.
- Active routes must not import `components/editor-legacy/*`.

### Deprecated Bridge
- `components/document-editor/*`, `components/vn-plate-editor/*`,
  `lib/document-editor/*`, and `lib/vn-plate-editor/*` are current migration
  baseline modules. Reuse or move the parts that remain active.
- Only modules superseded by `components/editor/plate/*` should be marked
  `@deprecated`; do not deprecate reused UI shell pieces just because they came
  from the bridge.

</decisions>

<canonical_refs>

## Canonical References

- `AGENTS.md` - project rules, Context7 requirement, editor-system rule to update.
- `README.md` - architecture and development rules to update.
- `docs/SCENE-MODEL-CONTRACT.md` - canonical data contract.
- `lib/engine/types.ts` - `SceneRecord`, `TimelineStep`, block payload types.
- `lib/engine/event-factory.ts` - default step creation.
- `stores/use-app-store.ts` - persisted app state and scene records.
- `stores/use-editor-store.ts` - legacy Lego draft state to remove from active paths.
- `app/document-editor.tsx` - current document editor route.
- `app/preview.tsx` - preview route.
- `components/editor/PreviewScreen.tsx` - currently reads `useEditorStore`.
- `components/editor/SceneManager.tsx` - currently writes `useEditorStore`.
- `components/document-editor/DocumentSceneEditor.tsx` - current bridge editor.
- `components/document-editor/DocumentEditorHeader.tsx` - reusable editor header.
- `components/document-editor/DocumentSceneSidebar.tsx` - reusable scene list.
- `components/document-editor/DocumentInspectorPanel.tsx` - reusable inspector.
- `lib/document-editor/document-scene.ts` - current `SceneRecord <-> DocumentScene` bridge and the first serializer baseline.
- `lib/document-scene-persistence.ts` - current save bridge.
- `components/vn-plate-editor/*` and `lib/vn-plate-editor/*` - current web/native editor bridge.
- `package.json` - installed `platejs` dependency and scripts.
- `__tests__/unit/lib/document-editor.test.ts` - current bridge serializer tests.

</canonical_refs>

<success_criteria>

- `codex/plate-editor-migration` branch exists before code changes.
- Plate library/runtime decision is written down before serializer implementation,
  including the installed `platejs` version and whether additional `@platejs/*`
  packages are required.
- Roundtrip tests prove real technical payloads survive unchanged.
- `PreviewScreen` and `SceneManager` no longer import or call `useEditorStore`.
- Active scene editing route renders the evolved Plate scene editor.
- `components/editor-legacy/*` exists and active app screens do not import it.
- README/AGENTS say Plate is the only scene editing system.
- ESLint or script boundary blocks legacy imports from active paths.
- `corepack pnpm run check` and targeted tests pass.

</success_criteria>
