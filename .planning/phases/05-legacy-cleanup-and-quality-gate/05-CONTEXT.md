# Phase 5: Legacy Cleanup and Quality Gate - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Source:** Synthesized from `.planning` artifacts, Phase 1-4 summaries and direct code/documentation audits

<domain>
## Phase Boundary

Ця фаза завершує stabilization milestone: ізолює або прибирає legacy production dependencies, оновлює docs до фактичної canonical architecture і закріплює critical path через focused tests, manual QA та фінальний verification gate.

Deliverables for this phase:
- canonical-first або explicitly isolated compatibility boundary для remaining legacy scene flows
- production creation/load/export paths, які більше не покладаються на silent legacy fallback як на звичайний steady-state path
- актуалізовані `README`, architecture/planning docs і historical notes boundaries
- critical-path verification pack: targeted tests, manual QA matrix, final check baseline

Out of boundary for this phase:
- нові product features або graph UX redesign
- великий data-format migration beyond controlled compatibility isolation
- broad platform/performance work, не потрібний для stabilization gate
- безконтрольне видалення legacy коду, який ще підтверджено потрібний для import/backward compatibility

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- `SceneRecord + TimelineStep` залишається canonical production contract для editor, preview, runtime і story flow.
- `Story` / `StoryScene` можуть залишитись тільки як explicit compatibility/import-export layer, а не як головний runtime/editor contract.
- Silent legacy fallback у production selectors/runtime helpers має бути або видалений зі steady-state path, або чітко ізольований та маркований як compatibility-only.
- Документація повинна описувати вже реалізовану architecture, а не історичні або planned layers.
- Phase 5 має завершитись не лише code cleanup, а й verification artifacts: targeted automated coverage, manual QA pack і максимально чистий `pnpm check` baseline.

### Claude's Discretion
- Який мінімальний compatibility surface треба зберегти для legacy import/export без повернення dual-source architecture
- Чи розбити cleanup між `canonical-scene.ts`, `runtime-story.ts` і `story-hooks.ts` повністю, чи залишити narrow compatibility adapters з explicit naming
- Який саме набір component/integration tests дає найбільший signal на critical path без тестового шуму
- Чи виправляти typed-route blockers directly у цій фазі, якщо вони залишаються останнім бар'єром до clean typecheck

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/01-canonical-scene-model/01-01-SUMMARY.md`
- `.planning/phases/01-canonical-scene-model/01-02-SUMMARY.md`
- `.planning/phases/02-editor-load-save-stability/02-01-SUMMARY.md`
- `.planning/phases/02-editor-load-save-stability/02-02-SUMMARY.md`
- `.planning/phases/03-runtime-and-persistence-alignment/03-01-SUMMARY.md`
- `.planning/phases/03-runtime-and-persistence-alignment/03-02-SUMMARY.md`
- `.planning/phases/04-story-flow-and-scene-operations/04-01-SUMMARY.md`
- `.planning/phases/04-story-flow-and-scene-operations/04-02-SUMMARY.md`

### Canonical Implementation Layer
- `stores/use-app-store.ts`
- `lib/canonical-scene.ts`
- `lib/runtime-story.ts`
- `lib/scene-operations.ts`
- `lib/story-flow-graph.ts`
- `lib/story-hooks.ts`

### Phase 5 Candidate Files
- `app/editor.tsx`
- `hooks/useReaderInitialization.ts`
- `hooks/useSceneEditorActions.ts`
- `stores/use-lego-store.ts`
- `components/lego-editor/**`
- `README.md`
- `wiki/architecture-reference.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`

</canonical_refs>

<specifics>
## Current Problems Confirmed In Code

- `use-app-store.ts` досі тримає `sceneRecordsByStory` і `scenesByStory` одночасно, а steady-state selectors/runtime helpers досі можуть робити silent fallback на legacy scene shape.
- `runtime-story.ts` і `canonical-scene.ts` ще підтримують production-time fallback на legacy `StoryScene`, що маскує incomplete canonical migration і тримає dual-source architecture живою.
- `story-hooks.ts` і суміжні import/export flows продовжують легалізувати compatibility `Story` shape як майже звичайний app-facing contract.
- `app/editor.tsx` досі створює нову історію через legacy `Story` shape, навіть після стабілізації canonical scene operations.
- Є dormant Lego/editor leftovers (`useSceneEditorActions.ts`, `use-lego-store.ts`, `components/lego-editor/**`), які потрібно або явно ізолювати як non-production, або видалити після reachability check.
- README і `wiki/architecture-reference.md` серйозно відстають від поточного Zustand + canonical scene/runtime/story-flow architecture.
- `.planning/PROJECT.md` і `.planning/REQUIREMENTS.md` ще не відображають, що Phases 1-4 фактично виконані; traceability/status зараз бреше.
- У phase artifacts немає окремого manual verification pack; summaries фіксують команди, але не проходження ручних сценаріїв по open/edit/save/reopen/play/save-load/story-flow.
- `pnpm check` усе ще блокується Expo Router typed-route errors (`app/editor.tsx`, `components/editor/SceneManager.tsx`, `components/editor/StoryFlowScreen.tsx`), тож final quality gate поки не закритий.

</specifics>

<deferred>
## Deferred Ideas

- Deep import/export redesign beyond compatibility isolation
- Advanced graph UX improvements
- Large-scale historical wiki cleanup outside files that still mislead current development
- Performance tuning and large-story profiling

</deferred>

---

*Phase: 05-legacy-cleanup-and-quality-gate*
*Context gathered: 2026-05-24 via planning synthesis and focused audits*
