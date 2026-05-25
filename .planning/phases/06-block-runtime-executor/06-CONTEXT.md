# Phase 6: Block Runtime Executor — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning
**Source:** Spike 001 validation, codebase audit, AGENTS.md learnings

<domain>
## Phase Boundary

Ця фаза замінює lossy `sceneRecordToStoryScene` adapter на block-by-block `useSceneExecutor` hook, який виконує всі 12 типів блоків напряму з `TimelineStep[]`.

Deliverables:
- `useSceneExecutor` hook з block-by-block state machine (yielding/non-yielding split)
- Condition evaluator (`conditionsMet()`) для conditional blocks
- Оновлений reader, який використовує executor замість `StoryScene`
- Оновлений PreviewScreen, який використовує той самий executor
- Видалення або ізоляція `sceneRecordToStoryScene` з основних production path

Out of boundary:
- Візуальний редизайн reader UI
- Інтерактивні об'єкти (interactive_object) — overlay-логіка окремо
- Анімації камери (CameraBlockData) — трансформації окремо
- Збереження/завантаження runtime стану (save/load)
- Editor undo/redo, keyboard shortcuts (Phase 7)

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- `useSceneExecutor` — це React hook, який приймає `TimelineStep[]` і повертає `{ sceneState, currentStep, canAdvance, isTyping, advance, selectChoice }`.
- Yielding blocks (text, dialogue, choice, transition) зупиняють виконання і чекають на `advance()` або `selectChoice()`.
- Non-yielding blocks (background, character, effect, music, sound, camera, variable, interactive_object) виконуються автоматично і одразу переходять до наступного кроку.
- Condition evaluator — чиста функція `conditionsMet(step, variables): boolean`.
- `sceneRecordToStoryScene` має бути видалений з `runtime-story.ts` і `canonical-scene.ts` production path; може залишитись тільки для legacy import/export сценаріїв.
- `StoryReaderResponsive` отримує `StoryScene` — треба змінити його інтерфейс на `TimelineStep[] + SceneState` або створити обгортку.

### Claude's Discretion
- Чи створювати окремий `useSceneExecutor.ts` чи додати в `/lib/engine/`
- Який саме інтерфейс для `onContinue`/`onChoiceSelect` у reader
- Чи рефакторити `StoryReaderResponsive` чи створити новий `BlockReader` компонент
- Як обробити interactive_object — overlay layer окремо чи вбудовано

</decisions>

<canonical_refs>
## Canonical References

### Planning Sources
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/spikes/MANIFEST.md`
- `.planning/spikes/001-runtime-scene-player/README.md`
- `.planning/spikes/001-runtime-scene-player/index.html` (executor HTML prototype)

### Implementation Sources
- `lib/engine/types.ts` (TimelineStep, BlockData, SceneState, Condition)
- `lib/scene-record-adapter.ts` (sceneRecordToStoryScene — to be replaced)
- `lib/runtime-story.ts` (uses sceneRecordToStoryScene)
- `lib/canonical-scene.ts` (uses sceneRecordToStoryScene)
- `components/story-reader-responsive.tsx` (consumer of StoryScene)
- `components/editor/PreviewScreen.tsx` (uses resolvePreviewTimeline)
- `app/reader.tsx` (reader entry point)
- `hooks/useReaderInitialization.ts` (provides currentScene as StoryScene)

</canonical_refs>

<specifics>
## Current Problems Confirmed In Code

- `sceneRecordToStoryScene` втрачає 8/12 типів блоків: character, choice (from timeline), effect, sound, camera, variable, transition, interactive_object повністю відсутні в результуючому `StoryScene`.
- `StoryReaderResponsive` приймає `StoryScene { text, backgroundImageUri, characters, choices, musicUri, audioTriggers, blocks }` — це flat legacy contract, який не відображає послідовність подій у timeline.
- `PreviewScreen` використовує `resolvePreviewTimeline` з `runtime-story.ts`, який теж проходить через `sceneRecordToStoryScene`.
- `useReaderInitialization` повертає `currentScene` як `StoryScene`, що змушує reader працювати з legacy форматом.
- У `app/reader.tsx` навігація між сценами працює через `story.scenes[sceneId]` (legacy `Story` shape), а не через `SceneRecord`.

</specifics>

<spike_findings>
## Spike 001 Key Findings

Перевірено HTML прототипом. Основні висновки:

1. **Yielding vs non-yielding split** — критичний паттерн. Text/dialogue/choice/transition мають чекати на користувача, інші блоки виконуються автоматично.
2. **SceneState як джерело правди** — рендер базується на акумульованому `SceneState`, а не на `StoryScene`.
3. **Choice resolution** — вибір варіанту має: (a) записати choice у variables, (b) очистити поточні choices, (c) викликати scene transition.
4. **Condition evaluator** — проста функція з 8 операторами (==, !=, >, <, >=, <=, contains, isEmpty).
5. **Disabled steps** — пропускаються мовчки, але треба враховувати для дебагу.

</spike_findings>

---

*Phase: 06-block-runtime-executor*
*Context gathered: 2026-05-25 via Spike 001 and codebase audit*
