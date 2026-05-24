# Журнал змін — 16 травня 2026

## Огляд сесії
Рефакторинг prop drilling (SceneEditorForm → SceneEditorContext) та оптимізація Zustand селекторів для запобігання каскадним ре-рендерам.

## Зміни

### SceneEditorForm — Context замість 28 пропсів
- **НОВИЙ** `components/editors/StorySceneEditor/SceneEditorContext.tsx`: `SceneEditorState` (9 полів), `SceneEditorActions` (19 колбеків), `SceneEditorProvider`, `useSceneEditorContext()`
- `components/editors/StorySceneEditor/SceneEditorForm.tsx`: видалено 28 пропсів, читання з контексту
- `app/scene-editor.tsx`: обгорнуто в `<SceneEditorProvider>`
- `components/node-editor/SceneEditorPanel.tsx`: обгорнуто в `<SceneEditorProvider>`

### Zustand scene-store — селектори
- `stores/scene-store.ts`: додано `selectScenes`, `selectActiveSceneId`, `selectSceneById(id)`, `selectActiveScene`, `selectSceneIds`, `selectSceneCount` + експорт `shallow`
- `components/lego-editor/TimelineEditor.tsx`: `scenes.find()` → `selectSceneById(sceneId)` — ре-рендер тільки при зміні цільової сцени
- `lib/scene-persistence.ts`: два підписки об'єднано в один з `shallow`
- `hooks/lego/useSceneManagement.ts`, `useLegoDnD.ts`: named селектори

### Character library — debounce персистентності
- `hooks/use-character-library.ts`: додано `setTimeout`/`clearTimeout` debounce (500ms) на запис в AsyncStorage — запобігає запису всього масиву при кожній мутації

### useSceneEditorMedia — додано libraryTarget state
- `hooks/useSceneEditorMedia.ts`: додано `useState<string | null>` для `libraryTarget` (був `undefined` в рантаймі)

### Scene-editor — декомпозиція станів
- **НОВИЙ** `hooks/useSceneData.ts`: винесено 10 станів сцени (scene, sceneText, backgroundUri, voiceUri, musicUri, splashConfig, interactiveObjects, sceneBlocks, sceneRoot, characterList) + loadSceneData + handleSaveScene
- `app/scene-editor.tsx`: 15→5 `useState`, видалено мертвий `FilePickerRow` (дублікат `MediaPickerRow`), спрощено імпорти

### useSceneEditorMedia — композиція замість дублювання
- `hooks/useSceneEditorMedia.ts`: `handlePickBg`/`handlePickAudio` тепер використовують `useFilePicker({ type: 'image' })` та `useFilePicker({ type: 'audio' })` замість прямого імпорту `expo-image-picker`/`expo-document-picker`

### ErrorHandler — заміна __DEV__ console.error у catch-блоках
- 17 файлів, 38 catch-блоків: `if (__DEV__) console.error/warn(...)` → `ErrorHandler.handle(...)`
- Тепер у production помилки не ковтаються мовчки, а передаються listener'ам

### PanResponder — стабілізація через refs
- `components/block-editor/BlockFlowCanvas.tsx`: `panResponder` більше не залежить від `connectionDrag` (ref замість state)
- `handleConnectionMove`: `useCallback([], [])` — читає `connectionDragRef.current` та `viewportRef.current`

### Wiki
- **НОВИЙ** `wiki/2026-05-16-session-report.md`
- **Оновлено** `wiki/index.md`: дата, посилання на новий звіт

## Пов'язані сторінки
[[2026-05-16-session-report|Звіт сесії 2026-05-16]]
[[index|Головна сторінка wiki]]
