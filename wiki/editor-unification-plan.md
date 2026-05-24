# План: Об'єднання трьох систем редагування в одну Lego

## Поточний стан

### Три паралельні системи:

**Lego (основна, має залишитися):**
- `components/lego-editor/` — 4 файли (LegoCanvas, StoryGraph, TimelineEditor, AtomBlockComponent)
- `hooks/lego/` — 3 файли (useLegoDnD, useLegoTabs, useSceneManagement)
- `lib/atom-types.ts`, `lib/molecule-types.ts`, `lib/scene-types.ts` — типи
- `stores/scene-store.ts` — Zustand store для сцен
- `app/editor.tsx` — головний екран редактора (список історій)
- `app/scene-editor.tsx` — екран редактора сцен (вже використовує Lego як primary)

**Block (потрібно видалити):**
- `components/block-editor/` — 9 файли (BlockFlowCanvas, BlockCard, BlockConfigPanel, BlockPalette, BlockPickerModal, BlockToolbar, BlockConnectionPort, index, types)
- `lib/block-types.ts`, `lib/block-schemas.ts`, `lib/block-registry.ts`, `lib/block-tree.ts`, `lib/storage.ts`
- `app/editor-blocks.tsx` — окремий екран
- Використовується в: `app/scene-editor.tsx` (режим BlocksTab), `components/scene-editor/BlocksTab.tsx`

**Node (потрібно видалити):**
- `components/node-editor/` — 5 файли (NodeCanvas, SceneEditorPanel, StoryNode, index, types)
- `app/node-editor.tsx` — окремий екран (594 рядки!)
- Використовується в: `app/editor.tsx` (кнопка "Node Editor")

## Що потрібно зробити

### Етап 1: Видалити Block систему
1. Видалити `components/block-editor/` (9 файлів)
2. Видалити `lib/block-types.ts`, `lib/block-schemas.ts`, `lib/block-registry.ts`, `lib/block-tree.ts`
3. Видалити `lib/storage.ts` (якщо не використовується інде)
4. Видалити `app/editor-blocks.tsx`
5. Видалити `components/scene-editor/BlocksTab.tsx`
6. Оновити `app/scene-editor.tsx` — прибрати режим "blocks", залишити тільки Lego
7. Оновити `app/editor.tsx` — прибрати посилання на Block

### Етап 2: Видалити Node систему
1. Видалити `components/node-editor/` (5 файлів)
2. Видалити `app/node-editor.tsx`
3. Оновити `app/editor.tsx` — прибрати кнопку "Node Editor"
4. Оновити `lib/layout.ts` — видалити `buildNodeLayout`, `NODE_WIDTH`, `NODE_HEIGHT`, `GRID_SIZE` (якщо не використовуються інде)

### Етап 3: Оновити конфігурацію
1. Оновити `eslint.config.mjs` — прибрати посилання на видалені файли
2. Оновити `vitest.config.ts` — прибрати видалені тести
3. Перевірити всі імпорти — видалити мертві посилання

### Етап 4: Оновити wiki
1. Оновити `wiki/architecture-reference.md`
2. Оновити `wiki/index.md`
3. Створити сторінку `wiki/editor-unification-2026-05-16.md`

### Етап 5: Перевірити
1. Запустити TypeScript компіляцію
2. Запустити тести
3. Перевірити що додаток запускається

## Файли для видалення

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
lib/block-types.ts
lib/block-schemas.ts
lib/block-registry.ts
lib/block-tree.ts
lib/storage.ts
app/editor-blocks.tsx
```

### Node система (7 файлів):
```
components/node-editor/NodeCanvas.tsx
components/node-editor/SceneEditorPanel.tsx
components/node-editor/StoryNode.tsx
components/node-editor/index.ts
components/node-editor/types.ts
app/node-editor.tsx
app/node-editor.tsx (594 рядки!)
```

### Загалом: 23 файли для видалення

## Файли для оновлення

```
app/editor.tsx — прибрати кнопку Node Editor
app/scene-editor.tsx — прибрати режим blocks, залишити тільки Lego
lib/layout.ts — видалити Node-специфічні функції
lib/story-context.tsx — перевірити імпорти
stores/use-app-store.ts — перевірити blockTree
```

## Очікуваний результат

- Одна система редагування: Lego
- Один екран редактора: `app/editor.tsx` (список історій)
- Один екран редактора сцен: `app/scene-editor.tsx` (Lego canvas + панель деталей)
- Мінімум мертвого коду
- Простіша архітектура

## Ризики

1. `lib/storage.ts` використовується в `app/editor-blocks.tsx` — потрібно видалити разом
2. `lib/block-tree.ts` містить корисні функції для роботи з деревом — потрібно перевірити чи не використовуються інде
3. `stores/use-app-store.ts` має `blockTree` поле — потрібно видалити
4. `lib/layout.ts` має `buildNodeLayout` — потрібно видалити
