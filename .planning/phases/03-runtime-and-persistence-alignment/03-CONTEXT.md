# Phase 3: Runtime and Persistence Alignment - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Source:** Synthesized from `.planning` artifacts, Phase 1-2 summaries and direct code inspection

<domain>
## Phase Boundary

Ця фаза узгоджує persisted data, preview, reader, autosave і current story reconstruction навколо канонічної scene model.

Deliverables for this phase:
- runtime-facing helper layer, який читає canonical scenes first
- preview path, який працює не лише з in-memory editor draft, а й з persisted canonical scenes
- save/load/autosave path, який не залежить лише від `scenesByStory`
- current story reconstruction і reader initialization, які коректно працюють для canonical persisted stories

Out of boundary for this phase:
- SceneManager CRUD cleanup і graph operations
- StoryFlow synchronization і connection editing
- legacy code deletion або public docs cleanup
- глобальний typed-route cleanup, якщо він не блокує конкретний runtime/persistence task

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- `SceneRecord + TimelineStep` залишається канонічним persisted contract.
- Runtime-facing compatibility layer має бути централізованою, а не розкиданою між reader, autosave, preview і store methods.
- `PreviewScreen` більше не має покладатися тільки на `useEditorStore.timeline`, якщо потрібно preview вже збереженої canonical сцени.
- `saveGame`, `loadGame` і autosave мають працювати через один узгоджений story/runtime snapshot path.
- Legacy persisted data має читатися через контрольований fallback або migration helper, але новий code path має бути canonical-first.

### Claude's Discretion
- Точне розбиття helper modules між runtime snapshot, preview snapshot і save-slot support
- Чи робити adapter окремими pure функціями чи одним consolidated runtime helper модулем
- Мінімальний, але достатній набір focused tests для preview/reader/save-load alignment

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` - Phase 3 goal, scope and success criteria
- `.planning/REQUIREMENTS.md` - `DATA-02`, `DATA-03`, `PLAY-01`, `PLAY-02`, `PLAY-03`
- `.planning/STATE.md` - current project state
- `.planning/phases/01-canonical-scene-model/01-01-SUMMARY.md`
- `.planning/phases/01-canonical-scene-model/01-02-SUMMARY.md`
- `.planning/phases/02-editor-load-save-stability/02-01-SUMMARY.md`
- `.planning/phases/02-editor-load-save-stability/02-02-SUMMARY.md`

### Existing Canonical Layer
- `lib/canonical-scene.ts`
- `lib/scene-record-adapter.ts`
- `lib/story-state.ts`
- `lib/editor-scene-draft.ts`
- `stores/use-app-store.ts`

### Critical Runtime/Persistence Files
- `lib/story-hooks.ts`
- `app/reader.tsx`
- `hooks/useReaderInitialization.ts`
- `hooks/useAutoSave.ts`
- `components/editor/PreviewScreen.tsx`
- `stores/use-app-store.ts`

</canonical_refs>

<specifics>
## Current Problems Confirmed In Code

- `PreviewScreen` читає тільки `useEditorStore.timeline`, тому preview persisted canonical scene без попередньо завантаженого draft state не є надійним.
- `saveGame`, `loadGame` і `StoryDomain.createSaveSlot()` усе ще працюють через compatibility `Story` та `StoryScene` reconstructed path.
- `migrateFromLegacyKeys()` відновлює `scenesByStory`, але не дає явного migration story для `sceneRecordsByStory`.
- `useReaderInitialization()` і `reader.tsx` залежать від compatibility story structure, хоч canonical-first reconstruction вже частково існує.
- Current story reconstruction уже canonical-first, але persistence/runtime layer ще не використовує це як єдиний contract для save/load/preview/read flows.

</specifics>

<deferred>
## Deferred Ideas

- SceneManager, StoryFlow і scene-level graph operations залишаються в Phase 4.
- Cleanup legacy editor / Lego code залишається в Phase 5.
- Public documentation cleanup і architecture-reference refresh залишаються Phase 5 work.

</deferred>

---

*Phase: 03-runtime-and-persistence-alignment*
*Context gathered: 2026-05-24 via planning synthesis and code inspection*
