# Журнал змін — 13 травня 2026

## Огляд сесії
Продовження рефакторингу Visual Novel Engine. Основний фокус: graph-навігація, безпека введення (XSS, path traversal) та тестування аудіо-системи.

## Зміни у Visual Novel Engine

### Навігація між сценами (`handleGraphNavigate`)
- `app/scene-editor.tsx`: `handleNavigateToScene` замінено з ручного `setState` на `router.replace()` — URL тепер оновлюється коректно
- `components/block-editor/BlockFlowCanvas.tsx`: додано опціональний проп `onSceneNavigate`, етикетки груп сцен стали `Pressable` (клік → навігація)
- `app/scene-editor.tsx`: `onSceneNavigate` передано з `SceneEditorScreen` → `BlockFlowCanvas`

### XSS-санітація (`lib/story-validator.ts`)
- Додано видалення `<svg>` елементів (включаючи inline SVG з `onload`)
- Додано видалення `<iframe>` елементів
- Додано видалення `<math>` (MathML) елементів
- Додано видалення `<foreignObject>` (SVG-embedded HTML)
- Додано видалення `<object>` та `<embed>` елементів
- Нейтралізовано CSS `expression()` → `exp_disabled()`
- Перетворено `data:text/html` → `data:text/plain`
- Додано блокування `vbscript:` протоколу
- Додано видалення подвійних event handlers (`on*` атрибути з різних форматів)

### Path Traversal захист (`lib/story-validator.ts`)
- `validateUri`: заборонено `..` у URI (прямий та URL-encoded `%2e%2e`)
- `validateUri`: перевірка null-байтів (`\0`) перед форматною валідацією
- `validateUri`: `decodeURIComponent` для виявлення замаскованих traversal-атак

### Виправлення `importStory` (`lib/story-context-enhanced.ts`)
- Тепер делегує валідацію `StoryValidator.validateStory()` замість ручної перевірки полів
- Імпортовані дані автоматично санітизуються (XSS-позбавлення)
- Коректна обробка `SyntaxError` через `ValidationError`

### Стан тестування
- **Загальна кількість**: **337/337** тестів пройдено успішно (19 файлів)
- Додано `__tests__/unit/sanitize-security.test.ts`: 22 тести (XSS: 18, path traversal: 11, sanitizeString: 3)
- Додано `__tests__/unit/audio-trigger-scheduler.test.ts`: 22 тести (execute: 7, executeByType: 3, process: 3, cancel: 2, cancelAll: 2, stopByType: 3, playbackStates: 2, cleanup: 1)
- Переписані 2 існуючих тести (`story-validator` та `story-context-enhanced`) під нову поведінку `importStory`
- Всі раніше зелені тести залишаються зеленими

## Wiki документація
- **Новий файл**: `wiki/2026-05-13-session-report.md` — детальний звіт сесії
- **Оновлено** `wiki/index.md`: додано посилання на новий звіт, змінено дату
- **Оновлено** `wiki/2026-05-12-session-report.md`: актуалізовано лічильник тестів (219→337), додано перехресне посилання

## Коміти (очікувані)

## Пов'язані сторінки
[[2026-05-13-session-report|Звіт сесії 2026-05-13]]
[[2026-05-12-session-report|Звіт сесії 2026-05-12]]
[[sanitize-security|Тести безпеки]]
[[testing-plan-2026-05-09|План тестування]]
[[log|Головний журнал подій]]