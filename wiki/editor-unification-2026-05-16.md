# Об'єднання систем редагування в одну Lego

**Дата:** 2026-05-16
**План:** [[editor-unification-plan|План об'єднання]]

---

## Видалено файли

### Block система (16 файлів):
```
components/block-editor/BlockCard.tsx
components/block-editor/BlockConfigPanel.tsx
components/block-editor/BlockConnectionPort.tsx
components/block-editor/BlockFlowCanvas.tsx
components/block-editor/BlockPalette.tsx
components/block-editor/BlockPickerModal.tsx
components/block-editor/BlockToolbar.tsx
components/block-editor/index.ts
components/block-editor/types.ts
components/scene-editor/BlocksTab.tsx
components/BlockCanvas.tsx
components/BlockNode.tsx
components/BlockTreeEditor.tsx
components/SnippetLibrary.tsx
lib/block-types.ts
lib/block-schemas.ts
lib/block-registry.ts
lib/block-tree.ts
lib/storage.ts
lib/scene-groups.ts
app/editor-blocks.tsx
__tests__/unit/block-schemas.test.ts
__tests__/unit/block-tree.test.ts
__tests__/unit/storage.test.ts
```

### Node система (7 файлів):
```
components/node-editor/NodeCanvas.tsx
components/node-editor/SceneEditorPanel.tsx
components/node-editor/StoryNode.tsx
components/node-editor/index.ts
components/node-editor/types.ts
app/node-editor.tsx
lib/layout.ts
```

### Загалом: 25+ файлів видалено

---

## Оновлено файли

### `app/scene-editor.tsx`
- Прибрано імпорт `BlockFlowCanvas` з block-editor
- Прибрано імпорт `Block` з block-types
- Прибрано `CanvasMode` тип
- Прибрано `canvasMode` стан
- Прибрано `sceneBlocks`, `sceneRoot`, `characterList` стан
- Прибрано `renderCanvas()` функцію з режимом blocks
- Залишено тільки Lego canvas
- Прибрано перемикач "LEGO / Blocks" з UI

### `app/editor.tsx`
- Прибрано `handleOpenNodeEditor` функцію

### `stores/use-app-store.ts`
- Прибрано імпорт `Block` з block-types
- Прибрано `blockTree` поле з AppState
- Прибрано `saveBlockTree` з AppActions
- Прибрано міграцію blockTree
- Прибрано blockTree з partialize

### `lib/types.ts`
- Прибрано імпорт `Block` з block-types
- Замінено `blocks?: Block[]` на `blocks?: unknown[]`

### `hooks/useSceneData.ts`
- Прибрано імпорт `Block` та `ROOT_BLOCK` з block-types
- Прибрано `sceneBlocks`, `sceneRoot` стан
- Прибрано Block-залежний код з loadSceneData
- Прибрано sceneRoot з handleSaveScene

### `hooks/useSceneEditorActions.ts`
- Прибрано імпорт `Block` з block-types
- Прибрано `sceneRoot` з SceneSaveData
- Прибрано blocksToSave логіку з handleSaveScene

### `lib/story-validator.ts`
- Оновлено `validateUri`: прибрано file://, додано blob:, додано валідацію data:image/audio/video/font

### `__tests__/unit/story-validator.test.ts`
- Оновлено тести: file:// тепер блокується, додано тести для blob: та safe data: URIs

---

## Результат

- **Одна система редагування:** Lego
- **Один екран редактора:** `app/editor.tsx` (список історій)
- **Один екран редактора сцен:** `app/scene-editor.tsx` (Lego canvas + панель деталей)
- **Мінімум мертвого коду**
- **Простіша архітектура**

---

## Пов'язані сторінки
- [[editor-unification-plan|План об'єднання]]
- [[architecture-reference|Довідник архітектури]]
