# STATE

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-24)

**Core value:** Автор має мати змогу надійно створювати, зберігати, відкривати і програвати сцени візуальної новели без втрати даних і без розриву між редактором та runtime.
**Current focus:** Phase 5 execution completed with green automated verification; manual smoke rerun remains blocked by the current sandbox

## Status

- **Project status:** Phase 5 execution completed; automated gate passed and manual QA is pending an unrestricted Expo environment
- **Current phase:** 5
- **Current phase name:** Legacy Cleanup and Quality Gate
- **Next expected command:** `/gsd-complete-milestone` after external manual QA rerun or blocker acceptance

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

- **Roadmap phases:** 5
- **Phase 1 requirements:** ARCH-01, ARCH-02, DATA-01
- **Planning status:** Phases 1-5 executed; Phase 5 summaries and verification pack recorded

---
*Last updated: 2026-05-24 after Phase 5 verification*
