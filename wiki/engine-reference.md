# Engine Reference

## useSceneExecutor

Центральний хук-виконавець сцен. Примає `TimelineStep[]`, повертає `{ sceneState, currentStepIndex, isComplete, isTyping, canAdvance, advance, selectChoice }`.

**Yielding блоки** (зупиняють виконання): `text`, `dialogue`, `choice`, `transition`
**Non-yielding блоки** (автоматично виконуються): `set_variable`, `set_background`, `set_character`, `play_music`, `play_sound`, `camera`, `interactive_object`, `sound`

**Використання:**
```typescript
const executor = useSceneExecutor(timeline);
// executor.sceneState — поточний стан сцени (фон, персонажі, музика, змінні)
// executor.canAdvance — чи можна перейти до наступного кроку
// executor.advance() — перейти до наступного кроку
// executor.selectChoice(index) — обрати варіант (для choice блоків)
// executor.isTyping — чи активний ефект друку
// executor.isComplete — чи завершена сцена
```

## conditionUtils

Pure function `conditionsMet(conditions, variables)` з 8 операторами: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `has`, `not_has`.

**Використання:**
```typescript
import { conditionsMet } from '@/lib/engine/conditionUtils';

const visible = conditionsMet(block.conditions, sceneState.variables);
// true — всі умови виконані
// false — хоча б одна умова не виконана
// undefined/empty conditions — завди true
```

**Оператори:**
| Оператор | Опис | Приклад |
|----------|------|---------|
| `eq` | Рівно | `{ var: "mood", op: "eq", value: "happy" }` |
| `neq` | Не рівно | `{ var: "mood", op: "neq", value: "sad" }` |
| `gt` | Більше | `{ var: "score", op: "gt", value: 10 }` |
| `gte` | Більше або рівно | `{ var: "score", op: "gte", value: 10 }` |
| `lt` | Менше | `{ var: "score", op: "lt", value: 10 }` |
| `lte` | Менше або рівно | `{ var: "score", op: "lte", value: 10 }` |
| `has` | Містить (масив) | `{ var: "items", op: "has", value: "key" }` |
| `not_has` | Не містить (масив) | `{ var: "items", op: "not_has", value: "key" }` |

## Пов'язані сторінки

- [[architecture-reference]] — Архітектурна довідка
- [[hooks-reference]] — Довідка хуків
- [[block-types-reference]] — Типи блоків
- [[components-reference]] — Компоненти
