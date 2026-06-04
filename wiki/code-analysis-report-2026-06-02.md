# Повний аналіз Visual Novel Engine — 2026-06-02

> Попередній аналіз: [[code-analysis-report-2026-06-01|Аналіз 2026-06-01]]
> Наступний крок: [[fixes-2026-06-02|План виправлень]]

## Загальна оцінка: 7.5/10

| Категорія | Оцінка | Тренд |
|-----------|--------|-------|
| Якість коду | 8/10 | ↑ |
| Безпека | 8/10 | → |
| UX/UI | 7/10 | ↓ (нові компоненти) |
| Оптимізація | 7.5/10 | → |
| Архітектура | 8/10 | ↑ |
| Тестованість | 7/10 | → |

---

## 1. Структура проекту

| Модуль | Файли | LOC | Примітка |
|--------|-------|-----|----------|
| `app/` | ~20 | 2,287 | Роути (файлова система Expo Router) |
| `components/` | ~25 | 11,435 | UI-компоненти |
| `lib/` | ~50 | 8,845 | Бізнес-логика, двигуни |
| `hooks/` | ~11 | ~1,000 | React-хуки |
| `stores/` | ~3 | ~900 | Zustand-стори |
| `__tests__/` | 39 | 4,118 | Тестові файли |
| **Разом (без тестів)** | **~146** | **~19,600** | |

### Розподіл по підсистемах

| Підсистема | Файли | LOC | Статус |
|------------|-------|-----|--------|
| Scene Executor | 5 | ~800 | ✅ Канонічний |
| Editor Store | 1 | 279 | ✅ чистий |
| App Store | 1 | 478 | ⚠️ містить legacy |
| Auth + API | 3 | ~600 | ✅ безпечний |
| Asset Resolver | 1 | 331 | ✅ з кешем + LRU |
| Story Validator | 1 | 302 | ✅ комплексний |
| Document Editor | ~15 | ~3,000 | ⚠️ God Component |
| Reader | ~10 | ~2,500 | ✅ декомпонований |

---

## 2. Якість коду

### 2.1 TypeScript-типобезпека

**Результат:** Високий рівень типобезпеки.

| Метрика | Значення | Оцінка |
|---------|----------|--------|
| `any` типів (явних) | 0 | ✅ |
| `as unknown as` | 6 місць | ⚠️ Припустимо для legacy bridge |
| `as never` | 0 | ✅ |
| `data: any` | 0 | ✅ |

**Місця з `as unknown as` (legacy bridge — припустимо):**
- `lib/story-hooks.ts:157` — `rawStep as unknown as TimelineStep` (legacy → canonical)
- `lib/story-hooks.ts:246` — `s as unknown as SceneRecord` (legacy → canonical)
- `lib/_core/api.ts:124` — `text as unknown as T` (non-JSON response fallback)
- `lib/_core/theme.ts:157` — `as unknown as RuntimePalette` (theme generation)
- `hooks/use-keyboard-shortcuts.ts:43,79` — DOM event casting
- `hooks/useReaderInitialization.ts:61,85` — demo story cast

**Висновок:** Усі `as unknown as` сконцентровані в legacy bridge та platform-specific коді. Новий код чисто типізований.

### 2.2 God Components

| Компонент | LOC | Хуки | Статус |
|-----------|-----|------|--------|
| `DocumentSceneEditor.tsx` | 719 | 34 | 🔴 **God Component** |
| `SceneComposer.tsx` | 510 | 4 | 🟡 Межа (але phone/desktop дублювання) |
| `StoryReaderResponsive.tsx` | 357 | 7 | ✅ Декомпонований |

**Рекомендація для DocumentSceneEditor:**
- Винести `scrollToWritingPosition` + `followWriting` в `useDocumentScroll` хук
- Винести блокові операції (updateBlock, replaceBlock, removeBlock) в `useBlockOperations` хук
- Винести `lineDrafts` логіку в `useLineDrafts` хук
- Розділити UI на `DocumentPage`, `DocumentBlock`, `DocumentTextInput` підкомпоненти

### 2.3 Dead Code

| Елемент | Файл | Статус |
|---------|------|--------|
| `isRunningInPreviewIframe()` | `lib/_core/manus-runtime.ts` | 🟡 Перевірити — можливо dead |
| `sceneRecordToStoryScene` | `lib/scene-record-adapter.ts:181` | ✅ Позначено `@deprecated` |
| `addStory()` | `stores/use-app-store.ts:95` | ✅ Позначено `@deprecated` |
| No-op блоки (sound, camera, interactive_object) | `lib/engine/useSceneExecutor.ts:185-200` | 🟡 Приховані в UI (comingSoon + disabled) |

**Висновок:** Мінімальний dead code. Deprecated методи позначені. No-op блоки приховані в UI через `comingSoon: true, disabled: true`.

### 2.4 Barrel Import Cleanup

| Файл | Імпорти з `@/lib/types` | Статус |
|------|-------------------------|--------|
| `stores/use-app-store.ts:16` | `SaveSlot, PlaybackState` | ⚠️ 1 файл залишився |
| Всі інші | Domain-specific imports | ✅ |

**Рекомендація:** Перенести `SaveSlot` та `PlaybackState` з `@/lib/types` в `@/lib/story-domain` та `@/lib/engine/types` відповідно.

---

## 3. Безпека

### 3.1 OAuth / Auth

| Перевірка | Статус | Деталі |
|-----------|--------|--------|
| State validation | ✅ | `validateOAuthState()` порівнює з `sessionStorage`/`SecureStore` |
| User info from URL | ✅ | Видалено. Тільки `Api.getMe()` з backend |
| Session token storage | ✅ | `SecureStore` на native, cookie-based на web |
| CSRF protection | ✅ | OAuth state + `sessionStorage` (не `localStorage`) |
| Token logging | ✅ | Тільки truncated prefix в `__DEV__` |
| Rate limiting | ✅ | 20 req/s global, 10 req/s per endpoint |

### 3.2 URI/Asset Validation

| Перевірка | Статус | Деталі |
|-----------|--------|--------|
| `isSafeUri()` | ✅ | Блокує `javascript:`, `data:`, `vbscript:` |
| Path traversal | ✅ | Блокує `..`, `\0`, небезпечні символи |
| data: URI whitelist | ✅ | Тільки `image/`, `audio/`, `video/`, `font/`, `octet-stream` |
| SVG XSS | ✅ | `data:image/svg+xml` заблоковано |
| Inconsistent validation | ✅ | Єдиний `isSafeUri()` використовується всюди |

### 3.3 Prototype Pollution

| Перевірка | Статус | Деталі |
|-----------|--------|--------|
| `RESERVED_KEYS` | ✅ | `Set(['__proto__', 'constructor', 'prototype'])` |
| `evaluateVariable()` | ✅ | Перевіряє `RESERVED_KEYS.has(varName)` |

### 3.4 Проблеми

**MEDIUM: `__DEV__` console.log в `lib/_core/api.ts`**
- Рядки 89, 91, 98: `console.log("[API] Response status:", ...)`, `console.log("[API] Response headers:", ...)`, `console.log("[API] Set-Cookie header received:", ...)`
- Ризик: В продакшені (якщо `__DEV__` undefined = false) не спрацьовує, але якщо збирати з `__DEV__=true` — логи потрапляють у консоль
- **Рекомендація:** Додати явну перевірку `if (__DEV__)` для всіх console.* у apiKey

**LOW: `file://` дозволений в `isSafeUri()`**
- `lib/story-validator.ts:27` — `file://` в списку дозволених
- Ризик: На web не є проблемою, на native може дозволяти читання локальних файлів
- **Рекомендація:** Видалити `file://` з дозволених або обмежити тільки native-платформами

---

## 4. UX/UI

### 4.1 Темна тема / Хардкодовані кольори

| Компонент | Тип | Кількість | Статус |
|-----------|-----|-----------|--------|
| `ReaderControls.tsx` | `rgba()` | 4 | ⚠️ Половина використовує хардкодовані overlay-кольори |
| `BlockLibraryPanel.tsx` | `rgba(0,0,0,0.3)` | 1 | ⚠️ Placeholder background |
| `MigrationErrorBanner.tsx` | `rgba(0,0,0,0.5)` | 1 | ⚠️ Overlay |
| `WebSidebar.tsx` | `rgba(0,0,0,0.05)` | 2 | ⚠️ Border colors |
| `app/tabs/index.tsx` | `rgba(124, 91, 245, ...)` | 3 | ⚠️ Utility functions (можна терпіти) |

**Висновок:** Значна частина компонентів використовує `colors.*` токени. Проблемні місця — overlay/scene compositing де потрібен напівпрозорий фон. Рекомендація: додати `colors.backdrop` та `colors.overlay` в тему.

### 4.2 Accessibility

| Компонент | `accessibilityLabel` | `accessibilityRole` | `accessibilityHint` | Статус |
|-----------|---------------------|---------------------|---------------------|--------|
| ReaderDisplay | ✅ | ✅ | ✅ | Повна підтримка |
| ReaderControls | ✅ | ✅ | ❌ | Hints відсутні |
| ReaderChoices | ✅ | ✅ | ❌ | Hints відсутні |
| SceneComposer (phone) | ✅ | ✅ | ❌ | Hints відсутні |
| SceneComposer (desktop) | ✅ | ✅ | ❌ | Hints відсутні |
| DocumentSceneEditor | ❌ | ❌ | ❌ | ❌ Повністю відсутня |
| BlockLibraryPanel | ❌ | ❌ | ❌ | ❌ Повністю відсутня |
| PropertiesPanel | ❌ | ❌ | ❌ | ❌ Повністю відсутня |
| TimelinePanel | ❌ | ❌ | ❌ | ❌ Повністю відсутня |

**Висновок:** Reader має гарну accessibility-підтримку. Editor — повністю відсутня.

### 4.3 Scroll-to-Writing Anti-Pattern

**Файл:** `components/document-editor/DocumentSceneEditor.tsx`
- Рядок 160: `scrollToWritingPosition()` — прокручує до низу сторінки
- Рядок 180-184: `followWriting()` — викликає `scrollToWritingPosition()`
- Рядок 258: `followWriting(sceneId)` — викликається при кожному додаванні рядка
- Рядок 666: `scrollToWritingPosition()` — викликається при фокусі

**Проблема:** Кожен клік/фокус на текстовий блоку прокручує до низу сторінки. Інтуїтивна поведінка — курсор має залишатися у viewport, але не примусово прокручуватися вниз.

Наразі це **частково виправлено** — `shouldFollowWritingRef` контролює коли слід слідкувати. Але `scrollToWritingPosition()` все ще викликається при кожному `followWriting()`, що призводить до прокрутки вниз.

### 4.4 Phone Layout Overflow

**Файл:** `components/editor/SceneComposer.tsx`
- Рядки 327-353: 5 табів у одному ряду на телефоні (Blocks, Timeline, Preview, Document, Scenes)
- Рядки 272-325: Header містить 7+ кнопок у рядку

**Проблема:** На маленьких екранах (< 360px) таби та кнопки хедера переповнюються.

### 4.5 No-Op Features

| Блок | UI показує | Runtime | Статус |
|------|------------|---------|--------|
| Sound | ✅ (disabled) | `break;` | 🟡 Коректно приховано |
| Camera | ✅ (disabled) | `break;` | 🟡 Коректно приховано |
| Interactive Object | ✅ (disabled) | `break;` | 🟡 Коректно приховано |

**Висновок:** Всі no-op блоки позначені `comingSoon: true, disabled: true` в `BLOCK_TYPE_INFO`. Користувач не може їх додати. Це правильний підхід для MVP.

---

## 5. Оптимізація

### 5.1 Анімації

| Проблема | Місце | Статус |
|----------|-------|--------|
| `new Animated.Value()` в `useRef` | `dialogue-history.tsx`, `SplashScreen.tsx`, `Button.tsx` | ✅ Коректно (useRef) |
| `new Animated.Value()` в render | Не знайдено | ✅ |
| `Animated.loop` cleanup | `InteractiveObjectsLayer.tsx:125,147` | ✅ Cleanup в useEffect return |
| `reanimated.useSharedValue` | `story-reader-responsive.tsx:183-184` | ✅ Коректно |

### 5.2 Кешування

| Кеш | Тип | Max Size | TTL | Статус |
|-----|-----|----------|-----|--------|
| `uriCache` (asset-resolver) | Timed LRU | 100 | 5 хв | ✅ |
| `playableUriCache` | Timed LRU | 100 | 5 хв | ✅ |
| `moduleUriCache` | Map | Unlimited | None | ⚠️ Необмежений |
| `modulePlayableCache` | Map | Unlimited | None | ⚠️ Необмежений |

### 5.3 Re-renders

| Проблема | Місце | Статус |
|----------|-------|--------|
| Object spread у селекторах | `phoneStyles` в `SceneComposer.tsx:78-165` | ⚠️ 50+ полів обчислюються кожен рендер, але горизонтально стабільні (useMemo deps OK) |
| `useStoryState()` перестворення | Не використовується | ✅ Видалено |
| isTyping race | Єдиний `isTyping` з executor | ✅ Консолідовано |

### 5.4 Image Loading

| Компонент | Підхід | Статус |
|-----------|--------|--------|
| `useSceneImages` hook | Lazy loading через `expo-image` | ✅ |
| `bgSource` | `useMemo` з залежностями | ✅ |
| Asset bundling | `require()` + expo-asset | ✅ |

---

## 6. Архітектура

### 6.1 State Management

| Стор | Область | Persisted | Статус |
|------|---------|-----------|--------|
| `use-app-store.ts` | Stories, Scenes, Settings, Saves | ✅ Zustand Persist | ✅ Єдиний джерело |
| `use-editor-store.ts` | Editor UI (timeline, selection) | ❌ | ✅ Тимчасовий |
| `theme-store.ts` | Theme | ✅ | ✅ Замикає коло |

**Висновок:** Архітектура сторів чиста. Один персистентний глобальний стор + нетривіальний редактор-стор. Дублювання відсутнє.

### 6.2 Layer Boundaries

| Правило | Порушень | Статус |
|---------|----------|--------|
| `lib/` → `stores/` | 0 | ✅ |
| `lib/` → `hooks/` | 0 | ✅ |
| `stores/` → `components/` | 0 | ✅ |

### 6.3 Engine Pipeline

```
TimelineStep[] → useSceneExecutor → SceneState → ReaderDisplay
                     ↓
              conditionsMet()
              evaluateVariable()
              YIELDING_BLOCK_TYPES → typewriter/choice halt
```

**Висновок:** Пайплалін чистий. Відділення відображення (ReaderDisplay) від логіки (executor). Condition evaluation — pure functions. Variable mutation — immutable spread.

### 6.4 Проблема: CRLF Line Endings

**Файл:** `components/story-reader-responsive.tsx` — використовує `\r\n` (Windows line endings)

**Ризик:** Git diff noise, потенційні проблеми з патчами.

---

## 7. Тестування

| Метрика | Значення |
|---------|----------|
| Тестових файлів | 39 |
| Тестового коду (LOC) | 4,118 |
| Покриття основних модулів | ✅ audio-player, use-reader-audio, useSceneExecutor, conditionUtils |
| Mock infrastructure | ✅ `__mocks__/` для react-native, expo-*, stores |
| Vitest config | ✅ globals: true, custom resolve, Module._resolveFilename |

**Проблеми (pre-existing):**
- `__tests__/unit/lib/smoke.test.ts` — `await import()` не працює з CJS format
- `__tests__/unit/lib/theme-runtime.test.ts` — аналогічна проблема

---

## 8. Підсумок знахідок

### CRITICAL (0)
Немає критичних проблем.

### HIGH (2)
1. **H1: DocumentSceneEditor — God Component (719 LOC, 34 хуки)** — `components/document-editor/DocumentSceneEditor.tsx`
2. **H2: DocumentSceneEditor — відсутній accessibility** — 0 labels, 0 roles, 0 hints

### MEDIUM (5)
1. **M1: `__DEV__`-unguarded console.log в `lib/_core/api.ts`** — рядки 89, 91, 98
2. **M2: `rgba()` hardcoded colors в 6 компонентах** — overlay/backdrop кольори
3. **M3: SceneComposer — phone layout overflow** — 5 табів + 7 кнопок в рядку
4. **M4: `moduleUriCache` / `modulePlayableCache` — необмежені кеші**
5. **M5: CRLF line endings у `story-reader-responsive.tsx`**

### LOW (4)
1. **L1: `file://` protocol дозволений в `isSafeUri()`**
2. **L2: 1 файл імпортує з `@/lib/types` barrel** — `stores/use-app-store.ts`
3. **L3: Accessibility hints відсутні в Editor-компонентах**
4. **L4: `isRunningInPreviewIframe()` — можливо dead code**

---

## Пов'язані сторінки

[[code-analysis-report-2026-06-01|Попередній аналіз 2026-06-01]]
[[security-audit-report-2026-05-31-rev2|Останній аудит безпеки]]
[[optimization-plan-2026-06-01|План оптимізації 2026-06-01]]
[[index|Головна сторінка wiki]]
