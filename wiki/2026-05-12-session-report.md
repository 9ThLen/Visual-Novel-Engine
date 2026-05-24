# Звіт сесії 2026-05-12 — Аналіз проекту та перевірка TODO

## Загальний огляд проекту

**Visual Novel Engine** — крос-платформений рушій (iOS, Android, Web) для створення, редагування та відтворення інтерактивних візуальних новел.

| Параметр | Значення |
|---|---|
| Мова | TypeScript 5.7.2 (strict) |
| Фреймворк | React Native 0.81.5 + Expo SDK 54 |
| Роутинг | Expo Router 6 |
| Стилізація | NativeWind 4 (Tailwind CSS) |
| Стейт-менеджмент | React Context + useReducer (narrative) + Zustand (LEGO editor) |
| Валідація | Zod v4 |
| Тести | Vitest 2.1.9, **337/337** тестів |
| Пакетний менеджер | pnpm 9.12.0 |

## Структура

| Директорія | Призначення |
|---|---|
| `app/` | 10 екранів: editor, scene-editor, node-editor, reader, save-load, settings, tabs |
| `components/` | 30+ компонентів (ui, block-editor, lego-editor, node-editor, scene-editor, character-library, effects) |
| `lib/` | 43 файли core-логіки, типів, сервісів, валідації |
| `stores/` | Zustand store для LEGO-редактора |
| `hooks/` | 14 кастомних хуків (включно з lego-підсистемою) |
| `__tests__/` | 14 unit + 1 integration + 1 e2e тест, моки |
| `wiki/` | 50 записів — архітектура, decision records, changelog, плани |
| `assets/` | Зображення, звуки, демо-дані |

## Перевірка TODO-списку

| # | Пункт | Статус | Результат |
|---|---|---|---|
| 1 | **Konvert Tailwind (initial 4 files)** | ✅ | Конвертовано `editor.tsx`, `EditTab.tsx`, `BlockCard.tsx`, `story-reader-responsive.tsx`. 218/218 тестів. Документовано в `TAILWIND-MIGRATION-2026-05-12.md` |
| 2 | **Critical path tests** | ✅ | 219/219 тестів. Повний coverage: unit (14), integration (1), e2e (1) |
| 3 | **Вирішення двох систем стейт-менеджменту → documented** | ✅ | `STATE-MANAGEMENT-DECISION.md` — рішення залишити окремими доменами |
| 4 | **Об'єднання двох типів "Scene" → need to analyze** | ✅ | `SCENE-TYPES-DECISION.md` — аналіз завершено, вирішено НЕ об'єднувати (різні абстракції: `StoryScene` vs `Scene`) |
| 5 | **Об'єднання двох редакторів → big task** | 🔄 | Відкрито. 3 редактори (Node Editor, Scene Editor, Story Editor). LEGO інтегровано в scene-editor, але повне об'єднання не завершено |

## Ключові архітектурні рішення

### Два стейт-менеджменти (Context + Zustand)
- **Context/Reducer** — narrative runtime (історії, прогрес, збереження, налаштування)
- **Zustand** — editor-time (LEGO canvas, елементи, таймлайн)
- Рішення: **не об'єднувати** — різні домени, споживачі, формати даних

### Два типи Scene
- **`StoryScene`** (`lib/types.ts`) — контент сцени (текст, вибори, персонажі, аудіо)
- **`Scene`** (`lib/scene-types.ts`) — LEGO canvas сцена (елементи, таймлайн)
- Рішення: **не об'єднувати** — різні абстракції для різних редакторів

## Стан тестування
- **Unit:** 14 файлів (atom-types, molecule-types, block-schemas, story-validator, audio-manager та ін.)
- **Integration:** 1 файл (LEGO система)
- **E2E:** 1 файл (app-level)
- **Mocks:** expo-audio, expo-av, expo-file-system, expo-haptics, async-storage
- **Результат:** 219/219 passing

## Відкриті питання
1. **Об'єднання редакторів** — три паралельні редактори (node, scene, lego) потребують уніфікації
2. **Документація в `todo.md`** — файл відображає старі Recommendations, не всю актуальну роботу
3. **Німецькі переклади** (`de`) — відкладено, тип `Partial<Record<Language, string>>` підтримує відсутність ключів

## Продовження роботи
- Продовження → [[2026-05-13-session-report|Робота 2026-05-13 — Навігація, Безпека, Аудіо-тести]]
