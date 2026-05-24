# Phase 4: Story Flow and Scene Operations - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Source:** Synthesized from `.planning` artifacts, Phase 1-3 summaries and direct code inspection

<domain>
## Phase Boundary

Ця фаза стабілізує scene-level CRUD, start-scene semantics, StoryFlow synchronization і connection operations навколо канонічної scene model.

Deliverables for this phase:
- canonical scene operation action layer для create/duplicate/delete/start/connect flows
- `SceneManager`, який відкриває та видаляє persisted canonical scenes без direct `setState` мутацій
- `StoryFlowScreen`, який відображає актуальні scene records і persisted positions після reload/navigation
- connection CRUD path з cleanup orphaned links і port-aware semantics
- focused regression tests для scene operations і graph synchronization

Out of boundary for this phase:
- повний redesign graph UI, minimap, context menu або drag-and-drop polish beyond reliability fixes
- legacy cleanup і public docs refresh
- глобальний Expo Router typed-route cleanup, якщо він не блокує конкретний task цієї фази
- розширений runtime branching redesign beyond keeping start-scene metadata and canonical connections consistent

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- `SceneRecord + TimelineStep` залишається канонічним persisted contract для SceneManager, StoryFlow і scene operations.
- Store action layer, а не компоненти, відповідає за delete cleanup, start-scene synchronization і connection invariants.
- `storiesMetadata.startSceneId` є canonical source of truth для стартової сцени; `sceneRecord.isStart` лишається synchronized flag, а не окремим джерелом правди.
- `StoryFlowScreen` має читати derived graph state з canonical records, а не жити на довгоживучому локальному snapshot без sync.
- Port-aware connections (`outputPort`, `label`, target) мають змінюватися через узгоджений API, а не через ad hoc component state.

### Claude's Discretion
- Чи винести graph derivation у новий pure helper (`story-flow-graph.ts`) або обмежитися локальними selectors
- Чи достатньо narrow refactor у `SceneSelector`, чи потрібно розвести template/browser і connection-picker semantics
- Мінімальний, але достатній набір focused tests для CRUD cleanup, drag persistence і connection sync

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` - Phase 4 goal, scope and success criteria
- `.planning/REQUIREMENTS.md` - `EDIT-04`, `DATA-04`, `FLOW-01`, `FLOW-02`, `FLOW-03`, `FLOW-04`
- `.planning/STATE.md` - current project state after Phase 3 execution
- `.planning/phases/01-canonical-scene-model/01-01-SUMMARY.md`
- `.planning/phases/01-canonical-scene-model/01-02-SUMMARY.md`
- `.planning/phases/02-editor-load-save-stability/02-01-SUMMARY.md`
- `.planning/phases/02-editor-load-save-stability/02-02-SUMMARY.md`
- `.planning/phases/03-runtime-and-persistence-alignment/03-01-SUMMARY.md`
- `.planning/phases/03-runtime-and-persistence-alignment/03-02-SUMMARY.md`

### Existing Canonical Layer
- `lib/canonical-scene.ts`
- `lib/scene-record-adapter.ts`
- `lib/editor-scene-draft.ts`
- `lib/runtime-story.ts`
- `stores/use-app-store.ts`

### Critical Phase 4 Files
- `components/editor/SceneManager.tsx`
- `components/editor/StoryFlowScreen.tsx`
- `components/editor/SceneSelector.tsx`
- `components/editor/SceneComposer.tsx`
- `hooks/useSceneEditorActions.ts`
- `hooks/useReaderInitialization.ts`
- `stores/use-app-store.ts`

</canonical_refs>

<specifics>
## Current Problems Confirmed In Code

- `SceneManager` delete path використовує direct `useAppStore.setState(...)` замість canonical store action, тому не гарантує cleanup `sceneCount`, `startSceneId` та inbound/outbound connections.
- Store не має явного `deleteSceneRecord` action для canonical records; є лише legacy-oriented `deleteScene`.
- Створення нової canonical сцени в manager/flow використовує ad hoc record assembly і місцями лишає `sceneState: {} as any`, що розходиться з already stabilized editor helpers.
- `saveSceneRecord` уже працює canonical-first, але start-scene metadata не синхронізується достатньо жорстко для first-scene/create/delete flows.
- `StoryFlowScreen` ініціалізує локальний `nodes` snapshot один раз і не синхронізує його з store, тому після reload/navigation UI може показувати stale names, connections, positions і `isStart`.
- `flowX || 100` / `flowY || 100` ламають валідні координати `0`, а drag persistence ризикує писати не фінальні координати через stale closure.
- Connection UI зараз додає links майже тільки як `outputPort: 'next'`, не дає повноцінного delete/edit flow і не використовує port-aware removal semantics.
- `removeSceneConnection` у store занадто грубий для кількох links у той самий target, бо не враховує `outputPort`.
- `SceneSelector` має змішану семантику template browser / connect mode, а `SceneComposer` ще не закриває реальний connection-edit path.
- Reader init уже canonical-first загалом, але стартова сцена все ще залежить від коректності `storiesMetadata.startSceneId`; delete/start reassignment мають не ламати цей контракт.

</specifics>

<deferred>
## Deferred Ideas

- Повний graph UX refresh з minimap, context menus, gestures polish і advanced edge routing лишається поза межами цієї фази.
- Runtime branching parity для всіх нестандартних `outputPort` може вимагати окремого follow-up після стабілізації scene operations.
- Legacy cleanup у `useSceneEditorActions` і суміжних compatibility layers завершується в Phase 5, якщо для цього не потрібно мінімального bridge у Phase 4.

</deferred>

---

*Phase: 04-story-flow-and-scene-operations*
*Context gathered: 2026-05-24 via planning synthesis and code inspection*
