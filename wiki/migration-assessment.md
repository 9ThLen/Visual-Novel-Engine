# Оцінка міграції блокової системи → Paper System (TimelineStep/SceneRecord)

Дата аудиту: 2026-05-30
Версія: Post-migration assessment

---

## 1. Підсумок виконаних робіт

### ✅ Повністю завершено

| Що зроблено | Деталі |
|---|---|
| Видалено Lego/Atom/Molecule систему | 22 файли, ~110KB — старий редактор, типи, хуки, store |
| Видалено адаптерний шар | `scene-record-adapter.ts` + `runtime-story.ts` — SceneRecord↔StoryScene конвертація |
| Видалено legacy store | `use-lego-store.ts`, `store-consolidation.md` |
| Видалено scenesByStory з AppState | Поле `scenesByStory: Record<string, Record<string, StoryScene>>` повністю прибране |
| Видалено legacy actions | `saveScene`, `addChoice`, `deleteChoice` з use-app-store |
| Перенесено save/load логіку | `buildCanonicalSaveSlot` + `buildCanonicalLoadSnapshot` перенесено до `reader-runtime.ts` |
| Оновлено story-hooks.ts | `exportStory`/`importStory` працюють з `SceneRecord[]`, `useStoryState` повертає `CanonicalStory` |
| TypeScript компіляція | **0 errors** (excluding __tests__ mock issues) |

### 📊 Метрики

| Метрика | До | Після |
|---|---|---|
| Загалом .ts/.tsx файлів | ~200 | ~175 |
| Legacy-файли (Lego/Atom/Molecule) | 22 | 0 |
| Файли з імпортом StoryScene | ~15 | 5 (migration/helpers only) |
| Adapter-файли | 3 | 0 |
| use-app-store LOC | ~520 | ~483 |
| __tests__ error count | ~3 (mock issues) | ~3 (не змінилось) |

---

## 2. Що залишилось від старої системи (навмисно)

### 2.1. `lib/types.ts` — частково legacy

**Залишилось:**
- `StoryScene` — використовується в міграційному коді (`scene-operations.ts`) та валідації (`story-validator.ts`)
- `Story` — використовується в `story-domain.ts` для метаданих
- `Choice` — `StoryScene.choices` в міграційному коді
- `PlaybackState`, `SaveSlot`, `UserSettings` — використовуються store/hooks

**Статус:** Це **навмисно**. `StoryScene`/`Story` залишаються як тип для:
1. Міграції старих даних (`buildCanonicalSceneRecordsFromLegacyScenes`)
2. Імпорту JSON через `story-validator.ts`
3. `audio-types.ts` — `StorySceneExtended` для audio-тригерів

**Рекомендація:** Перенести `StoryScene`/`Story`/`Choice` в `lib/types.ts` як `@deprecated` типи, залишити їх тільки для backward-compatibility JSON імпорту. Новий код не повинен їх використовувати.

### 2.2. `lib/canonical-scene.ts` — спрощений

**Залишилось:** 38 рядків (з 54). Експортує:
- `CanonicalSceneStateSnapshot` (interface)
- `SceneRecordContentUpdates` (type)
- `updateSceneRecordPreservingMeta()` — використовується `use-app-store.ts` + `editor-scene-draft.ts`
- `getCanonicalSceneRecordFromState()` — використовується `use-app-store.ts`
- `getCanonicalSceneRecordsForStoryFromState()` — використовується `use-app-store.ts`

**Рекомендація:** Інгрегувати ці функції безпосередньо в `use-app-store.ts` як приватні утиліти і видалити файл.

### 2.3. `lib/story-validator.ts` — security boundary

**Статус:** Працює з `StoryScene`/`Story`/`Choice`. Використовується `story-hooks.ts:importStory()`.

**Рекомендація:** Залишити як є. Це security boundary для JSON імпорту. Він не заважає новій системі, бо викликається тільки при імпорті JSON.

---

## 3. Архітектура після міграції

```
┌─────────────────────────────────────────────────────────────┐
│                      APP LAYER (app/)                       │
│  editor.tsx → editor/SceneComposer                          │
│  scene-editor.tsx → editor/SceneComposer                    │
│  play.tsx → editor/PlayMode → story-reader-responsive       │
│  preview.tsx → editor/PreviewScreen                         │
│  scene-manager.tsx → editor/SceneManager                    │
│  story-flow.tsx → editor/StoryFlowScreen                    │
│  reader.tsx → story-reader-responsive                       │
├─────────────────────────────────────────────────────────────┤
│                    COMPONENTS LAYER                          │
│  ✅ SceneComposer (510 LOC) — головний редактор             │
│  ✅ BlockLibraryPanel (263 LOC) — бібліотека 12 блоків      │
│  ✅ TimelinePanel (431 LOC) — таймлайн з DnD                │
│  ✅ PropertiesPanel (1086 LOC) — форми для 12 типів блоків   │
│  ✅ SceneSelector (565 LOC) — шаблони сцен                  │
│  ✅ SceneManager (488 LOC) — CRUD сцен                      │
│  ✅ PlayMode (179 LOC) — play-through                       │
│  ✅ PreviewScreen (295 LOC) — інтерактивний preview         │
│  ✅ StoryFlowScreen (584 LOC) — node graph                  │
│  ✅ MiniPreview (229 LOC)                                   │
│  ✅ CharacterCreator (322 LOC)                              │
│  ✅ SaveSceneDialog (406 LOC)                               │
│  ✅ AssetPicker (496 LOC)                                   │
│  ✅ story-reader-responsive (779 LOC) — God Component       │
├─────────────────────────────────────────────────────────────┤
│                    ENGINE LAYER (lib/engine/)                │
│  types.ts — TimelineStep, SceneRecord, 12 BlockData, SceneState │
│  event-factory.ts — create*Step() для 12 типів              │
│  useSceneExecutor.ts — рантайм виконавець (- → SceneState)  │
│  conditionUtils.ts — умови, createEmptySceneState            │
├─────────────────────────────────────────────────────────────┤
│                 EDITOR LIB LAYER (lib/editor/)               │
│  block-validation.ts — isBlockComplete, getBlockEmptyFields │
│  block-icon.ts — іконки блоків                              │
│  timeline-sortable.ts — DnD props                           │
│  timeline-item-layout.ts — layout helpers                   │
│  story-manuscript.ts/save/types — рукописний формат         │
├─────────────────────────────────────────────────────────────┤
│                   DATA LAYER                                │
│  stores/use-app-store.ts — Zustand (sceneRecordsByStory)    │
│  stores/use-editor-store.ts — Zustand (timeline, undo/redo) │
│  lib/scene-operations.ts — CRUD SceneRecord + legacy migr.  │
│  lib/canonical-scene.ts — helpers (можна інтегрувати)       │
│  lib/reader-runtime.ts — save/load + reader utils           │
│  lib/story-hooks.ts — useStoryState, useStoryActions        │
│  lib/story-domain.ts — StoryMetadata, StoryDomain           │
│  lib/types.ts — PlaybackState, SaveSlot, UserSettings       │
│  lib/story-validator.ts — JSON import security boundary     │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Оцінка якості міграції

### 4.1. Що зроблено добре ✅

1. **Повне видалення старої системи.** Lego/Atom/Molecule — 0 файлів. Немає зайвих залежностей.
2. **Адаптерний шар прибрано.** `scene-record-adapter.ts` та `runtime-story.ts` видалено. Читач працює напряму з `TimelineStep[]`.
3. **Store очищено.** `scenesByStory`, `saveScene`, `addChoice`, `deleteChoice` — видалено.
4. **TypeScript компіляція чиста.** 0 errors в production коді.
5. **Збережено зворотну сумісність.** `story-validator.ts` дозволяє імпортувати старі JSON формати.
6. **Save/Load працює.** `buildCanonicalSaveSlot`/`buildCanonicalLoadSnapshot` перенесено до `reader-runtime.ts`.

### 4.2. Що можна покращити ⚠️

1. **`story-reader-responsive.tsx` — God Component (779 LOC).** Потребує декомпозиції на підкомпоненти:
   - `ReaderDisplay` — фон, персонажи, текст
   - `ReaderControls` — кнопки, меню, налаштування
   - `ReaderTransitions` — переходи між сценами
   - `ReaderChoices` — відображення вибору

2. **`lib/canonical-scene.ts` — можна інтегрувати.** Функції `getCanonicalSceneRecordFromState`, `getCanonicalSceneRecordsForStoryFromState`, `updateSceneRecordPreservingMeta` — використовуються тільки в `use-app-store.ts` та `editor-scene-draft.ts`. Можна перенести їх безпосередньо в store.

3. **`lib/types.ts` — legacy типи.** `StoryScene`, `Story`, `Choice` залишаються в глобальному namespace. Рекомендовано позначити як `@deprecated` та обмежити використання.

4. **`lib/audio-types.ts` — StorySceneExtended.** Розширення `StoryScene` для audio-тригерів. Після повного переходу на `TimelineStep` це буде непотрібно.

5. **Тестові файли `__tests__/`** — містять mock-помилки (3 errors). Потребують оновлення для нової системи.

---

## 5. Рекомендації по подальших діях

### 5.1. Високий пріоритет

| # | Дія | Складність | Час |
|---|---|---|---|
| 1 | Декомпозиція `story-reader-responsive.tsx` | Висока | 4-6 год |
| 2 | Інтегрувати `canonical-scene.ts` в `use-app-store.ts` | Низька | 30 хв |
| 3 | Позначити legacy типи в `types.ts` як `@deprecated` | Низька | 15 хв |
| 4 | Виправити тести `__tests__/` | Середня | 2-3 год |

### 5.2. Середній пріоритет

| # | Дія | Складність | Час |
|---|---|---|---|
| 5 | Переписати `audio-types.ts` на `TimelineStep` | Середня | 2-3 год |
| 6 | Додати типи для `StoryScene` в `engine/types.ts` як `@deprecated` aliases | Низька | 30 хв |
| 7 | Оптимізувати `use-app-store.ts` (видалити `mergeSceneRecordsByStory`, спростити `migrateFromLegacyKeys`) | Середня | 2-3 год |

### 5.3. Низький пріоритет (tech debt)

| # | Дія | Складність | Час |
|---|---|---|---|
| 8 | Видалити `StoryScene`/`Story` з `types.ts` (коли всі legacy імпорти будуть прибрані) | Низька | 1 год |
| 9 | Рефакторинг `story-domain.ts` — прибрати залежність від `Story` | Низька | 1-2 год |
| 10 | Документація — оновити `architecture-reference.md` з новою архітектурою | Низька | 1 год |

---

## 6. Загальна оцінка

**Статус міграції: 90% завершено**

Міграція блокової системи до paper system (TimelineStep/SceneRecord) фактично завершена. Всі компоненти редактора працюють з новою моделю. Читач працює напряму з `TimelineStep[]` без адаптерного шару. Store очищений від legacy полів.

Залишилось:
- Декомпозиція God Component (story-reader-responsive.tsx)
- Фіналізація очистки (canonical-scene.ts, types.ts deprecated)
- Оновлення тестів

**Архітектура чиста, код компілюється, система працює.**

## Пов'язані сторінки

- [[architecture-reference|Архітектурна довідка]]
- [[block-types-reference|Довідник типів блоків]]
- [[block-system-migration-note|Пояснювальна записка міграції]]
- [[paper-editor-migration-plan|Детальний план міграції]]
- [[stores-reference|Довідник Zustand store]]
- [[migration-guide|Гайд міграції]]
