# Повна перевірка коду — 2026-06-03

> Попередній аналіз: [[code-analysis-report-2026-06-02|Аналіз 2026-06-02]]
> Виправлення: [[fixes-2026-06-02|План виправлень 2026-06-02]]

## Загальна оцінка: 8.0/10 (↑ з 7.5)

| Категорія | Оцінка | Тренд |
|-----------|--------|-------|
| Якість коду | 8.5/10 | ↑ |
| Безпека | 8/10 | → |
| UX/UI | 7.5/10 | ↑ |
| Оптимізація | 7.5/10 | → |
| Архітектура | 8.5/10 | ↑ |
| Тестування | 7/10 | → |

---

## 1. TypeScript компіляція

**Статус:** ✅ Без помилок

`npx tsc --noEmit` — 0 помилок. Всі нові файли (`useDocumentScroll.ts`, `useBlockOperations.ts`) компілюються коректно.

---

## 2. Метрики коду

### God Components (>15 hooks, >300 LOC)

| Компонент | LOC | Хуки | Статус |
|-----------|-----|------|--------|
| `PropertiesPanel.tsx` | 1094 | 12 | 🟡 Великий, але <15 хуків |
| `DocumentSceneEditor.tsx` | 562 | 10 | ✅ Декомпоновано (з 719/34) |
| `SceneComposer.tsx` | 510 | 21 | 🟡 Межа |
| `StoryReaderResponsive.tsx` | 357 | 21 | 🟡 Межа |
| `PreviewScreen.tsx` | 296 | 16 | 🟡 Межа |

**Прогрес:** DocumentSceneEditor з 34 хуків → 10 (useState: 6, useCallback: 3, useMemo: 1). Замість 24 хуків в одному компоненті — 2 кастомні хуки (`useDocumentScroll`, `useBlockOperations`).

### Топ-5 найбільших файлів

| Файл | LOC | Примітка |
|------|-----|----------|
| `PropertiesPanel.tsx` | 1094 | Форма для 12 типів блоків |
| `translations.ts` | 699 | Переклади (не код) |
| `SceneSelector.tsx` | 565 | Селектор сцен |
| `DocumentSceneEditor.tsx` | 562 | Декомпоновано |
| `SceneComposer.tsx` | 510 | 3-panel editor |

---

## 3. Безпека

| Перевірка | Статус |
|-----------|--------|
| TypeScript компіляція | ✅ 0 помилок |
| `any` типи | 0 явних |
| `console.*` без `__DEV__` | ✅ Всі guarded |
| CRLF line endings | ✅ 0 файлів |
| `isSafeUri()` | ✅ `file://` native-only |
| OAuth state validation | ✅ |
| Prototype pollution | ✅ `RESERVED_KEYS` |
| Rate limiting | ✅ |

---

## 4. Знайдені проблеми

### HIGH (1)

**H1: `migrateFromLegacyKeys` не викликається при старті**
- **Файл:** `app/tabs/index.tsx:141` (`initializeApp`)
- **Проблема:** `migrateFromLegacyKeys()` визначений в `useAppStore` але ніколи не викликається з `HomeScreen`. Legacy користувачі не отримують міграцію даних.
- **Ризик:** Користувачі зі старими даними можуть бачити порожній список сторіс.
- **Рекомендація:** Додати `await useAppStore.getState().migrateFromLegacyKeys()` в `initializeApp` після `waitForHydration()`.

### MEDIUM (3)

**M1: `addStory` для demo не в `finally` блоку**
- **Файл:** `app/tabs/index.tsx:162-201`
- **Проблема:** Якщо `StoryValidator.validateStory(demoStory)` кине помилку, demo story не додасться і користувач не побачить помилку.
- **Рекомендація:** Обгорнути в `try/catch` з user-visible error.

**M2: `StoryReaderResponsive` — 21 хук при 357 LOC**
- **Файл:** `components/story-reader-responsive.tsx`
- **Проблема:** Висока щільність хуків (21 на 357 LOC). Компонент керує typewriter + auto-play + turbo + history + choices + splash + image loading.
- **Рекомендація:** Декомпонувати на `ReaderDisplay`, `ReaderControls`, `ReaderTransitions`.

**M3: `SceneComposer` — 21 хук при 510 LOC**
- **Файл:** `components/editor/SceneComposer.tsx`
- **Проблема:** Phone/desktop layout switching + undo/redo + block operations + keyboard shortcuts — все в одному компоненті.
- **Рекомендація:** Винести phone layout в `PhoneSceneComposer`, desktop в `DesktopSceneComposer`.

### LOW (2)

**L1: `PropertiesPanel.tsx` — 1094 LOC**
- Форма для 12 типів блоків з повною типобезпекою. Великий, але читабельний.
- **Рекомендація:** Розбити на per-block-type form components.

**L2: `PreviewScreen.tsx` — 16 хуків при 296 LOC**
- Межа God Component.
- **Рекомендація:** Винести typewriter logic в окремий хук.

---

## 5. UX/UI аудит

### Темна тема

| Компонент | Статус |
|-----------|--------|
| `ReaderControls.tsx` | ✅ `colors.overlay` + `colors['border-subtle']` |
| `BlockLibraryPanel.tsx` | ✅ `colors.backdrop` |
| `MigrationErrorBanner.tsx` | ✅ `colors.backdrop` |
| `WebSidebar.tsx` | ⚠️ `StyleSheet.create()` — `colors` не доступний |

### Accessibility

| Компонент | Labels | Hints | Статус |
|-----------|--------|-------|--------|
| `DocumentSceneEditor` | ✅ 7 | ✅ 8 | Повна підтримка |
| `ReaderControls` | ✅ 4 | ✅ 4 | Повна підтримка |
| `ReaderChoices` | ✅ 1 | ✅ 1 | Повна підтримка |
| `BlockLibraryPanel` | ✅ 2 | ✅ 2 | Повна підтримка |
| `PropertiesPanel` | ✅ 3 | ✅ 3 | Повна підтримка |
| `TimelinePanel` | ✅ 4 | ✅ 4 | Повна підтримка |
| `SceneComposer` | ✅ 15 | ❌ 0 | ⚠️ Hints відсутні |

### Phone Layout

| Компонент | Статус |
|-----------|--------|
| `SceneComposer` tabs | ✅ Horizontal ScrollView |
| `DocumentSceneEditor` | ✅ Responsive |

---

## 6. Логічний аудит

### Проблеми

1. **`migrateFromLegacyKeys` не викликається** (HIGH) — див. вище
2. **Demo story validation** — `as unknown as Story` cast без runtime validation
3. **`initializeApp` не в `finally`** — якщо `loadStories` кине помилку, demo не додасться

### Що працює правильно

- Zustand Persist → `onFinishHydration` → `loadStories` → `addStory` (demo)
- `migrateFromLegacyKeys` merge: `stories.length > 0 ? stories : current.storiesMetadata`
- `StoryAutoSave` не викликає `migrateFromLegacyKeys()`
- `RESERVED_KEYS` блокує prototype pollution
- `isSafeUri()` — єдиний валідатор на всіх рівнях

---

## 7. Рекомендації подальших покращень

### Пріоритет 1 (Critical)

1. **Додати `migrateFromLegacyKeys` в `initializeApp`**
   ```typescript
   // Після waitForHydration():
   await useAppStore.getState().migrateFromLegacyKeys();
   await loadStories();
   ```

2. **Demo story validation** — замінити `as unknown as Story` на `StoryValidator.validateStory()` з try/catch

### Пріоритет 2 (Important)

3. **Декомпонувати `StoryReaderResponsive`** — винести `ReaderDisplay`, `ReaderControls`, `ReaderTransitions`
4. **Декомпонувати `SceneComposer`** — розділити phone/desktop layout
5. **Додати accessibility hints до `SceneComposer`**

### Пріоритет 3 (Nice to have)

6. **Розбити `PropertiesPanel.tsx`** на per-block-type form components
7. **Винести typewriter logic з `PreviewScreen.tsx`** в окремий хук
8. **Додати `file://` protocol warning** для native platforms
9. **Розглянути видалення `lib/types.ts`** barrel — залишився 1 імпорт

---

## 8. План дій

| # | Задача | Пріоритет | Час |
|---|--------|-----------|-----|
| 1 | Додати `migrateFromLegacyKeys` в `initializeApp` | 🔴 HIGH | 15 хв |
| 2 | Demo story validation з try/catch | 🟡 MEDIUM | 10 хв |
| 3 | Декомпонувати `StoryReaderResponsive` | 🟡 MEDIUM | 2 год |
| 4 | Декомпонувати `SceneComposer` | 🟡 MEDIUM | 2 год |
| 5 | Accessibility hints для `SceneComposer` | 🟢 LOW | 30 хв |
| 6 | Розбити `PropertiesPanel.tsx` | 🟢 LOW | 3 год |
| 7 | Видалити `lib/types.ts` barrel | 🟢 LOW | 15 хв |

---

## Пов'язані сторінки

[[code-analysis-report-2026-06-02|Попередній аналіз 2026-06-02]]
[[fixes-2026-06-02|План виправлень 2026-06-02]]
[[index|Головна сторінка wiki]]
