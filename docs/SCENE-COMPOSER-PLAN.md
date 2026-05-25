# Детальний план: Scene Composer (Stage 5) — REVISED

**Дата:** 25 травня 2026
**Поточний стан:** ~85% інфраструктури готово. Потрібно довести до ладу існуюче + реалізувати ключові відсутні частини.

---

## Що ВЖЕ ГОТОВО (перевірено в коді)

### Блоки (12 типів) — ✅ Всі реалізовані в PropertiesPanel

| Тип блоку | PropertiesPanel | TimelinePanel inline | Статус |
|-----------|----------------|---------------------|--------|
| **Background** | ✅ Asset picker, transition, duration | ✅ Превью asset + transition | Готово |
| **Character** | ✅ Character, sprite, position, entrance, delay, duration | ✅ Превью character + position | Готово |
| **Text/Narration** | ✅ Content, anchor, typewriter speed | ✅ Превью тексту | Готово |
| **Dialogue** | ✅ Multiple speakers, character+text per entry, "+ Add Speaker" | ✅ Превью speaker + text | Готово |
| **Choice** | ✅ Multiple options, target scene, "+ Add Choice" | ✅ Превью options | Готово |
| **Effect** | ✅ Type (shake/flash/blur/rain/snow/glitch/vignette), target, intensity, duration | ✅ Превью type + target | Готово |
| **Music** | ✅ Asset, action, volume, loop, fade duration | ✅ Превью asset + action | Готово |
| **Sound** | ✅ Asset, action, volume, loop, pitch variation | ✅ Превью asset + action | Готово |
| **Interactive Object** | ✅ Name, sprite, position X/Y, width/height, pulse, one-time | ✅ Превью name + position | Готово |
| **Camera** | ✅ Action (zoom/pan/focus/reset), zoom level, duration, easing | ✅ Превью action + zoom | Готово |
| **Variable** | ✅ Name, operation (set/add/subtract/multiply/toggle), value | ✅ Превью name + operation + value | Готово |
| **Transition** | ✅ Target scene, transition type, duration | ✅ Превью target + type | Готово |

### Інші компоненти — ✅ Готово

| Компонент | Статус | Примітки |
|-----------|--------|----------|
| **SceneComposer** (3-panel layout) | ✅ Готово | Desktop: 3 панелі, Phone: tab-based |
| **BlockLibraryPanel** | ✅ Готово | 12 блоків, пошук, кольорові іконки |
| **TimelinePanel** | ✅ Готово | Vertical list, inline preview, collapse/expand, delete, duplicate |
| **PropertiesPanel** | ✅ Готово | 12 форм з усіма полями |
| **MiniPreview** | ✅ Готово | Live preview з computeSceneState |
| **PreviewScreen** | ✅ Готово | Full-screen preview |
| **StoryFlowScreen** | ✅ Готово | Node graph сцен |
| **AssetPicker** | ✅ Готово | Modal для вибору асетів |
| **CharacterCreator** | ✅ Готово | Створення персонажів |
| **SceneSelector** | ✅ Готово | Список сцен + шаблони |
| **SceneManager** | ✅ Готово | CRUD сцен |
| **PlayMode** | ✅ Готово | Режим гри |
| **useEditorStore** | ✅ Готово | CRUD + undo/redo + selection |
| **useAutoSave** | ✅ Готово | Debounced auto-save для runtime |
| **character-animator** | ✅ Готово | Animated API: fade, slide, zoom, shake |
| **event-factory** | ✅ Готово | Factory для 12 типів блоків |
| **engine/types** | ✅ Готово | 12 типів + BLOCK_TYPE_INFO |

---

## Що ПОТРІБНО ЗРОБИТИ

### Етап 1: Drag-and-Drop для Timeline (критичний)

**Проблема:** Блоки в TimelinePanel зараз відображаються як список, але не можна переставити їх місцями. Порядок блоків = порядок виконання в грі.

**Що робити:**
1. Додати drag handle (⠿) на кожен блок в TimelinePanel
2. Реалізувати drag-and-drop через PanResponder або react-native-draggable-flatlist
3. Візуальний drop indicator (лінія між блоками)
4. Auto-scroll при перетягуванні до краю
5. Збереження нового порядку через `store.moveBlock(fromIndex, toIndex)`
6. Undo для перестановки

**Оцінка:** 2-3 дні

---

### Етап 2: Імпорт/Експорт проектів (важливий)

**Проблема:** Користувачі хочуть ділитися проектами, імпортувати з Ren'Py, експортувати на інші платформи.

**Що робити:**

1. **Експорт .vne** (JSON формат):
   - Серіалізація всього проекту (scenes, characters, assets, variables)
   - Кнопка "Export Project" → файл .vne
   - Кнопка "Export Scene" → файл .vnscene

2. **Імпорт .vne**:
   - Відкриття файлу .vne
   - Валідація структури
   - Імпорт в поточний проект або створення нового

3. **Імпорт з Ren'Py (.rpy)**:
   - Парсинг Ren'Py script (dialogue, characters, labels)
   - Конвертація в event-based format
   - Базовий імпорт: dialogue + characters + labels → scenes

4. **Імпорт з Twine (.twee)**:
   - Парсинг Twine format
   - Конвертація passages → scenes
   - Конвертація links → choices

**Оцінка:** 3-4 дні

---

### Етап 3: Покращення існуючих компонентів (доведення до ладу)

**Проблема:** Деякі компоненти працюють, але потребують полірування.

**Що робити:**

3.1 **PropertiesPanel — покращення UX:**
   - Замість TextInput для character/sprite — використовувати повноцінний picker з превью
   - Валідація обов'язкових полів (червоний border якщо порожнє)
   - Кнопка "Preview" для перевірки результату

3.2 **TimelinePanel — покращення UX:**
   - Кольорова індикація стану (enabled/disabled)
   - Анімація collapse/expand
   - Кнопка "Move Up/Down" як альтернатива drag-and-drop

3.3 **MiniPreview — покращення:**
   - Реал-time оновлення при зміні блоку (зараз може бути затримка)
   - Показ фону + спрайтів персонажів (зараз тільки текстовий превью)
   - Кнопка "Expand to Full Preview"

3.4 **BlockLibraryPanel — покращення:**
   - Групування блоків за категоріями (Scene, Characters, Dialogue, Logic, Media, Effects)
   - Підказки при наведенні (tooltip з описом)
   - Лічильник використаних блоків

**Оцінка:** 2-3 дні

---

### Етап 4: Flow Analysis (пізніше)

**Проблема:** В складних проектах з 50+ сцен легко зробити помилку.

**Що робити:**
1. Аналіз графу сцен на помилки:
   - Dead ends (сцени без виходу)
   - Unreachable scenes (немає шляху від start)
   - Broken routes (choice вказує на видалену сцену)
2. UI: червоні іконки ⚠️ на StoryFlowScreen
3. Кнопка "Fix" для автоматичного виправлення

**Оцінка:** 1-2 дні

---

## Порядок реалізації

| Етап | Що робити | Оцінка | Пріоритет |
|------|-----------|--------|-----------|
| **1** | Drag-and-Drop для Timeline | 2-3 дні | 🔴 Критичний |
| **2** | Імпорт/Експорт (.vne, .rpy, .twee) | 3-4 дні | 🟡 Важливий |
| **3** | Полірування існуючих компонентів | 2-3 дні | 🟡 Важливий |
| **4** | Flow Analysis | 1-2 дні | 🔵 Пізніше |

**Загалом: 8-12 робочих днів**

---

## Файли для змін

### Нові файли:
```
components/editor/
  TimelinePanel.tsx     [ЗМІНИТИ] — додати drag-and-drop
  PropertiesPanel.tsx   [ЗМІНИТИ] — покращити picker + валідацію
  MiniPreview.tsx       [ЗМІНИТИ] — покращити real-time preview

lib/engine/
  export.ts             [НОВИЙ] — експорт .vne
  import.ts             [НОВИЙ] — імпорт .vne, .rpy, .twee
  flow-analysis.ts      [НОВИЙ] — аналіз графу сцен
```

---

## Визначення "Done"

Scene Composer вважається готовим, коли:

- [ ] Користувач може переставляти блоки місцями (drag-and-drop)
- [ ] Користувач може експортувати проект у .vne файл
- [ ] Користувач може імпортувати .vne файл
- [ ] Користувач може імпортувати Ren'Py скрипт (.rpy)
- [ ] PropertiesPanel має валідацію обов'язкових полів
- [ ] MiniPreview показує фон + спрайти персонажів
- [ ] BlockLibraryPanel має групування за категоріями

---

*Документ створено на основі реального стану коду (перевірено 25.05.2026)*
