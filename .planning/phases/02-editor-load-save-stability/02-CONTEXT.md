# Phase 2: Editor Load/Save Stability - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Source:** Synthesized from `.planning` artifacts, Phase 1 summaries and direct code inspection

<domain>
## Phase Boundary

Ця фаза ремонтує критичний editor lifecycle: `open -> edit -> save -> reopen`.

Deliverables for this phase:
- editor route reliably loads the persisted canonical scene into the editor draft
- editor draft state no longer resets a scene to an empty timeline on mount
- save flow preserves canonical metadata instead of rebuilding records from scratch
- regression tests protect load, edit, save and reopen behavior

Out of boundary for this phase:
- full reader/runtime alignment
- SceneManager CRUD cleanup and direct `setState` removal
- StoryFlow graph consistency and connections UI
- global Expo Router typed-route cleanup unless it blocks this phase directly

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- `SceneRecord + TimelineStep` stays the canonical scene source of truth.
- `SceneComposer` must load from canonical persisted data, not initialize itself to `[]` on every mount.
- Save operations must merge content into an existing canonical record and preserve metadata fields such as `connections`, `flowX`, `flowY`, `createdAt` and `isStart`.
- The editor route should not depend on SceneManager preloading `useEditorStore` state before navigation.
- Focused tests are required for editor draft hydration and metadata-preserving save behavior.

### Claude's Discretion
- Exact shape of any editor draft helper module or pure helper functions
- Whether to add store helpers or route-level helpers for scene hydration
- Whether a small adapter between canonical store and editor store is a function, hook or store action

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` - Phase 2 goal, scope and success criteria
- `.planning/REQUIREMENTS.md` - `EDIT-01`, `EDIT-02`, `EDIT-03`
- `.planning/STATE.md` - current project state
- `.planning/phases/01-canonical-scene-model/01-01-SUMMARY.md`
- `.planning/phases/01-canonical-scene-model/01-02-SUMMARY.md`

### Existing Canonical Layer
- `docs/SCENE-MODEL-CONTRACT.md`
- `lib/canonical-scene.ts`
- `lib/scene-record-adapter.ts`
- `lib/story-state.ts`
- `stores/use-app-store.ts`

### Critical Current Files
- `components/editor/SceneComposer.tsx`
- `stores/use-editor-store.ts`
- `app/scene-editor.tsx`
- `components/editor/PreviewScreen.tsx`

</canonical_refs>

<specifics>
## Current Problems Confirmed In Code

- `SceneComposer` unconditionally runs `setScene(sceneId, initialSceneName, [])` on mount, which destroys persisted timeline state for existing scenes.
- `handleSave()` in `SceneComposer` rebuilds a record with blank metadata and fresh timestamps instead of merging into the existing canonical record.
- `app/scene-editor.tsx` derives `initialSceneName` from `currentStory.scenes[sceneId].text`, which is not a safe canonical source for editor loading.
- `use-editor-store.ts` only exposes generic draft state actions; it has no explicit persisted-record hydration boundary.
- `SceneManager` currently preloads `useEditorStore` before navigation, but the route should become self-sufficient so direct links and reopen flows are reliable.

</specifics>

<deferred>
## Deferred Ideas

- SceneManager edit/open cleanup moves to Phase 4 except for compatibility reads needed by this phase.
- Preview/runtime unification moves to Phase 3.
- StoryFlow metadata editing and connections persistence remain out of scope here.
- Legacy cleanup and docs cleanup remain Phase 5 work.

</deferred>

---

*Phase: 02-editor-load-save-stability*
*Context gathered: 2026-05-24 via planning synthesis and code inspection*
