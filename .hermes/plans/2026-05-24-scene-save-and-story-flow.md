# План: Збереження сцен та побудова сюжету

> Historical note: цей документ описує pre-canonical planning snapshot від 2026-05-24 і більше не є current source of truth. Актуальний architecture/state дивись у `.planning/phases/*`, `docs/SCENE-MODEL-CONTRACT.md` і `wiki/architecture-reference.md`.

## Мета

Забезпечити можливість:
1. **Зберігати кожну сцену окремо** — з назвою, описом, тегами, таймлайном
2. **Переглядати список збережених сцен** одного сторі
3. **Розміщати сцени послідовно** у вікну StoryFlow, щоб утворити повноцінний сюжет
4. **З'єднувати сцени** через безпосередній drag-and-drop у нодовому графі

## Поточний стан

### Що вже є

| Компонент | Статус | Примітка |
|-----------|--------|----------|
| `use-app-store.scenesByStory` | Працює | Зберігає `Record<string, Record<string, StoryScene>>` — сцени по сторі |
| `use-editor-store` | Працює | Тимчасовий стан таймлайну під час редагування (не persists) |
| `saveScene()` в app-store | Працює | `(storyId, scene: StoryScene)` — зберігає сцену |
| `deleteScene()` | Працює | |
| `SaveSceneDialog` | Працює | Але `onSave` колбек не підключений до збереження таймлайну |
| `LoadSceneDialog` | Працює | Показує список сцен |
| `StoryFlowScreen` | Базовий | Показує ноди звичайними `View`, без drag-and-drop |
| `SceneSelector` | Новий | Шаблонні сцени, імпорт блоків |
| `ProjectScene` (types.ts) | Є | `id, name, timeline: TimelineStep[], sceneState, flowX, flowY` |

### Що НЕ працює / відсутнє

1. **Кнопка "💾 Save" у SceneComposer** — викликає `handleSave` який містить тільки `// TODO`
2. **Таймлайн не зберігається** — `use-editor-store` не persisted, при виході дані втрачаются
3. **StoryFlowScreen** — немає drag-and-drop, неможливо переставити сцени або з'єднати їх
4. **Немає секції "All Scenes"** — окремого вікна зі списком всіх сцен сторі
5. **Scene connections не зберігаються** — `connections[]` у `SceneNode` тільки в локальному стані

## Архітектурне рішення

### Data Model

```
AppState (use-app-store)
  scenesByStory: Record<storyId, Record<sceneId, SceneRecord>>

SceneRecord (новий тип, розширює StoryScene)
  id: string
  name: string                    // ↑ зберігається окремо
  description: string             // ↑ нове
  tags: string[]                 // ↑ нове
  timeline: TimelineStep[]       // ↑ з editor store
  storyId: string                // ↑ явний зв'язок зі сторі
  connections: SceneConnection[] // ↑ нове — зв'язки з іншими сценами
  flowX: number                  // ↑ позиція у StoryFlow
  flowY: number                  // ↑
  createdAt: number              // ↑
  updatedAt: number              // ↑
  isStart: boolean               // ↑ чи є сценою старту

SceneConnection
  targetSceneId: string
  outputPort: string              // 'next' | 'choice_a' | 'choice_b' | ...
  label?: string                  // опціональний напис на стрілці
```

### Зміни у файлах

#### 1. `lib/types.ts` або новий `lib/engine/scene-record.ts`
- Створити тип `SceneRecord` (розширений `ProjectScene`)
- Додати `SceneConnection` інтерфейс

#### 2. `stores/use-app-store.ts`
- Додати дії:
  - `saveSceneRecord(record: SceneRecord)` — зберегти повну сцену
  - `getScenesForStory(storyId)` — отримати всі сцени сторі
  - `updateSceneConnection(storyId, fromId, connection)` — додати/видалити зв'язок
  - `reorderScenes(storyId, sceneIds[])` — змінити порядок сцен
  - `setStartScene(storyId, sceneId)` — встановити стартову сцену

#### 3. `stores/use-editor-store.ts`
- Додати метод `getTimelineSnapshot(): TimelineStep[]` — експорт поточного таймлайну
- Опціонально: робити store persisted через `persist()` middleware

#### 4. `components/editor/SceneComposer.tsx`
- Замінити `handleSave` — викликати `getTimelineSnapshot()` + `useAppStore.saveSceneRecord()`
- Додати `SaveSceneDialog` як повноцінний модал (вже є, треба підключити)

#### 5. `components/editor/SceneManager.tsx` (НОВИЙ)
- **Список всіх сцен** сторі з пошуком, фільтрацією, сортуванням
- **Дії зі сценами:**
  - Edit → відкрити у SceneComposer
  - Duplicate — копіювати таймлайн
  - Delete
  - Mark as Start
- **Drag handle** для зміни порядку
- Навігація: `/scene-manager?storyId=xxx`

#### 6. `components/editor/StoryFlowScreen.tsx` (REFACTOR)
- Реалізувати **drag-and-drop** для нод (через `PanResponder` або `react-native-gesture-handler`)
- **З'єднання сцен:** тягти від output-порта до input-порта
- **Автолейаут** — BFS дерево від стартової сцени
- **Міні-карта** для навігації по великому графу
- **Контекстне меню** на ноді: Edit, Duplicate, Delete, Set as Start

#### 7. `app/` — нові роути
- `/scene-manager` — SceneManager screen
- `/scene-editor` — вже є, оновити

### UI/UX Flow

```
Editor (список Story)
  └── Клік на Story
        └── Scene Manager (список сцен)
              ├── [+] New Scene → Scene Composer (порожній таймлайн)
              ├── [📂] Templates → SceneSelector (імпорт шаблону)
              ├── Клік на сцену → Scene Composer (редагування таймлайну)
              │     └── [💾 Save] → SaveSceneDialog → зберегти
              ├── 🗺 Flow → StoryFlow (нодовий граф)
              │     └── Drag scenes, Connect outputs → inputs
              └── [▶ Play] — Play through connected scenes
```

### StoryFlow — як працює з'єднання сцен

Кожна сцена має **порти:**

```
┌─────────────────────┐
│  ▼ start            │  ← input
│                     │
│  Scene Name         │
│  Dialogue...        │
│                     │
│  ▶ next          ──┼────→  ▼ start (інша сцена)
│  ▶ choice_a      ──┼────→  ▼ start (сцена A)
│  ▶ choice_b      ──┼────→  ▼ start (сцена B)
└─────────────────────┘
```

При збереженні:
- `SceneConnection { targetSceneId, outputPort }` додається до `SceneRecord.connections`
- StoryFlow читає `connections` і малює лінії
- Runtime під час програвання використовує `connections` для переходів

### Порядок реалізації (етапи)

| # | Етап | Файли | Опис |
|---|------|-------|------|
| 1 | **Збереження таймлайну** | `use-editor-store.ts`, `SceneComposer.tsx`, `SaveSceneDialog.tsx` | Замінити TODO у handleSave, викликати saveSceneRecord |
| 2 | **SceneRecord тип** | `lib/engine/scene-record.ts` | Новий тип + міграція |
| 3 | **App store методи** | `stores/use-app-store.ts` | saveSceneRecord, getScenesForStory, updateSceneConnection |
| 4 | **Scene Manager** | `components/editor/SceneManager.tsx` + `app/scene-manager.tsx` | Список сцен, CRUD, drag-reorder |
| 5 | **StoryFlow drag-and-drop** | `StoryFlowScreen.tsx` | PanResponder для нод, з'єднання |
| 6 | **Play mode** | `components/editor/PlayMode.tsx` | Послідовне програвання з'єднаних сцен |

## Файли що зміняться

### Нові файли
- `lib/engine/scene-record.ts` — SceneRecord, SceneConnection типи
- `components/editor/SceneManager.tsx` — список сцен з CRUD
- `app/scene-manager.tsx` — роут
- `components/editor/PlayMode.tsx` — програвання сюжету (етап 6)

### Змінені файли
- `stores/use-app-store.ts` — нові дії
- `stores/use-editor-store.ts` — getTimelineSnapshot
- `components/editor/SceneComposer.tsx` — підключити Save
- `components/editor/modals/SaveSceneDialog.tsx` — приймати таймлайн
- `components/editor/StoryFlowScreen.tsx` — drag-and-drop, з'єднання
- `components/editor/index.ts` — експорти
- `app/editor.tsx` — навігація на SceneManager

## Тестування

- Зберегти сцену → перевірити що таймлайн не втрачається
- Зберегти 10 сцен → відкрити SceneManager → перевірити список
- Drag-and-drop у StoryFlow → перевірити збереження позицій
- З'єднати 2 сцени → зберегти → перевірити що зв'язок є

## Ризики

- **WSL/NTFS perf** — tsc може висіти на великих проектах (відома проблема)
- **Drag-and-drop** на React Native може бути складним без `react-native-gesture-handler`
- **Persistent storage** — Zustand persist може мати ліміти розміру на великих таймлайнах
