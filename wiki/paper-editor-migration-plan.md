# План міграції Paper Editor — Детальний

Дата: 2026-05-30
Версія: 2.0 (після видалення мертвого коду)

## 1. Поточнийстан після очистки

### 1.1. Видалено (22 файли, ~110KB мертвого коду)
- `components/lego-editor/` (4 файли) — старий Lego редактор
- `components/editors/` (4 файли) — старий SceneEditor + ViewModeTabs
- `components/scene-editor/` (порожня папка)
- `components/DesktopLayout.tsx` — не імпортувався нікуди
- `lib/atom-types.ts`, `lib/molecule-types.ts`, `lib/lego-types.ts` — стари типи
- `lib/lego-scene-export.ts`, `lib/story-reader-choice.ts`, `lib/preview-step-state.ts`
- `stores/use-lego-store.ts`
- `hooks/use-file-picker.ts`, `hooks/useSceneData.ts`, `hooks/useSceneEditorActions.ts`, `hooks/useSceneEditorMedia.ts`
- `hooks/lego/` (3 файли)

### 1.2. TypeScript компіляція: ЧИСТА (0 errors за межами __tests__)

---

## 2. Компоненти нового (paper) редактора — статус

### 2.1. РОБОЧІ компоненти (використовуються, імпортуються, компілюються)

| Компонент | LOC | Статус | Примітка |
|---|---|---|---|
| `SceneComposer.tsx` | 510 | ✅ Працює | Головний layout 3-панельного редактора. Працює з `useEditorStore` + `useAppStore` (sceneRecordsByStory). |
| `BlockLibraryPanel.tsx` | 263 | ✅ Працює | Бібліотека 12 блоків по категоріях. Імпортує (engine/types). |
| `TimelinePanel.tsx` | 431 | ✅ Працює | Вертикальний список блоків з drag-and-drop. Працює з (engine/types), (block-validation). |
| `PropertiesPanel.tsx` | 1086 | ✅ Працює | Форми для всіх 12 типів блоків. Типізований renderForm() з switch по BlockType. |
| `SceneSelector.tsx` | 565 | ✅ Працює | Браузер шаблонів сцен. Імпортує (engine/types). |
| `SceneManager.tsx` | 488 | ✅ Працює | Менеджер сцен сторії (створення, дублювання, видалення). Працює з `sceneRecordsByStory`. |
| `PlayMode.tsx` | 179 | ✅ Працює | Режим граймтаїм. Передає `SceneRecord.timeline` → `StoryReaderResponsive`. |
| `PreviewScreen.tsx` | 295 | ✅ Працює | Інтерактивний превью з `useSceneExecutor`. |
| `StoryFlowScreen.tsx` | 584 | ✅ Працює | Граф зв'язків між сценами (node editor з PanResponder). |
| `MiniPreview.tsx` | 229 | ✅ Працює | Міні-превью поточного стану сцени. |
| `CharacterCreator.tsx` | 322 | ✅ Працює | Модальне вікно створення персонажа. |
| `SaveSceneDialog.tsx` | 406 | ✅ Працює | Діалоги Save/Load сцен. |
| `AssetPicker.tsx` | 496 | ✅ Працює | Пікер асетів. |
| `StoryManuscriptScreen.tsx` | 226 | ✅ Працює | Екран рукописного редактора. |
| `StoryManuscriptBlock.tsx` | 303 | ✅ Працює | Блок рукопису. |
| `StoryManuscriptSection.tsx` | 95 | ✅ Працює | Секція рукопису. |
| `StoryManuscriptSidebar.tsx` | 82 | ✅ Працює | Сайдбар рукопису. |
| `DocumentSceneEditor.tsx` | ~336 | ✅ Працює | Редактор документних сцен (окрема підсистема, працює з SceneRecord). |

### 2.2. ПІДСИСТЕМИ LIB (робочі)

| Файл | Розмір | Статус |
|---|---|---|
| `lib/engine/types.ts` | 12.6KB | ✅ Канонічні типи (TimelineStep, SceneRecord, 12 BlockData, SceneState) |
| `lib/engine/event-factory.ts` | 6KB | ✅ Фабрики створення всіх типів блоків |
| `lib/engine/useSceneExecutor.ts` | 9.6KB | ✅ Рантайм виконавець (TimelineStep[] → SceneState) |
| `lib/engine/conditionUtils.ts` | 2KB | ✅ Умови + createEmptySceneState() |
| `lib/editor-scene-draft.ts` | 3KB | ✅ EditorSceneDraft (проміжний стан редактора) |
| `lib/editor-scene-save.ts` | 0.5KB | ✅ Збереження draft → SceneRecord |
| `lib/editor/block-validation.ts` | 4KB | ✅ Валідація блоків (isBlockComplete, getBlockEmptyFields) |
| `lib/editor/block-icon.ts` | ~1KB | ✅ Іконки блоків |
| `lib/editor/timeline-item-layout.ts` | ~0.3KB | ✅ Layout елементів |
| `lib/editor/timeline-sortable.ts` | ~0.3KB | ✅ DnD сортування |
| `lib/editor/story-manuscript.ts` | 3.7KB | ✅ Рукописний формат |
| `lib/editor/story-manuscript-save.ts` | ~2.3KB | ✅ Збереження рукопису |
| `lib/editor/story-manuscript-types.ts` | ~1.2KB | ✅ Типи рукопису |
| `lib/scene-operations.ts` | 7.3KB | ✅ CRUD SceneRecord (створення, видалення, з'єднання, міграція) |
| `lib/reader-runtime.ts` | 2.5KB | ✅ Утиліти читача (getStartSceneId, getNextSceneId, toReaderChoices) |

---

## 3. Що потребує перенесу / рефакторингу

### 3.1. КРИТИЧНЕ: Читач (story-reader-responsive.tsx → нова модель)

**Файл:** `components/story-reader-responsive.tsx` (779 LOC, God Component)

**Проблема:** Імпортує `StoryScene, Choice` з `@/lib/types` (legacy). Працює через адаптерний шар `scene-record-adapter.ts`, який конвертує SceneRecord → StoryScene → blocks.

**Поточний потік даних:**
```
useAppStore → sceneRecordsByStory → SceneRecord → sceneRecordToStoryScene() → StoryScene → blocks (TimelineStep[])
```

**Потрібний потік:**
```
useAppStore → sceneRecordsByStory → SceneRecord → timeline (TimelineStep[]) → useSceneExecutor → SceneState
```

**Конкретні зміни:**
1. Замінити `import { StoryScene, Choice } from '@/lib/types'` → `import type { SceneRecord, TimelineStep } from '@/lib/engine/types'`
2. Приймати `SceneRecord` замість `StoryScene` (або прямо `TimelineStep[]`)
3. Діставати `characters` з `SceneState.characters` (який оновлюється character блоками) замість `StoryScene.characters`
4. Логіка переходів: замінити `choice.nextSceneId` на `SceneRecord.connections` або `sceneState.transitionTarget`
5. `dialogueHistory` — брати з `sceneState.dialogueHistory` замість обчислення з `StoryScene.text`
6. Розбити God Component на підкомпоненти (Display, Controls, Transitions)

**Залежності для переносу:**
- `hooks/useReaderInitialization.ts` — ✅ Вже підтримує канонічну модель (є тест `useReaderInitialization-canonical.test.ts`)
- `hooks/useReaderAudio.ts` — Імпортує `StoryScene` з `@/lib/types`. Потрібна заміна.
- `hooks/useReaderAudio.ts` — Використовує `story.blocks` (TrajectoryStep[]). Має використовувати `sceneRecord.timeline`.
- `app/reader.tsx` — Імпортує `StoryScene`. Потрібна заміна.

### 3.2. Висока пріоритет: Видалення адаптерного шару

**Файли для видалення (після перенесення читача):**

| Файл | Розмір | Примітка |
|---|---|---|
| `lib/scene-record-adapter.ts` | 5.5KB | Конвертує SceneRecord ↔ StoryScene. Імпортується `canonical-scene.ts`, `runtime-story.ts` |
| `lib/runtime-story.ts` | 5.7KB | Будує `Story`/`StoryScene` з snapshot. Імпортується `story-hooks.ts`, `canonical-scene.ts` |
| `lib/canonical-scene.ts` | 1.7KB | `buildCompatibilitySceneMapFromState` — fallback для старого читача |

**Що робить кожен файл:**
- `scene-record-adapter.ts`: `sceneRecordToStoryScene()` + `storySceneToSceneRecordDraft()`. Втрачає 8/12 block types при конвертації.
- `runtime-story.ts`: `buildRuntimeSceneSnapshot()`, `buildRuntimeStorySnapshot()`, `buildRuntimeSaveSlot()`, `buildRuntimeLoadSnapshot()`, `resolvePreviewTimeline()`. Будує об'єкти `Story`/`StoryScene` для старого читача/story-hooks.
- `canonical-scene.ts`: `buildCompatibilitySceneMapFromState()` — Fallback: якщо немає SceneRecord, використовує `scenesByStory`.

**Як видалити:**
1. Перенести `buildRuntimeSaveSlot` та `buildRuntimeLoadSnapshot` логіку напряму в `story-hooks.ts` (працюючи з SceneRecord замість StoryScene)
2. Видалити adapter + runtime-story + canonical-scene
3. Оновити `stores/use-app-store.ts`: видалити `saveScene`, `addChoice`, `deleteChoice`, `scenesByStory`, `buildCanonicalSceneRecordsFromLegacyScenes`, `migrateFromLegacyKeys` (спростити)

### 3.3. Середній пріоритет: Оновление story-hooks.ts

**Файл:** `lib/story-hooks.ts` (151 LOC)

**Проблема:** `exportStory()` / `importStory()` працюють з `Story`/`StoryScene`. `StoryAutoSave` та `useStoryState` використовують `buildRuntimeStorySnapshot`.

**Зміни:**
1. `exportStory()` → експортувати SceneRecord[] замість Story
2. `importStory()` → імпортувати SceneRecord[] замість Story
3. `useStoryState()` → повертати SceneRecord[] замість сконструйованих Story
4. `StoryAutoSave` → залишити як є (він уже працює з `sceneRecordsByStory`)
5. `useStoryActions()` → видалити legacy actions (`saveScene`, `addChoice`, `deleteChoice`)

### 3.4. Низький пріоритет: Очистка types.ts

**Файл:** `lib/types.ts` (106 LOC)

**Зміни:**
- Перенести `Choice` → використовувати `ChoiceOption` з `engine/types`
- Перенести `PlaybackState` → `engine/types.ts` або `story-domain.ts`
- Перенести `SaveSlot` → `story-domain.ts`
- `UserSettings` → вже є в `user-settings.ts`
- Видалити `StoryScene`, `Story`

---

## 4. Порядок виконання

### Крок 1: Перенесення читача (Складно: висока)
**Час: 4-6 годин**

1. Оновити `components/story-reader-responsive.tsx` — замінити StoryScene → SceneRecord
2. Оновити `hooks/useReaderInitialization.ts` — (вже майже готово, є canonical тест)
3. Оновити `app/reader.tsx` — приймати SceneRecord замість StoryScene
4. Протестувати: PlayMode → StoryReaderResponsive → transitions → end

### Крок 2: Видалення адаптерів (Складно: середня)
**Час: 2-3 години**

1. Перенести `buildRuntimeSaveSlot` / `buildRuntimeLoadSnapshot` логіку в `story-hooks.ts`
2. Видалити `lib/scene-record-adapter.ts`
3. Видалити `lib/runtime-story.ts`
4. Видалити `lib/canonical-scene.ts`
5. Перевірити компіляцію

### Крок 3: Очистка store (Складно: середня)
**Час: 2-3 години**

1. Видалити `scenesByStory` з `AppState`
2. Видалити legacy actions: `saveScene`, `addChoice`, `deleteChoice`
3. Спростити `migrateFromLegacyKeys` — прибрати завантаження `STORAGE_KEYS.SCENES`
4. Оновити `partialize` — прибрати `scenesByStory`
5. Перевірити компіляцію

### Крок 4: Оновление story-hooks.ts (Складно: низька)
**Час: 1-2 години**

1. Переписати `exportStory` / `importStory` на SceneRecord[]
2. `useStoryState` — повертати SceneRecord[] замість Story[]
3. Видалити legacy actions з `useStoryActions`

### Крок 5: Фінальна зачистка (Складно: низька)
**Час: 1 година**

1. Видалити `StoryScene`, `Story` з `lib/types.ts`
2. Перенести решту типів
3. Видалити застарілі тести (scene-record-adapter, runtime-story)
4. Фінальна перевірка компіляції

---

## 5. Підсумок

| Крок | Що робимо | Файлів змінено/видалено | Час |
|---|---|---|---|
| 0 (зроблено) | Видалено мертвий код (Lego/Atom/Molecule) | 22 видалено | 30 хв |
| 1 | Читач → нова модель | ~5 змінено | 4-6 год |
| 2 | Видалення адаптерів | 3 видалено + 2 змінено | 2-3 год |
| 3 | Очистка store | 1 змінено (~100 рядків) | 2-3 год |
| 4 | Оновление story-hooks | 1 змінено (~50 рядків) | 1-2 год |
| 5 | Фінальна зачистка | 3-5 видалено/змінено | 1 год |
| **Разом** | | **~35 файлів** | **~11-16 год** |

## Пов'язані сторінки

- [[architecture-reference|Архітектурна довідка]]
- [[block-types-reference|Довідник типів блоків]]
- [[block-system-migration-note|Пояснювальна записка міграції]]
- [[stores-reference|Довідник Zustand store]]
- [[migration-guide|Гайд міграції]]
