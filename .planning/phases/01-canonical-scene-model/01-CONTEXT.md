# Phase 1: Canonical Scene Model - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Source:** Synthesized from `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` and repository analysis

<domain>
## Phase Boundary

Ця фаза не додає нових користувацьких фіч. Вона фіксує єдину канонічну модель сцени і встановлює межу між канонічним scene data contract та legacy compatibility path.

Deliverables for this phase:
- визначений і зафіксований canonical scene contract
- store/actions/selectors, які працюють із цим contract як із джерелом правди
- compatibility layer для legacy `StoryScene`, де це ще потрібно
- story reconstruction layer, який більше не жорстко прив'язаний лише до `scenesByStory`

Out of boundary for this phase:
- повний ремонт `SceneComposer` save/load UX
- повне вирівнювання reader/preview/play flows
- завершення StoryFlow connect UX
- видалення всього legacy-коду

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- `SceneRecord + TimelineStep` є канонічною моделлю сцени для цього циклу рефакторингу.
- `StoryScene` залишається тільки як compatibility representation там, де це ще потрібно для перехідного періоду.
- Нові selector-і та store helpers мають читати канонічну модель першою, а не відновлювати її з legacy path постфактум.
- Міграція має бути incremental: спочатку adapter layer і selectors, потім ширше вирівнювання editor/runtime у наступних фазах.
- Existing user data не можна ламати; legacy scenes мають бути або прочитані, або адаптовані без ручного recovery.

### Claude's Discretion
- Назва і точне розташування adapter/helper файлів
- Конкретна форма selector API і helper function names
- Мінімальний обсяг тестового покриття, достатній для страхування critical path фази

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/PROJECT.md` - загальний контекст, constraints, core value
- `.planning/REQUIREMENTS.md` - Phase 1 requirement IDs: `ARCH-01`, `ARCH-02`, `DATA-01`
- `.planning/ROADMAP.md` - Goal, success criteria і межі Phase 1
- `.planning/STATE.md` - поточний planning snapshot

### Current Source of Truth Candidates
- `stores/use-app-store.ts` - містить і `scenesByStory`, і `sceneRecordsByStory`
- `lib/story-hooks.ts` - current story reconstruction і story-facing selectors
- `lib/engine/types.ts` - нові scene/timeline типи
- `lib/types.ts` - legacy story/scene типи

### Impacted Consumers
- `components/editor/SceneComposer.tsx` - пише `SceneRecord`, важливий для сумісності контракту
- `app/reader.tsx` - reader path, який поки читає legacy story flow
- `hooks/useReaderInitialization.ts` - залежить від reconstruction logic

</canonical_refs>

<specifics>
## Specific Ideas

- Якщо потрібен adapter, він має бути явним і одностороннім: canonical -> compatibility, а не хаотичні перетворення в різних місцях коду.
- Якщо `sceneRecordsByStory` використовується як truth, save/update helpers повинні запобігати неявному dual-write поза контрольованим layer.
- План має уникати передчасного чіпання UI-heavy компонентів, крім випадків, коли це необхідно для контракту або selector boundary.

</specifics>

<deferred>
## Deferred Ideas

- Refactor `SceneComposer` lifecycle і merge-save logic повністю переноситься в Phase 2.
- Reader/playback unification переноситься в Phase 3.
- StoryFlow and SceneManager consistency переноситься в Phase 4.
- Public documentation cleanup переноситься в Phase 5.

</deferred>

---

*Phase: 01-canonical-scene-model*
*Context gathered: 2026-05-24 via synthesized planning context*
