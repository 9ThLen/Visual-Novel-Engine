# Блокова система: discriminated union для Block.data

**Дата:** 2026-05-16
**Задача:** Подвійна модель даних — `Block.data` типізовано як `Record<string, unknown>` замість discriminated union

---

## Проблема

`Block.data` в `lib/block-types.ts` було `Record<string, unknown>`. Через це:

1. **12 type guard-ів** (`isDialogueData`, `isNarrationData`, ...) — майже ідентичні, тільки поля перевірки різні
2. **14 getter-ів** (`getDialogueData`, `getNarrationData`, ...) — `block.type === 'dialogue' ? (block.data as unknown as DialogueData) : undefined`
3. **Defaults визначені двічі**: в `block-registry.ts:19-214` (як `defaultData`) і в `block-types.ts:180-196` (в `createDefaultBlock`)
4. **Жодної типобезпеки** — `block.data.xyz` проходило компіляцію для будь-якого поля

## Рішення

### 1. Mapped type `BlockTypeToData`

```ts
export type BlockTypeToData = {
  dialogue: DialogueData;
  narration: NarrationData;
  show_character: ShowCharacterData;
  // ... 12 more
};
```

### 2. Discriminated union `Block`

```ts
export type Block = {
  id: string;
  collapsed?: boolean;
  x?: number;
  y?: number;
  sceneId?: string;
} & {
  [T in BlockType]: {
    type: T;
    data: BlockTypeToData[T];
    children: Block[];
  };
}[BlockType];
```

Тепер `switch (block.type)` автоматично звужує `block.data` до правильної структури:

```ts
switch (block.type) {
  case 'dialogue':
    block.data.character // ✅ типебезпечно, TS знає що це DialogueData
    block.data.text     // ✅
}
```

### 3. Єдине джерело дефолтів

```ts
export const DEFAULT_BLOCK_DATA: BlockTypeToData = {
  dialogue: { character: '', text: '' },
  play_music: { musicUri: '', loop: true, volume: 0.8 },
  // ...
};
```

Використовується в:
- `createDefaultBlock()` — створення нових блоків
- `block-registry.ts` — через `defaultData: DEFAULT_BLOCK_DATA.dialogue as Record<string, unknown>`

### 4. Видалено

- 12 type guard-ів (`isDialogueData`, `isNarrationData`, ...)
- 14 getter-ів (`getDialogueData`, `getNarrationData`, ...)
- `BlockDataRecord` (alias для `Record<string, unknown>`)
- Дубльовані object literals для defaultData з block-registry.ts
- `BlockData` union type (замінений на `BlockTypeToData[BlockType]`)

## Змінені файли

| Файл | Зміна |
|---|---|
| `lib/block-types.ts` | +`BlockTypeToData`, +`DEFAULT_BLOCK_DATA`, discriminated union `Block`, -type guards, -getters, -`BlockDataRecord` |
| `lib/block-registry.ts` | `defaultData` посилається на `DEFAULT_BLOCK_DATA` |
| `components/block-editor/BlockCard.tsx` | Прибрано getter-import, `getSummaryText` використовує `block.data.X` напряму |
| `components/block-editor/BlockConfigPanel.tsx` | Прибрано getter-import (ніде не використовувались) |
| `__tests__/unit/block-tree.test.ts` | `makeBlock` helper: `as Block` cast для discriminated union |

## Підсумок

- **~120 рядків бойлерплейту видалено**
- **0 нових TS-помилок** (22 pre-existing помилки в 3 зламаних файлах не змінено)
- Код типобезпечний — звернення до неіснуючого поля на `block.data` тепер помилка компіляції
- **Зворотна сумісність збережена** — `as Record<string, any>` cast в `BlockConfigPanel.tsx`, `BlockNode.tsx`, `BlockCanvas.tsx` продовжує працювати

## Що не змінювали

- `atom-types.ts` — окрема система (`AtomBlock` з `AtomData`), аналогічний рефакторинг можна зробити окремо
- `block-schemas.ts` — `validateBlockData` приймає `Record<string, unknown>`, це окремий API для валідації
- `block-tree.ts` — `updateBlockData(root, path, data: Record<string, any>)` залишено як є
- `scene-store.ts` — окремий Zustand store, не пов'язаний з block-types
