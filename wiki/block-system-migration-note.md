# Пояснювальна записка: Міграція системи блоків до паперової системи (TimelineStep/SceneRecord)

Дата: 2026-05-30
Статус: Планування

## 1. Резюме

Проект VNE перебуває в стані переходу від старої блокової системи (Atom/Molecule/Lego) та плоскої моделі `StoryScene/Story` до нової "паперової" системи на базі `TimelineStep[]` всередині `SceneRecord`. Нова система вже **реалізована** — код редактора (`SceneComposer`), рантайм виконавець (`useSceneExecutor`), фабрики блоків (`event-factory`) та магазин редактора (`use-editor-store`) працюють з новою моделою. Стара система **частково** видалена, але залишились "хвости" — типи, компонення, хуки та store, які більше не використовуються.

Міграція **ще не завершена**: компонент читача `story-reader-responsive.tsx` досі працює зі старим типом `StoryScene`, а адаптер `scene-record-adapter.ts` конвертує SceneRecord → StoryScene для читання. Це тимчасовий шар, який потрібно видалити після перенесення читача на пряму роботу з `TimelineStep[]`.

## 2. Архітектурна карта

### 2.1. Нова (цільова) система — "Paper System"

```
lib/engine/types.ts          ← Канонічні типи (TimelineStep, SceneRecord, BlockData, SceneState)
lib/engine/event-factory.ts  ← Фабрики створення блоків (createBlockStep, createTextStep, ...)
lib/engine/useSceneExecutor.ts ← Рантайм виконавець (обробка TimelineStep[] у SceneState)
lib/engine/conditionUtils.ts ← Умови та порожній SceneState
lib/engine/index.ts          ← Реекспорт

stores/use-editor-store.ts   ← Zustand store редактора (timeline, selectedBlockId, undo/redo)
lib/editor-scene-draft.ts    ← EditorSceneDraft — проміжний стан редактора
lib/editor-scene-save.ts     ← Збереження draft → SceneRecord
lib/editor/block-validation.ts ← Валідація блоків
lib/editor/block-icon.ts     ← Іконки блоків
lib/editor/timeline-item-layout.ts ← Layout елементів таймлайну
lib/editor/timeline-sortable.ts ← Drag-and-drop сортування

components/editor/            ← 3-панельний редактор
  SceneComposer.tsx           ← Головний компонент редактора
  BlockLibraryPanel.tsx       ← Бібліотека блоків
  TimelinePanel.tsx           ← Таймлайн (список блоків)
  PropertiesPanel.tsx         ← Властивості обраного блока
  MiniPreview.tsx             ← Міні-превью
  SceneSelector.tsx           ← Вибір сцени
  PlayMode.tsx                ← Режим гри
  PreviewScreen.tsx           ← Екран превью
  StoryFlowScreen.tsx         ← Екран story flow
  StoryManuscriptScreen.tsx   ← Екран рукопису

lib/scene-operations.ts      ← CRUD операції з SceneRecord (створення, видалення, з'єднання сцен)
lib/canonical-scene.ts       ← Допоміжні функції для SceneRecord та snapshot
```

**Принцип:** Сцена = `SceneRecord` з масивом `TimelineStep[]`. Кожен крок таймлайну має `blockType` (один з 12 типів) та `data` (відповідний `BlockData`). Редактор працює напряму з цією моделю. Рантайм `useSceneExecutor` обробляє кроки послідовно, оновлюючи `SceneState`.

### 2.2. Стара система — "Legacy System"

```
lib/types.ts                  ← StoryScene, Story, Choice (deprecated)
lib/story-validator.ts        ← Валідація StoryScene/Story
lib/atom-types.ts             ← Старі атомні блоки (ArchType, AtomBlock) — НЕ ВИКОРИСТОВУЄТЬСЯ
lib/molecule-types.ts         ← Старі молекулярні блоки (MoleculeBlock) — НЕ ВИКОРИСТОВУЄТЬСЯ
lib/lego-types.ts             ← Старі Lego сцени (LegoScene) — НЕ ВИКОРИСТОВУЄТЬСЯ
stores/use-lego-store.ts      ← Старий Zustand store для Lego — НЕ ВИКОРИСТОВУЄТЬСЯ

components/lego-editor/       ← 4 файли старого Lego редактора — НЕ ВИКОРИСТОВУЮТЬСЯ
components/editors/StorySceneEditor/ ← 3 файли старого редактора сцен — НЕ ВИКОРИСТОВУЮТЬСЯ
components/scene-editor/      ← Порожня папка
hooks/lego/                   ← 4 файли Lego хуків — НЕ ВИКОРИСТОВУЮТЬСЯ
```

### 2.3. Перехідний шар (тимчасовий — підлягає видаленню)

```
lib/scene-record-adapter.ts   ← SceneRecord → StoryScene (зворотна сумісність для читача)
lib/runtime-story.ts          ← Будує Story/StoryScene зі store для читача
lib/canonical-scene.ts        ← buildCompatibilitySceneMapFromState (fallback для старого читача)
```

## 3. Що можна видалити після повної міграції

### 3.1. Безпечно видалити (жодних імпортів з нового коду)

| Файл/Директорія | Розмір | Примітка |
|---|---|---|
| `components/lego-editor/` (4 файли) | 39KB | Повний старий редактор Lego. Жоден файл не імпортується. |
| `components/editors/StorySceneEditor/` (3 файли) | 15KB | Старий редактор сцен. Жоден файл не імпортується. |
| `components/scene-editor/` | 0KB | Порожня папка. |
| `lib/atom-types.ts` | 6KB | Старі Atom/Molecule типи. Імпортуються тільки Lego-файлами. |
| `lib/molecule-types.ts` | 6KB | Те саме. |
| `lib/lego-types.ts` | ~0KB | Те саме. |
| `lib/lego-scene-export.ts` | 1KB | Експорт Lego сцен. |
| `stores/use-lego-store.ts` | 4KB | Старий Lego store. Ніде не підключений. |
| `hooks/lego/` (4 файли) | 4KB | Старі Lego хуки. |
| `hooks/useSceneData.ts` | 3KB | Старий хук, працює з `StoryScene`. Імпортується `SceneManager` — перевірити! |
| `hooks/useSceneEditorActions.ts` | 5KB | Імпортує `useLegoStore`. Буде непотрібним. |

**Разом: ~83KB, 15 файлів.**

### 3.2. Видалити після перенесення читача на нову модель

| Файл | Розмір | Примітка |
|---|---|---|
| `lib/scene-record-adapter.ts` | 5.5KB | Адаптер SceneRecord → StoryScene. Потрібний поки читач працює зі старим типом. |
| `lib/runtime-story.ts` | 5.7KB | Runtime snapshot builders (buildRuntimeStorySnapshot, ...). Будує `Story` для legacy читача. |
| `lib/canonical-scene.ts` | 1.7KB | `buildCompatibilitySceneMapFromState` — fallback для старого читача. |

**Випадок використання:** `story-reader-responsive.tsx` (рядок 37-38) імпортує `StoryScene` та `Choice` з `lib/types`. Крім того, `lib/story-hooks.ts` використовує `buildRuntimeStorySnapshot` для хука `useStoryState`. Ці залежності потрібно замінити прямою роботю з `SceneRecord`/`SceneRecord[]`.

### 3.3. Рефакторинг (не видалення, а спрощення)

| Файл | Що робити |
|---|---|
| `stores/use-app-store.ts` | Видалити поле `scenesByStory` (legacy) з state, `saveScene`, `addChoice`, `deleteChoice` (legacy actions), та логіку міграції `migrateFromLegacyKeys` (коли всі користувачі перейдуть на нову модель). Полегшить store на ~100 рядків. |
| `lib/types.ts` | Після видалення StoryScene — перенести `Choice`, `PlaybackState`, `SaveSlot`, `UserSettings` в окремі файли, видалити `StoryScene`, `Story`. |
| `lib/story-hooks.ts` | `exportStory` / `importStory` працюють з `Story` — замінити на SceneRecord. `StoryAutoSave` можна залишити (він працює з `sceneRecordsByStory` вже зараз). |

## 4. Конкретний план міграції (порядок виконання)

### Фаза 0: Підготовка (робити зараз)

1. **Поточний стан з обчислення `any` — мінімізувати.** В `story-validator.ts:25` є `data: any` (security boundary, прийнятно). В `scene-record-adapter.ts:175` — `as unknown[]` (architectural gap). В `runtime-story.ts:104` — `as unknown as Story`. Ці 3 залишити позначеними як відомі обмеження.

2. **Перевірити тести.** Тести в `__tests__/unit/` покривають:
   - `scene-record-adapter.test.ts` — адаптер (буде видалено)
   - `runtime-story.test.ts` — runtime-story (буде видалено)
   - `useReaderInitialization-canonical.test.ts` — ініціалізація читача з канонічною моделлю
   - `runtime-persistence.test.ts` — персистенція

### Фаза 1: Перенесення читача на нову модель

**Складність: Висока** (компонент `story-reader-responsive.tsx` — 779 рядків)

1. Замінити імпорт `StoryScene, Choice` з `@/lib/types` на `SceneRecord, TimelineStep` з `@/lib/engine/types`
2. Замінити `createExecutorSceneImageState()` (яка створює `StoryScene`) прямими мапінгами з `SceneRecord.timeline`
3. Замінити `useSceneExecutor` виклики — певно, вони вже правильні. Перевірити.
4. Логіка переходу між сценами — замінити `sceneId → sceneId` (старий: choice.nextSceneId) на `SceneRecord.connections` або `transitionTarget`
5. Замінити `story-reader-responsive.tsx` header type imports
6. Оновити `hooks/useReaderInitialization.ts` — він підтримує канонічну модель вже зараз (є тест `useReaderInitialization-canonical.test.ts`)
7. Оновити `lib/reader-runtime.ts` — він вже працює з `SceneRecord`

**Критерій завершення:** `story-reader-responsive.tsx` не імпортує нічого з `@/lib/types`

### Фаза 2: Видалення legacy адаптерів

1. Видалити `lib/scene-record-adapter.ts`
2. Видалити `lib/runtime-story.ts`
3. Видалити `lib/canonical-scene.ts`
4. Оновити `stores/use-app-store.ts`:
   - Видалити імпорти з `canonical-scene`
   - Видалити `buildCompatibilitySceneMapFromState`, `buildCanonicalSceneRecordsFromLegacyScenes` з викликів
   - Замінити `saveScene`, `addChoice`, `deleteChoice` на прямі операції з `sceneRecordsByStory`

### Фаза 3: Очистка `stores/use-app-store.ts`

1. Видалити поле `scenesByStory` з `AppState`
2. Видалити всі legacy actions: `saveScene`, `addChoice`, `deleteChoice`
3. Спростити `migrateFromLegacyKeys` — прибрати завантаження `STORAGE_KEYS.SCENES` (якщо legacy сцени більше не потрібні)
4. Оновити `partialize` — прибрати `scenesByStory`

### Фаза 4: Видалення старого коду (Lego/Atom/Molecule)

1. Видалити `components/lego-editor/`
2. Видалити `components/editors/StorySceneEditor/`
3. Видалити `components/scene-editor/`
4. Видалити `lib/atom-types.ts`
5. Видалити `lib/molecule-types.ts`
6. Видалити `lib/lego-types.ts`
7. Видалити `lib/lego-scene-export.ts`
8. Видалити `stores/use-lego-store.ts`
9. Видалити `hooks/lego/`
10. Видалити `hooks/useSceneData.ts`
11. Видалити `hooks/useSceneEditorActions.ts`

### Фаза 5: Очистка тестів

1. Видалити `__tests__/unit/lib/scene-record-adapter.test.ts`
2. Видалити `__tests__/unit/lib/runtime-story.test.ts`
3. Видалити `__tests__/unit/lib/runtime-persistence.test.ts` (якщо він тестує legacy)
4. Перевірити `__tests__/unit/lib/bundled-story-sync.test.ts` — замінити якщо тестує legacy

### Фаза 6: Фінальна зачистка `lib/types.ts`

1. Перенести `PlaybackState` → `lib/engine/types.ts` (він вже частково там як `SceneState`)
2. Перенести `SaveSlot` → `lib/story-domain.ts`
3. Перенести `UserSettings` → `lib/user-settings.ts` (вже є там)
4. Видалити `StoryScene`, `Story`, `Choice`
5. `lib/types.ts` стане порожнім або буде видалений

## 5. Оцінка наявного коду

### 5.1. Що зроблено добре

- **Нова система спроектована правильно.** Чиста відповідальність: `types.ts` → дані, `event-factory.ts` → створення, `useSceneExecutor.ts` → виконання, `use-editor-store.ts` → UI стан.
- **12 типів блоків покривають** всі потреби VNE: background, character, text, dialogue, choice, effect, music, sound, interactive_object, camera, variable, transition.
- **Умови (Condition)** — підтримка умовного виконання кожного кроку (`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `isEmpty`, `has`, `not_has`).
- **Адаптер зворотної сумісності** (`scene-record-adapter.ts`) — коректно конвертує старі сцени в нові при старті через `buildCanonicalSceneRecordsFromLegacyScenes`.
- **Редактор повністю робочий** (SceneComposer + всі підпанелі).
- **StoryAutoSave** вже працює з `sceneRecordsByStory`.

### 5.2. Проблеми, що потребують уваги

1. **Читач працює через адаптор.** `story-reader-responsive.tsx` отримує `StoryScene` (з адаптора) замість прямої роботи з `TimelineStep`. Це означає подвійну конвертацію: `SceneRecord → StoryScene (адаптер) → TimelineStep (з blocks)` при кожному знімку. Додаткові накладні витрати при кожному зверненні до стану.

2. **Логіка міграції** (`migrateFromLegacyKeys`) **може не працювати на нових пристроях.** Якщо користувач встановив додаток вперше після повного переходу на нову модель, legacy storage keys будуть порожніми, і міграція просто не знада даних. Поки що це ок, але коли ми видалимо `scenesByStory` з store, міграція потрібно буде прибрати повністю.

3. **story-reader-responsive.tsx — 779 рядків** з 15+ useState хуками. Це "God Component", який потребує декомпозиції. Під час міграції на нову модель — розбити на підкомпоненти.

4. **Дублювання даних у `use-app-store`.** Поле `scenesByStory` (legacy) та `sceneRecordsByStory` (canonical) зберігають ті самі дані в різних форматах. Це тимчасовий стан, але він працює вже тривалий час.

5. **`story-domain.ts`** експортує `StoryMetadata`, `StoryDomain.extractMetadata`, `StoryDomain.createSaveSlot`. `StoryMetadata.startSceneId` — це дублювання інформації, яка вже є в `SceneRecord.isStart`. Потребує уваги під час зачистки.

6. **`document-scene.ts`** — окрема підсистема для документ-редактору. Він працює з новою моделлю (TimelineStep, SceneRecord), що добре. Але маст-систем (`story-manuscript.ts`) створює окремий формат `StoryManuscriptBlock`, який не є частиною канонічної моделі.

7. **`story-validator.ts`** працює тільки з `StoryScene/Story`. Його потрібно буде переписати для `SceneRecord`, або видалити як security boundary для JSON імпорту (він все ще потрібен для валідації імпортованих JSON файлів). Але нові сцени створються через редактор і не потребують валідації.

8. **`bundled-story-sync.ts`** імпортує `StoryScene` з `lib/types`. Потребує перевірки, чи він взагалі використовується.

## 6. Потенційні ризики

1. **НЕ видаляйте `story-validator.ts` повністю** — він є security boundary для JSON імпорту. Перепишіть його для SceneRecord, коли старі імпорти припинять підтримуватись.

2. **НЕ видаляйте `scenesByStory` з `partialize` одразу** — старі версії додатку можуть мати збережені дані. Зробіть це у декілька релізів:
   - Реліз N: Прибрати `scenesByStory` з `AppState` але залишити в `partialize` (для зворотної сумісності)
   - Реліз N+1: Повністю прибрати

3. **НЕ видаляйте `bundled-story-sync.ts`** поки не перевірити, чи він використовується для вбудованих демо-історій.

4. **Тест `__tests__/unit/lib/bundled-story-sync.test.ts`** — може стати неактуальним, якщо `bundled-story-sync.ts` буде видалено.

## 8. Рекомендований порядок дій

1. **Почати з Фази 1** (найскладніша, найвищий ризик). Перенести `story-reader-responsive.tsx` на роботу з `SceneRecord` + `TimelineStep[]` напряму, без адаптера. Це критичний шосе — читач основний component у додатку.

2. **Паралельно з Фазою 1** — очевидно, що всі старих хуки (`useSceneData.ts`, `useSceneEditorActions.ts`) можна видалити вже зараз, тому що нинішній читач `(story-reader-responsive.tsx)` їх не імпортує. SceneManager може імпортувати `useSceneData` — перевірити перед видаленням.

3. **Фази 2-6** робити послідовно після успішного завершення Фази 1.

## Пов'язані сторінки

- [[architecture-reference|Архітектурна довідка]]
- [[block-types-reference|Довідник типів блоків]]
- [[stores-reference|Довідник Zustand store]]
- [[migration-guide|Гайд міграції]]
- [[code-analysis-report-2026-05-29|Звіт аналізу коду 2026-05-29]]
