# Інтеграція react-native-reanimated-dnd

**Дата:** 2026-05-09
**Статус:** Завершено
**Тести:** 219/219 (16 нових DnD тестів)

## Зміни

### 1. Встановлення бібліотеки
- `react-native-reanimated-dnd@2.0.0` (entropyconquers)
- Peer deps: react-native-reanimated >=4.2.0, react-native-gesture-handler >=2.28.0, react-native-worklets >=0.7.0
- Встановлено через `pnpm add react-native-reanimated-dnd`

### 2. TimelineEditor — горизонтальний drag-and-drop
**Файл:** `components/lego-editor/TimelineEditor.tsx`
- Використано `HorizontalSortable` + `DropProvider` з react-native-reanimated-dnd
- Події на таймлайні можна перетягувати для зміни порядку
- При перестановці автоматично перераховуються `startTime` для всіх подій
- Збережено адаптивність для планшетів (більші блоки, padding)
- Детальний вид подій під sortable-зоною

### 3. LegoCanvas — cross-scene drag підказка
**Файл:** `components/lego-editor/LegoCanvas.tsx`
- Додано проп `sceneId` для ідентифікації поточної сцени
- При перетягуванні атома з'являється badge "drop on scene"
- Збережено магнітний snap між атомами
- Empty state з підказкою про drag між сценами

### 4. LegoEditor — Droppable зони для сцен
**Файл:** `app/lego-editor.tsx`
- `DropProvider` обгортає весь екран
- Кожна картка сцени в sidebar — `Droppable` зона
- При drop елемента на іншу сцену:
  - Елемент додається до цільової сцени
  - Видаляється з вихідної
  - Haptic feedback (success)
- Зелена підсвітка при hover над drop-зоною

### 5. Виправлення тестів
- **storage.test.ts:** Ключ `block_tree` → `vne_block_tree` (відповідно до STORAGE_KEYS)
- **audio-manager.test.ts:** Імпорт з `audio-manager-enhanced` замість видаленого `audio-manager`
- **vitest.config.ts:** `tsconfigRaw` замість extends expo/tsconfig.base (Vite не резолвить)
- **tsconfig.json:** `module: "esnext"` замість `"preserve"` (сумісний з Vite + bundler)

### 6. Нові тести
**Файл:** `__tests__/unit/drag-drop-integration.test.ts` (16 тестів)
- Magnetic Snap Logic (5 тестів)
- Cross-Scene Drop (3 тести)
- Timeline Reorder (4 тести)
- react-native-reanimated-dnd Mocks (4 тести)

## Використані компоненти react-native-reanimated-dnd
| Компонент | Використання |
|-----------|-------------|
| `HorizontalSortable` | TimelineEditor — reorder подій |
| `DropProvider` | LegoEditor — контекст для drop |
| `Droppable` | Картки сцен — прийом елементів |
| `useDraggable` | (hook) — готовий для розширення |
| `useHorizontalSortable` | (hook) — готовий для розширення |

## Пов'язані сторінки
[[tsconfig-errors-analysis-2026-05-08]]
[[recommendations-implementation-2026-05-08]]
[[tablet-adaptation-plan-stage5]]
