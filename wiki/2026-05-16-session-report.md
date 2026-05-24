# Робота 2026-05-16 — Prop Drilling → Context, Zustand селектори, Code Quality Fixes

## Огляд

Рефакторинг ключових проблем продуктивності та якості коду: `SceneEditorForm` (28 пропсів), `scene-store` (каскадні ре-рендери), character library (persist без debounce), scene-editor (17 useState), дублювання пікерів, `__DEV__` console в catch-блоках, PanResponder на кожен drag.

## Виконано

### 1. SceneEditorForm — 28 пропсів → SceneEditorContext

**Проблема:** `SceneEditorForm` отримував 28 індивідуальних пропсів (9 станів + 19 колбеків). Кожен новий споживач вимагав дублювання всіх пропсів.

**Рішення:** Створено `SceneEditorContext` з двома композитними об'єктами:
- `SceneEditorState` — всі поля даних
- `SceneEditorActions` — всі колбеки

**Змінені файли:**
- **НОВИЙ** `components/editors/StorySceneEditor/SceneEditorContext.tsx` — context, provider, types, `useSceneEditorContext()` хук
- `components/editors/StorySceneEditor/SceneEditorForm.tsx` — 0 пропсів, читає все з контексту
- `app/scene-editor.tsx` — обгорнуто в `<SceneEditorProvider>`
- `components/node-editor/SceneEditorPanel.tsx` — обгорнуто в `<SceneEditorProvider>`

### 2. Zustand scene-store — named селектори + shallow

**Проблема:** Всі підписники `scene-store` отримували весь масив `scenes`. Кожна мутація (`.map()`) створювала новий масив, викликаючи каскадні ре-рендери в усіх компонентах.

**Рішення:**
- Додано 6 named селекторів для granular subscriptions
- Додано експорт `shallow` для комбінування кількох полів
- Найважливіше: `selectSceneById(id)` — компонент підписується на одну сцену, ігнорує зміни інших

**Змінені файли:**
- `stores/scene-store.ts` — **6 selector functions** + експорт `shallow`:
  - `selectScenes`, `selectActiveSceneId`
  - `selectSceneById(id)` — selector creator
  - `selectActiveScene` — деривація
  - `selectSceneIds`, `selectSceneCount`
- `components/lego-editor/TimelineEditor.tsx` — **головна оптимізація**: `scenes.find()` → `selectSceneById(sceneId)`
- `lib/scene-persistence.ts` — два підписки об'єднано в один з `shallow`
- `hooks/lego/useSceneManagement.ts` — переведено на named селектори
- `hooks/lego/useLegoDnD.ts` — переведено на named селектори

### 3. Character library — debounce персистентності

**Проблема:** `useEffect` в `use-character-library.ts` записував весь масив персонажів в AsyncStorage при кожній зміні, без дебаунсу.

**Рішення:** Додано `setTimeout`/`clearTimeout` з 500ms затримкою.

**Файли:**
- `hooks/use-character-library.ts` — lines 35-38: debounce через `setTimeout` + `clearTimeout` cleanup

### 4. Баг: setLibraryTarget не визначено

**Проблема:** `hooks/useSceneEditorMedia.ts` повертав `setLibraryTarget`, яке не було оголошено — в рантаймі `undefined`, виклик ламався.

**Рішення:** Додано `const [libraryTarget, setLibraryTarget] = useState<string | null>(null)`.

**Файли:**
- `hooks/useSceneEditorMedia.ts` — line 8: додано стан, line 64: повернення `libraryTarget`

### 5. Scene-editor: 17 useState → декомпозиція

**Проблема:** `app/scene-editor.tsx` мав 15 `useState` + 1 `useRef` + мертвий `FilePickerRow` (дублікат `MediaPickerRow`).

**Рішення:**
- Створено `hooks/useSceneData.ts` — 10 станів сцени + `loadSceneData` + `handleSaveScene`
- У `scene-editor.tsx` залишилось 5 `useState` + 1 `useRef`
- Видалено мертвий `FilePickerRow`

**Файли:**
- **НОВИЙ** `hooks/useSceneData.ts`
- `app/scene-editor.tsx` — спрощено з 15→5 useState, оновлено імпорти

### 6. Дублювання пікерів → композиція

**Проблема:** `useSceneEditorMedia` дублював логіку `useFilePicker` (ImagePicker/DocumentPicker).

**Рішення:** `useSceneEditorMedia` тепер композує `useFilePicker({ type: 'image' })` та `useFilePicker({ type: 'audio' })`.

**Файли:**
- `hooks/useSceneEditorMedia.ts` — прибрано `expo-image-picker` (крім permissions), `expo-document-picker`

### 7. __DEV__ console.error → ErrorHandler.handle()

**Проблема:** У 38 catch-блоках помилки логувались тільки в `__DEV__`, в production ковтались мовчки.

**Рішення:** Замінено `if (__DEV__) console.error/warn(...)` на `ErrorHandler.handle(...)`, який логує в dev + передає listener'ам у production.

**Файли (17):**
- `lib/audio-library.ts` (9), `lib/_core/auth.ts` (6), `lib/_core/api.ts` (3)
- `lib/asset-resolver.ts` (2), `lib/error-handler.ts` (2)
- `lib/audio-trigger-scheduler.ts` (3), `lib/audio-player-service.ts` (2)
- `lib/scene-persistence.ts` (1)
- `hooks/use-auth.ts` (2), `hooks/useSceneEditorActions.ts` (1)
- `hooks/useReaderInitialization.ts` (1), `hooks/useReaderAudio.ts` (1)
- `app/oauth/callback.tsx` (1), `app/tabs/index.tsx` (1)
- `components/story-reader-responsive.tsx` (1), `components/external-link.tsx` (1)
- `stores/use-app-store.ts` (1)

### 8. PanResponder перестворюється на кожен connectionDrag

**Проблема:** `useMemo` для `PanResponder.create()` в `BlockFlowCanvas.tsx` залежав від `connectionDrag`. Кожен тач-мув під час дрягу → `setConnectionDrag` → ререндер → новий PanResponder.

**Рішення:** Додано `connectionDragRef`, callbacks читають `ref.current` замість state. `handleConnectionMove` — `useCallback([], [])`.

**Файли:**
- `components/block-editor/BlockFlowCanvas.tsx` — lines 103-119: refs, lines 222-234: стабільний `handleConnectionMove`, lines 287-318: PanResponder без `connectionDrag` в deps

## Стан проекту після змін

- `tsc --noEmit` — лише передіснуючі помилки (oauth, FogEffect, useLegoTabs)
- Жодних нових TypeScript помилок не додано
- API повністю зворотньо сумісний

## Пов'язані сторінки
[[index|Головна сторінка wiki]]
[[CHANGELOG_2026_05_16|Журнал змін 2026-05-16]]
