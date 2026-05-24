# Робота 2026-05-13 — Навігація, Безпека, Аудіо-тести

## Огляд

Продовження рефакторингу Visual Novel Engine. Основний фокус: graph-навігація, безпека введення та тестування аудіо-системи.

## Виконано

### 1. Навігація між сценами (`handleGraphNavigate`)

**Проблема:** `handleNavigateToScene` лише оновлював локальний стан компонента, не змінюючи URL. Це не давало коректної роботи браузерної навігації (Back/Forward) та не перезавантажувало дані сцени з URL.

**Рішення:**
- `handleNavigateToScene` тепер використовує `router.replace()` — зберігає стан у URL
- `SceneEditorScreen` передає `onSceneNavigate` через пропс `BlockFlowCanvas`
- Етикетки груп сцен у `BlockFlowCanvas` стали `Pressable` — клік по назві сцени перенаправляє в редактор

**Змінені файли:**
- `app/scene-editor.tsx` — `handleNavigateToScene` → `router.replace()`
- `components/block-editor/BlockFlowCanvas.tsx` — новий проп `onSceneNavigate`, `View` → `Pressable` для груп

### 2. XSS-санітація (`story-validator.ts`)

**Додано захист від:**
- `<svg>` елементів (включаючи inline SVG з `onload`)
- `<iframe>` елементів
- `<math>` (MathML) елементів
- `<foreignObject>` (SVG-embedded HTML)
- `<object>` та `<embed>` елементів
- CSS `expression()` — нейтралізовано → `exp_disabled()`
- `data:text/html` — перетворено на `data:text/plain`
- `vbscript:` протокол
- Подвійних event handlers (`on*` атрибути)

### 3. Path Traversal захист (`validateUri`)

- Заборонено `..` у URI (прямий та encoded `%2e%2e%2f`)
- Перевірка null-байтів (`\0`) у URI
- Використання `decodeURIComponent` для виявлення замаскованих traversal

### 4. Виправлення `importStory`

- Тепер використовує `StoryValidator.validateStory()` замість ручної перевірки
- Імпортовані дані автоматично санітизуються
- Коректна обробка `SyntaxError`

### 5. Нові тести

**`__tests__/unit/sanitize-security.test.ts`** — 30 тестів:
- 17 тестів XSS-санітації (script, svg, iframe, math, foreignObject, object, embed, event handlers, expression, data:text/html)
- 11 тестів path traversal (direct, encoded, mixed, null byte)
- 3 тести `sanitizeString`

**`__tests__/unit/audio-trigger-scheduler.test.ts`** — 22 тести:
- `executeTrigger` (7): immediate, delayed, missing item, track ID, stopPrevious, fadeIn, cancel
- `executeTriggersByType` (3): matching, empty array, no match
- `processTriggers` (3): concurrent, empty, null
- `cancelTrigger` / `cancelAllTriggers` (3)
- `stopByType` (3): matching type, other types, no active tracks
- `getPlaybackStates` (2): idle, active
- `cleanup` (1)

## Результат

| Метрика | До | Після |
|---|---|---|
| Зелені тести | 315 | **337** |
| Файли тестів | 18 | **19** |
| Безпека: XSS | ❌ | ✅ |
| Безпека: Path Traversal | ❌ | ✅ |
| Навігація графу | ❌ (manual state) | ✅ (router.push) |

## Наступні кроки

1. Оновити CHANGELOG_2026_05_12.md
2. Оновити `2026-05-12-session-report.md` (змінити counts)
3. Навігація з `BlockConfigPanel` (choice target → navigate)
4. Навігація з `ChoiceEditor` (вже реалізовано через `onSceneNavigate`)