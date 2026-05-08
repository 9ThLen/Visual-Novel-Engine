# План на наступну сесію (2026-05-10+)

**Дата створення:** 2026-05-09
**Статус:** Очікує виконання
**Поточний стан проєкту:** 219/219 тестів, LEGO-система реалізована, DnD інтегровано

---

## Що вже зроблено (попередні сесії)

- [x] LEGO Block System (8 етапів, атоми/молекули/сцени/граф)
- [x] Drag-and-Drop (react-native-reanimated-dnd@2.0.0)
- [x] TimelineEditor з HorizontalSortable
- [x] Cross-scene drag (Droppable зони на картках сцен)
- [x] Планшетна адаптація (useResponsiveLayout, split view)
- [x] Auto-save + export/import (scene-persistence.ts)
- [x] Tooltip + TourGuide
- [x] UI/UX покращення (анімації, кольори, фідбек)
- [x] vitest.config.ts з tsconfigRaw (обхід expo/tsconfig.base)

---

## Пріоритетні завдання

### 1. Тестування на реальному пристрої (Критично)
**Проблема:** Жоден компонент не тестувався на реальному телефоні/планшеті.

**Кроки:**
- [ ] Запустити `npx expo start --tunnel` з WSL
- [ ] Підключитися через Expo Go на телефоні
- [ ] Перевірити LEGO Editor: Canvas (drag атомів, snap), Timeline (reorder), Graph
- [ ] Перевірити cross-scene drag-and-drop
- [ ] Перевірити автозбереження та експорт/імпорт
- [ ] Зафіксувати runtime-помилки та виправити
- [ ] Протестувати на планшеті (split view, landscape)

**Відомі проблеми:**
- WSL2 NAT -- потрібен `--tunnel` режим
- Expo Go може мати обмеження з нативними модулями

---

### 2. Покращення DnD інтеграції (Високий)
**Що зроблено:** Базова інтеграція HorizontalSortable + Droppable.
**Що залишилось:**

- [ ] **Draggable атоми на canvas** -- зараз LegoCanvas використовує кастомний Pan gesture (магнітний snap), але не інтегрований з react-native-reanimated-dnd `Draggable`. Потрібно або:
  - обгорнути `DraggableAtom` у `Draggable` для cross-scene перетягування (проблема: два gesture handler-и конфліктуватимуть), або
  - реалізувати cross-scene drag через long-press → підняття → drop на сцену (окремий режим)
- [ ] **Drag handle для атомів** -- додати маленьку ручку зверху атома для активації cross-scene drag
- [ ] **Анімація при drop на сцену** -- плавне зникнення з canvas + поява в цільовій сцені
- [ ] **Undo/Redo** для drag-and-drop операцій (включно cross-scene)

---

### 3. Рефакторинг BlockFlowCanvas (Середній)
**Проблема:** `components/block-flow-canvas.tsx` -- 850 рядків, монолітний компонент.

**План декомпозиції:**
- [ ] Виділити `BlockNode` компонент
- [ ] Виділити `ConnectionLine` компонент
- [ ] Виділити `BlockTree` компонент
- [ ] Створити хуки: `useBlockTree()`, `useBlockDrag()`, `useBlockSelect()`
- [ ] Написати тести для нових компонентів

---

### 4. LEGO Graph — візуалізація зв'язків між сценами (Середній)
**Поточний стан:** Вкладка "Graph" існує але показує placeholder.

**Завдання:**
- [ ] Створити `SceneGraphView` компонент (вузли = сцени, ребра = переходи)
- [ ] Додати drag для переставляння вузлів графу
- [ ] Додати zoom/pan для навігації по графу
- [ ] Візуалізувати зв'язки між сценами (на основі transition умов)
- [ ] Інтегрувати з scene-store

**Бібліотека:** Можна використати `react-native-reanimated-dnd SortableGrid` або кастомний Canvas

---

### 5. Покращення UI/UX (Низький)
**Незавершені елементи з попередніх планів:**

- [ ] Градієнти для атомів (візуальна глибина) -- Етап 2 кольорової схеми
- [ ] Контекстна довідка при довгому натисканні -- Етап 4 підказок
- [ ] Zoom/Pan у StoryGraph
- [ ] Анімації переходів між режимами (покращити існуючі)
- [ ] Тестування на планшетах (iPad, Android tablets) -- останній чекбокс Етапу 5

---

### 6. Розширення покриття тестами (Постійний)
**Поточний стан:** 219/219

**Ціль:** 280+ тестів

**Файли без тестів:**
- [ ] `components/block-flow-canvas.tsx` (після рефакторингу)
- [ ] `components/CharacterList.tsx`
- [ ] `components/CharacterLibraryManager.tsx`
- [ ] `lib/inventory-context.tsx`
- [ ] `lib/story-engine.ts`
- [ ] `components/InteractiveObjectsLayer.tsx`
- [ ] E2E тести (detox або аналоги)

---

### 7. Інфраструктура (Низький)
- [ ] Оновити README.md з інструкцією WSL2 + tunnel mode
- [ ] Додати `npx expo start --tunnel` у package.json scripts
- [ ] Перевірити `.gitignore` (.expo/, web-build/)
- [ ] Видалити `.bak` файли з кореня (якщо залишились)
- [ ] Legacy міграція: протестувати `lib/legacy-migration.ts` на реальних даних

---

## Відомі технічні борги

| Проблема | Файл | Пріоритет |
|----------|------|-----------|
| `expo/tsconfig.base` не резолвиться Vite | `vitest.config.ts` | Низький (обійдено через tsconfigRaw) |
| VS Code TS помилки при відкритті з Windows | `tsconfig.json` | Низький (відкривати з WSL або Remote-WSL) |
| `react-native-worklets` peer dep попередження | `package.json` | Низький (працює) |
| `nativewind/types` type definition не знайдено | `tsconfig.json` | Низький (skipLibCheck) |
| LegoCanvas + Draggable gesture конфлікт | `LegoCanvas.tsx` | Високий (див. завдання 2) |

---

## Очікуваний результат наступної сесії

1. **Телефон підключено** через tunnel mode, LEGO Editor працює без runtime-помилок
2. **Cross-scene drag** повністю функціональний (drag handle + анімація)
3. **BlockFlowCanvas** частково рефакторено (виділено 2+ компоненти)
4. **280+ тестів** проходять
5. **Graph View** має базову візуалізацію (вузли + ребра)

---

## Пов'язані сторінки

[[drag-drop-integration-2026-05-09|Інтеграція DnD]]
[[recommendations-implementation-2026-05-08|Рекомендації — виконання]]
[[ui-ux-improvement-plan-2026-05-08|План UI/UX]]
[[tablet-adaptation-plan-stage5|Адаптація під планшети]]
[[lego-block-system-plan-2026-05-07|План LEGO-системи]]
[[tsconfig-errors-analysis-2026-05-08|Аналіз TS помилок]]
