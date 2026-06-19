# Повний GSD-аналіз — Visual Novel Engine (2026-06-17)

## Екзекютивний підсумок

**Загальна оцінка: 7.9/10** ↑ з 7.8/10 (попередній аудит 2026-06-16)

| Вісь | Оцінка | Тренд | Коментар |
|------|--------|-------|----------|
| Архітектура та структура коду | 8.5/10 | → | Стабільна, чисті шари, 0 порушень |
| Якість коду (TypeScript) | 7.5/10 | → | 0 as any, 0 @ts-ignore, 5 as unknown as |
| Безпека | 8.0/10 | → | Без змін — залишається сильною стороною |
| UX/UI | 7.5/10 | → | Стабільна, 601 inline style — системна |
| Документація | 8.0/10 | → | 32+ сторінки wiki |
| Тестування | 7.0/10 | ↑ | Нові тести додано, esbuild все ще блокує |
| Потенціал на ринку | 7.5/10 | НОВЕ | Перший аналіз ринку |

---

## 1. Архітектура та структура коду — 8.5/10

### Структура проекту

```
visual_novel_engine/
├── app/              (16 файлів)  — Expo Router екрани
├── components/       (80 файлів)  — UI компоненти
│   ├── reader/       (4 файли)   — Декомпонований reader
│   ├── editor/       (25+ файлів) — Редактор сцен
│   ├── ui/           (5 файлів)   — Базові UI компоненти
│   └── document-editor/ (12 файлів) — Документний редактор
├── hooks/            (17 файлів)  — React хуки
├── lib/              (71 файл)   — Бізнес-логіка
│   ├── engine/       (5 файлів)   — Рантайм екзек'ютор
│   ├── editor/       (8 файлів)   — Логіка редактора
│   ├── document-editor/ (3 файли) — Документний редактор
│   └── _core/        (4 файли)   — Ядро (API, auth, theme)
├── stores/           (5 файлів)   — Zustand stores
├── constants/        (3 файли)   — Константи
├── wiki/             (32+ сторінок) — Документація
└── __tests__/        (42 файли)   — Тести
```

### Архітектурний потік даних

```
[Story JSON Import]
       ↓
[story-validator.ts] → валідація + санітизація
       ↓
[scene-operations.ts] → конвертація в Canonical SceneRecord
       ↓
[use-app-store.ts] → Zustand store (sceneRecordsByStory)
       ↓
[use-editor-store.ts] → Редактор сцен (TimelineStep[])
       ↓
[useSceneExecutor.ts] → Рантайм виконання
       ↓
[StoryReaderResponsive] → UI відображення
```

### Що працює добре

- **Чисті шари:** `lib/` (бізнес-логіка) → `hooks/` (React hooks) → `stores/` (Zustand) → `components/` → `app/` (екрани)
- **0 порушень lib/→stores/ (runtime imports)** — всі виправлено у попередніх раундах
- **useSceneExecutor** — центральний хук-виконавець, чистий патерн з yielding/non-yielding блоками
- **lib/types.ts** — чиста загальна зона, 0 продакшен-імпортів з барреля
- **StoryReaderResponsive — 315 LOC** — декомпонований на підкомпоненти (ReaderDisplay, ReaderControls, ReaderChoices, ReaderTransitions)
- **Editor store** — чистий Zustand store з undo/redo, без перетинів з use-app-store

### Залишилось

#### 🟢 LOW

**A-01: theme-provider.tsx — store import**
`lib/theme-provider.tsx:6` імпортує `useThemeStore, useThemeInit` з `@/stores/theme-store`.
**Статус:** Допустимий виняток — це React component (.tsx), не чиста бізнес-логіка. Задокументовано.

**A-02: Два паралельні моделі даних (legacy + canonical)**
`scene-operations.ts` містить `@deprecated` типи `Story`, `StoryScene`, `Choice` разом з новими `SceneRecord`, `TimelineStep`. Міграція запланована на 2026-Q3. Поки що обидві моделі співіснують, що створює додаткову складність.

---

## 2. Якість коду (TypeScript) — 7.5/10

### Що працює добре

- **0 використань `as any`** — ідеальний показник
- **0 `@ts-ignore` / `@ts-nocheck`** — жодних придушень
- **0 `data: any`** — всі поліморфні дані типізовані
- **0 `router.push() as never`** — чистий навігаційний код
- **0 `eval()` / `new Function()`** — жодних динамічних виконань
- **0 імпортів з `@/lib/types`** — баррель повністю виведений з експлуатації
- **Всі console.* мають __DEV__ гарди** — перевірено вручну
- **0 `new Animated.Value()` у render** — всі в `useRef`

### Залишилось

#### 🟡 MEDIUM

**T-01: 5 використань `as unknown as`** (зменшено з 6)
- `hooks/use-keyboard-shortcuts.ts:43` — `event as unknown as KeyboardEvent` (web-only, прийнятно)
- `hooks/use-keyboard-shortcuts.ts:79` — `listener as unknown as EventListener` (web-only, прийнятно)
- `hooks/useReaderInitialization.ts:61` — `demoStory as unknown as Story` (⚠️ потрібна валідація)
- `hooks/useReaderInitialization.ts:85` — `demoStory as unknown as Story` (⚠️ потрібна валідація)
- `components/vn-plate-editor/PlateWebViewEditor.web.tsx:10` — `'iframe' as unknown as React.ComponentType` (plate editor exclusion zone)

**Вплив:** Подвійне приведення обходить TypeScript. 2 з 5 — для demo story без валідації.

#### 🟢 LOW

**T-02: 2 використання Math.random() для ID**
- `lib/vn-plate-editor/embedded-html.ts:263` — для ID елементів (не критично, plate editor)
- `lib/id-utils.ts:16` — fallback для crypto.getRandomValues (прийнятно)

**T-03: ~601 inline style={{}} у components/**
Системна проблема, не фікситься за 1 сесію. Ускладнює підтримку тем.

---

## 3. Безпека — 8.0/10

### Що працює добре

- **OAuth state валідовано:** `generateOAuthState()` + `validateOAuthState()` з `crypto.getRandomValues()`
- **CSP заголовок:** `app/+html.tsx` має Content-Security-Policy
- **sessionStorage на web:** Дані користувача в `sessionStorage`, не `localStorage`
- **SecureStore на native:** Токени та дані в `expo-secure-store`
- **Протокольна валідація:** `isSafeUri()` блокує `javascript:`, `data:`, `vbscript:`
- **Захист від prototype pollution:** `RESERVED_KEYS` блокує `__proto__`, `constructor`, `prototype`
- **Rate limiting:** `RATE_LIMIT` константа в `lib/_core/api.ts:8-13` — 20 req/s global, 10 req/s per endpoint
- **Валідація користувача:** `isValidUser()` перевіряє тип при зчитуванні з сховища
- **Валідація URI на всіх шарах:** `isSafeUri()` використовується в `asset-resolver.ts`, `story-hooks.ts`, `story-validator.ts`
- **JSON.parse з валідацією:** `isValidUser()` після JSON.parse в auth.ts
- **Санітизація тексту:** `sanitizeText()` видаляє HTML теги, event handlers, javascript: протоколи
- **DoS захист:** обмеження довжини тексту (50000 символів), кількості виборів (20), персонажів (50)
- **Circular reference detection:** `checkCircularReferences()` виявляє self-loops у графі сцен

### Залишилось

#### 🟡 MEDIUM

**S-01: data:image/svg+xml заблокований, але без санітизації**
`lib/asset-resolver.ts:80` блокує `data:image/svg+xml`. Якщо колись буде дозволено — потрібна санітизація SVG.

**S-02: file:// дозволений на native**
`lib/story-validator.ts:33` дозволяє `file://` на native платформах. Необхідно для Expo FileSystem, але потенційно може бути використано для читання локальних файлів.

#### 🟢 LOW

**S-03: Відсутність Subresource Integrity для зовнішніх ресурсів**
Низький пріоритет для внутрішнього додатку.

**S-04: console.log в api.ts логує URL та заголовки**
`lib/_core/api.ts:89-91` логує URL та response headers в `__DEV__` режимі. Безпосередньо токени не логуються (Authorization додається після логування), але URL може містити чутливі параметри.

---

## 4. UX/UI — 7.5/10

### Що працює добре

- **0 hardcoded hex colors у components/** — всі кольори через `useColors()` або `withAlpha()`
- **0 rgba() літералів у components/** — використовується `withAlpha()`
- **217 accessibilityLabel/accessibilityRole** — гарне покриття (зросло з 186)
- **0 scroll-to-bottom антипатернів** — `followWriting()` не викликається в `onFocus`/`onContentSizeChange`
- **useSceneExecutor** — єдиний екзек'ютор для PreviewScreen і Reader
- **Dark theme працює** — всі кольори тематичні
- **Декомпозиція reader** — ReaderDisplay, ReaderControls, ReaderChoices, ReaderTransitions
- **Responsive layout** — `useResponsiveLayout()` для phone/desktop адаптації
- **OKLCH кольорова система** — 61 токен, 3-layer Primitive→Semantic→Component

### Залишилось

#### 🟡 MEDIUM

**U-01: ~601 inline style={{}} у components/**
Системна проблема. Ускладнює підтримку тем та відрізняється від NativeWind підходу.

**U-02: CharacterDisplay — 0 accessibility**
`components/CharacterDisplay.tsx` не має `accessibilityLabel`, `accessibilityRole`, або `accessibilityHint`. Для скрін-рідерів персонажі невидимі.

**U-03: InteractiveObjectsLayer — мінімальний accessibility**
Інтерактивні об'єкти на сцені не мають accessibility атрибутів.

#### 🟢 LOW

**U-04: Не всі Pressable мають accessibilityRole="button"**
Деякі `Pressable` компоненти мають `accessibilityLabel`, але не `accessibilityRole`.

---

## 5. Документація — 8.0/10

### Що працює добре

- **32+ сторінок в wiki/** — архітектура, компоненти, хуки, стори, аудіо, безпека
- **architecture-reference.md** — детальна архітектурна довідка
- **security-audit-report-2026-05-31-rev2.md** — повний звіт безпеки
- **changelog.md** — актуальний
- **hooks-reference.md** — оновлено з новими хуками
- **AGENTS.md** — правила проекту
- **JSDoc коментарі** у ключових модулях (engine, validator, factories)
- **PRODUCT.md** — продуктова візія, принципи дизайну
- **DESIGN_SYSTEM.md** — опис дизайн-системи

### Залишилось

#### 🟢 LOW

**D-01: Відсутність API-документації для lib/engine/**
Модулі `lib/engine/useSceneExecutor.ts`, `lib/engine/conditionUtils.ts` мають JSDoc, але немає окремої сторінки в wiki.

**D-02: Відсутність посібника з розширення (Extension Guide)**
Немає документації для розробників, які хочуть додати новий тип блоку.

---

## 6. Тестування — 7.0/10

### Що працює добре

- **42 тестових файли** — гарне покриття для проекту такого розміру
- **Vitest infrastructure** — налаштовано (__mocks__, vitest.config.ts, vitest.setup.ts)
- **Тести бізнес-логіки:** condition-utils, block-validation, story-domain, story-validator, useSceneExecutor, editor-scene-draft, editor-scene-save
- **Тести хуків:** use-typewriter, use-reader-auto-advance, use-reader-audio
- **Тести store:** use-app-store (canonical, scene-operations, settings), use-editor-store
- **Тести asset-resolver, auth, audio-player-service, audio-web-source**

### Залишилось

#### 🟡 MEDIUM

**TST-01: esbuild версія не збігається (0.21.5 vs 0.28.0)**
Тестовий раннер не запускається. Інфраструктурна проблема, не код.
**Фікс:** `rm -rf node_modules && pnpm install` або оновити esbuild до сумісної версії.

**TST-02: Непокриті критичні модулі**
- `lib/_core/api.ts` — є тест, але мінімальний
- `lib/error-handler.ts` — є тест
- `lib/audio-player-service.ts` — є тест
- `lib/engine/useSceneExecutor.ts` — є 2 тести (useSceneExecutor.test.ts, useSceneExecutor2.test.ts)

**TST-03: Немає component tests**
Всі тести — unit-тести для lib/ та hooks/. Немає тестів для React Native компонентів (StoryReaderResponsive, SceneComposer тощо).

#### 🟢 LOW

**TST-04: Немає E2E тестів**
Критичні сценарії (імпорт історії → редагування → превью → читання) не протестовані end-to-end.

---

## 7. Потенціал на ринку — 7.5/10 (НОВЕ)

### Ринковий контекст

**Ринок визуальних новел** оцінюється в $1.87 млрд (2025) з прогнозом зростання до $3.24 млрд до 2034 (CAGR 6.8%).

### Конкурентний аналіз

| Інструмент | Платформа | Цільова аудиторія | Сильні сторони | Слабкі сторони |
|------------|-----------|-------------------|----------------|----------------|
| **Ren'Py** | Desktop/Web | Девелопи | 60-70% ринку, зріла екосистема | Власна мова скриптів, складний для новачків |
| **TyranoBuilder** | Desktop/Mobile | Новачки | Drag-and-drop, швидкий старт | Обмежена логіка, пропрієтарний |
| **Visual Novel Maker** | Desktop | Артисти | Візуальний редактор | Дорогий, обмежена гнучкість |
| **NarraLeaf** | Web/Desktop | Девелопи | TypeScript, сучасний | Молода екосистема, обмежена підтримка |
| **Unity + Naninovel** | Усі | Професіонали | Потужний, гнучкий | Важкий, потрібен C# |
| **VNE (цей проект)** | iOS/Android/Web | Девелопи + Письменники | React Native, TypeScript, крос-платформний | Рання стадія, немає спільноти |

### Унікальні переваги VNE

1. **Крос-платформність з нативним UI** — React Native + Expo дозволяє зібрати для iOS, Android, Web з одного коду. Жоден з конкурентів не пропонує цього з нативним UI.
2. **TypeScript екосистема** — повна типізація, IDE підтримка, рефакторинг. Ren'Py та TyranoBuilder мають власні мови.
3. **Сучасний стек** — React 19, Zustand, Zod, Reanimated, Expo 54 — актуальні технології з активною підтримкою.
4. **Вбудований редактор + рідер** — один додаток для створення та читання. Конкуренти зазвичай розділяють.
5. **Timeline-based редактор** — сучасний підхід до побудови сцен, відрізняється від лінійних скриптових редакторів.
6. **Документний редактор** — унікальна функція для письменників, які хочуть писати як у Google Docs.

### Слабкі сторони для ринку

1. **Рання стадія** — немає публічних релізів, немає спільноти
2. **Немає експорту в окремі ігри** — Ren'Py та TyranoBuilder дозволяють експортувати в standalone ігри
3. **Немає плагінів/модів** — екосистема плагінів відсутня
4. **Немає маркетплейсу ассетів** — конкуренти мають магазини ресурсів
5. **Залежність від Expo** — обмеження Expo SDK для деяких нативних функцій
6. **Немає білд-сервісу** — EAS Build потрібен для native білдів

### Рекомендації для виходу на ринок

**Фаза 1 — MVP (3-6 місяців):**
- Виправити esbuild, забезпечити стабільність тестів
- Експорт історій у JSON формат (сумісність з іншими інструментами)
- Базовий веб-демо для залучення користувачів
- Документація "Getting Started" для новачків

**Фаза 2 — Спільнота (6-12 місяців):**
- Відкрити вихідний код (якщо ще не відкрито)
- Створити шаблони історій (starter templates)
- Інтеграція з itch.io для публікації
- Локалізація (українська вже є — перевага)

**Фаза 3 — Монетизація (12+ місяців):**
- Хмарний сервіс для зберігання історій
- Маркетплейс ассетів
- Pro-версія з розширеними функціями редактора
- Інтеграція з Steam для публікацій

### Цільова аудиторія

**Первинна:** Незалежні розробники візуальних новел, які знають React/TypeScript та хочуть створювати крос-платформні ігри без вивчення нових мов.

**Вторинна:** Письменники, які хочуть створювати інтерактивні історії з мінімальним програмуванням.

**Третинна:** Навчальні заклади для викладання інтерактивного оповідання.

---

## Статистика проекту

| Метрика | Значення |
|---------|----------|
| Вихідні файли (.ts/.tsx) | ~170 (без тестів та моків) |
| Загальний LOC | ~28,000+ |
| Тестові файли | 42 |
| Файли в lib/ | 71 |
| Файли в components/ | 80 |
| Файли в hooks/ | 17 |
| Файли в stores/ | 5 |
| Файли в wiki/ | 32+ |
| `as any` | 0 |
| `@ts-ignore` | 0 |
| `as unknown as` | 5 |
| `console.*` без `__DEV__` | 0 |
| `accessibilityLabel/Role` | 217 |
| `data: any` | 0 |
| `router.*as never` | 0 |
| `eval()/new Function()` | 0 |
| `import * from stores` в lib/ | 0 (theme-provider.tsx — виняток) |
| `import * from @/lib/types` | 0 |

---

## Знаходження за пріоритетом

### 🔴 CRITICAL (0)

Немає CRITICAL знаходжень.

### 🟡 HIGH (0)

Немає HIGH знаходжень.

### 🟡 MEDIUM (5)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| M-01 | 5× `as unknown as` | 5 місць | Подвійне приведення без валідації (2 з 5 — demo story) |
| M-02 | ~601 inline style={{}} | components/ | Системна проблема з темами |
| M-03 | CharacterDisplay — 0 accessibility | components/CharacterDisplay.tsx | Персонажі невидимі для скрін-рідерів |
| M-04 | esbuild версія не збігається | — | Тестовий раннер не запускається |
| M-05 | Немає component tests | — | React Native компоненти не тестуються |

### 🟢 LOW (7)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| L-01 | theme-provider.tsx store import | lib/theme-provider.tsx:6 | Допустимий виняток (.tsx) |
| L-02 | Math.random() для ID | embedded-html.ts:263 | Не криптографічно безпечно |
| L-03 | Не всі Pressable мають accessibilityRole | components/ | Для скрін-рідерів |
| L-04 | Відсутність API-документації для lib/engine/ | wiki/ | Немає сторінки |
| L-05 | Немає E2E тестів | — | Критичні сценарії не протестовані |
| L-06 | Два паралельні моделі даних | scene-operations.ts | Legacy + Canonical співіснують |
| L-07 | console.log URL в api.ts | lib/_core/api.ts:89 | URL може містити чутливі параметри |

---

## Що працює добре (позитивні знаходження)

1. **TypeScript гігієна:** 0 `as any`, 0 `@ts-ignore`, 0 `data: any` — ідеальний показник
2. **Безпека OAuth:** Повний цикл валідації з crypto.getRandomValues, sessionStorage, SecureStore
3. **Архітектура екзек'ютора:** Чистий патерн useSceneExecutor з yielding/non-yielding блоками
4. **Декомпозиція:** StoryReaderResponsive 315 LOC, чисті шари lib/ → hooks/ → stores/
5. **CSP заголовок:** Наявний у app/+html.tsx
6. **Протокольна валідація:** isSafeUri() на всіх шарах
7. **Wiki-документація:** 32+ сторінки, changelog, hooks-reference
8. **Тестова інфраструктура:** 42 файли, vitest налаштовано
9. **lib/types.ts міграція:** 0 продакшен-імпортів з барреля
10. **Dark theme:** Всі кольори тематичні, 0 hardcoded colors
11. **console.* гарди:** Всі виклики всередині `if (__DEV__)`
12. **Layer boundaries:** 0 порушень lib/ → stores/
13. **OKLCH дизайн-система:** 61 токен, 3-рівнева архітектура
14. **Accessibility:** 217 атрибутів, декомпонований reader з a11y підтримкою
15. **Крос-платформність:** iOS/Android/Web з одного коду

---

## Порівняння з попередніми аудитами

| Знаходження | 2026-06-15 | 2026-06-16 | 2026-06-17 |
|-------------|------------|------------|------------|
| Загальна оцінка | 7.2/10 | 7.8/10 | 7.9/10 |
| 6 порушень lib/ → stores/ | ❌ OPEN | ✅ FIXED | ✅ FIXED |
| Hardcoded colors | ❌ OPEN | ✅ FIXED | ✅ FIXED |
| as unknown as | 8 | 6 | 5 |
| accessibilityLabel/Role | 186 | 186 | 217 |
| console.* без __DEV__ | ❌ FP | ✅ VERIFIED | ✅ VERIFIED |
| esbuild mismatch | ❌ OPEN | ❌ OPEN | ❌ OPEN |
| inline style={{}} | 601 | 601 | ~601 |
| component tests | ❌ NONE | ❌ NONE | ❌ NONE |
| CharacterDisplay a11y | — | — | ❌ NEW FINDING |

---

## Рекомендації

### Швидкі виправлення (Easy)
1. Виправити esbuild: `rm -rf node_modules && pnpm install` — розблокує тести
2. Додати accessibility для CharacterDisplay (accessibilityLabel з іменем персонажа)
3. Додати accessibilityState для loading/error станів у компонентах

### Середній пріоритет (Medium)
4. Додати unit-тести для component rendering (React Native Testing Library)
5. Замінити `as unknown as` на type guards (5 місць, 2 критичні — demo story)
6. Додати валідацію demo story через `StoryValidator.validateStory()`

### Довгострокові (Low)
7. Міграція inline style → StyleSheet.create/NativeWind (системна)
8. Додати E2E тести для критичних сценаріїв
9. Вивести legacy типи (Story, StoryScene, Choice) — запланована на 2026-Q3
10. Створити Extension Guide для розробників нових типів блоків

---

## Пов'язані сторінки

- [[full-project-review-2026-06-16]] — Попередній GSD-аудит (7.8/10)
- [[full-project-review-2026-06-15]] — Перший GSD-аудит (7.2/10)
- [[security-audit-report-2026-05-31-rev2]] — Аудит безпеки
- [[architecture-reference]] — Архітектурна довідка
- [[changelog]] — Історія змін
- [[hooks-reference]] — Довідка хуків
- [[engine-reference]] — Довідка двигуна
- [[components-reference]] — Довідка компонентів
- [[stores-reference]] — Довідка сторів
