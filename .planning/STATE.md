# STATE

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-24)

**Core value:** Автор має мати змогу надійно створювати, зберігати, відкривати і програвати сцени візуальної новели без втрати даних і без розриву між редактором та runtime.
**Current focus:** ROADMAP розширено фазами 6-8 (Block Runtime Executor, Editor UX Polish, Accessibility & i18n)

## Status

- **Project status:** Phase 6 Block Runtime Executor виконано (3/3 плани); Phase 7 сплановано (2 плани)
- **Current phase:** 7
- **Current phase name:** Editor UX Polish
- **Next expected command:** `/gsd-execute-phase` для Phase 7

## Active Decisions

- `SceneRecord + TimelineStep` розглядається як канонічна модель сцени для нового editor/runtime шляху.
- Legacy `StoryScene` більше не використовується як default production branch; compatibility layer лишається тільки для explicit migration/import edges.
- Будь-яка зміна в save/load/runtime має спиратися на одне джерело правди, а не на паралельні store-моделі.
- Pure canonical selectors і story reconstruction helpers винесені в окремі модулі, щоб зменшити coupling із великим Zustand store.
- Editor draft hydration і metadata-safe save також винесені в pure helper layer, щоб зменшити ризик UI-level regressions.
- Runtime preview, reader initialization, autosave і manual save/load тепер проходять через `lib/runtime-story.ts` зі strict canonical production path та explicit compatibility helper.
- Phase 4 execution закріпила `storiesMetadata.startSceneId` як canonical start-scene source of truth і прибрала direct component mutations для scene/graph operations.
- Scene CRUD, start-scene reassignment, StoryFlow graph derivation і port-aware connection cleanup тепер проходять через shared canonical helpers (`scene-operations.ts`, `story-flow-graph.ts`).
- Phase 5 execution ізолювала remaining legacy compatibility edges, вирівняла docs із canonical architecture і закрила automated verification gate.

## Known Risks

- Подвійне джерело правди (`sceneRecordsByStory` і `scenesByStory`) усе ще існує як compatibility concern, тому нові зміни мають лишатися canonical-first.
- Необережна міграція legacy сцен може зламати локальні дані користувача.
- Передчасне видалення explicit compatibility layer без migration coverage може зламати локальні legacy stories.
- Manual smoke verification не вдалося прогнати в цьому середовищі через sandbox restriction на `C:\Users\sidle\.expo\native-modules-cache\*`.
- Milestone archive має або прийняти цей зовнішній blocker, або вимагати rerun QA у локальному unrestricted environment.

## Planning Snapshot

- **Roadmap phases:** 8
- **Phase 1 requirements:** ARCH-01, ARCH-02, DATA-01
- **Planning status:** Phases 1-6 executed; Phases 7-8 defined in ROADMAP; Phase 7 planned (2 plans); milestone archive pending

## Phase 6 Key Results

- `lib/engine/useSceneExecutor.ts` + `lib/engine/conditionUtils.ts` — core executor with all 12 block types
- `components/story-reader-responsive.tsx` — accepts `timeline` prop, uses executor when provided
- `hooks/useReaderInitialization.ts` — returns `timeline` + `sceneRecord` alongside deprecated `currentScene`
- `app/reader.tsx` — uses `onTransition` callback, passes `timeline` to reader
- `components/editor/PreviewScreen.tsx` — rewritten to use executor instead of manual step management
- `lib/scene-record-adapter.ts:sceneRecordToStoryScene` — marked `@deprecated`
- `lib/runtime-story.ts` — legacy functions marked `@deprecated`

## Known Risks (updated)

- Executor's `sound`, `camera`, `interactive_object` block types are no-op — full implementation deferred
- Typewriter effect in PreviewScreen is local, not synced with executor's auto-typing toggle
- `preview-step-state.ts` kept for test compat but unused in production

---
*Last updated: 2026-05-25 — Phase 6 complete (Block Runtime Executor)*
