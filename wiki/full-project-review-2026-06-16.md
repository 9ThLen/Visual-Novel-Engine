# Повний GSD-аналіз — Visual Novel Engine (2026-06-16)

## Екзекютивний підсумок

**Загальна оцінка: 7.8/10** ↑ з 7.2/10 (попередній аудит 2026-06-15)

| Вісь | Оцінка | Тренд | Коментар |
|------|--------|-------|----------|
| Архітектура та структура коду | 8.5/10 | ↑ | Всі 6 порушень lib/→stores/ виправлено |
| Якість коду (TypeScript) | 7.5/10 | ↑ | 0 as any, 0 @ts-ignore, console.* мають __DEV__ гарди |
| Безпека | 8.0/10 | → | Без змін — залишається сильною стороною |
| UX/UI | 7.5/10 | ↑ | Hardcoded colors виправлено, dark theme працює |
| Документація | 8.0/10 | ↑ | 32 сторінки wiki, changelog створено |
| Тестування | 6.5/10 | → | 42 тестових файли, esbuild блокує запуск |

---

## 1. Архітектура та структура коду — 8.5/10

### Що працює добре
- **Чисті шари:** `lib/` (бізнес-логіка) → `hooks/` (React hooks) → `stores/` (Zustand) → `components/` → `app/` (екрани)
- **0 порушень lib/ → stores/ (runtime imports)** — всі 6 виправлено у попередньому раунді
- **useSceneExecutor** — центральний хук-виконавець, чистий патерн
- **lib/types.ts** — чиста загальна зона, 0 продакшен-імпортів
- **Нові файли:** `hooks/use-story-state.ts`, `hooks/use-i18n.ts`, `stores/audio-library-actions.ts`, `stores/media-library-actions.ts`

### Залишилось

#### 🟢 LOW

**A-01: theme-provider.tsx — store import**
`lib/theme-provider.tsx:6` імпортує `useThemeStore, useThemeInit` з `@/stores/theme-store`.
**Статус:** Допустимий виняток — це React component (.tsx), не чиста бізнес-логіка. Задокументовано коментарем.

---

## 2. Якість коду (TypeScript) — 7.5/10

### Що працює добре
- **0 використань `as any`** — повна перемога
- **0 `@ts-ignore` / `@ts-nocheck`** — жодних придушень
- **0 `data: any`** — всі поліморфні дані типізовані
- **0 `router.push() as never`** — чистий навігаційний код
- **0 `eval()` / `new Function()`** — жодних динамічних виконань
- **Всі console.* мають __DEV__ гарди** — перевірено вручну всі 9 місць

### Залишилось

#### 🟡 MEDIUM

**T-01: 6 використань `as unknown as`**
- `lib/story-hooks.ts:165` — `rawStep as unknown as TimelineStep`
- `lib/story-hooks.ts:253` — `s as unknown as SceneRecord`
- `lib/story-reader-platform.ts:14,23` — приведення кольорів
- `lib/_core/api.ts:124` — `text as unknown as T`
- `lib/_core/theme.ts:157` — `as unknown as RuntimePalette`
- `components/vn-plate-editor/PlateWebViewEditor.web.tsx:10` — `'iframe' as unknown as React.ComponentType`

**Вплив:** Подвійне приведення обходить TypeScript.
**Пріоритет:** LOW — це ізольовані випадки, не системна проблема.

#### 🟢 LOW

**T-02: 3 використання Math.random() для ID**
- `lib/toast-store.ts:20` — для ID тостів (не критично)
- `lib/vn-plate-editor/embedded-html.ts:263` — для ID елементів (не критично)
- `lib/id-utils.ts:16` — fallback для crypto.getRandomValues (прийнятно)

**T-03: 601 inline style={{}} у components/**
Системна проблема, не фікситься за 1 сесію. LOW пріоритет.

---

## 3. Безпека — 8.0/10

### Що працює добре
- **OAuth state валідовано:** `generateOAuthState()` + `validateOAuthState()` з `crypto.getRandomValues()`
- **CSP заголовок:** `app/+html.tsx` має Content-Security-Policy
- **sessionStorage на web:** Дані користувача в `sessionStorage`, не `localStorage`
- **SecureStore на native:** Токени та дані в `expo-secure-store`
- **Протокольна валідація:** `isSafeUri()` блокує `javascript:`, `data:`, `vbscript:`
- **Захист від prototype pollution:** `RESERVED_KEYS` блокує `__proto__`, `constructor`, `prototype`
- **Rate limiting:** `RATE_LIMIT` константа в `lib/_core/api.ts:8-13`
- **Валідація користувача:** `isValidUser()` перевіряє тип при зчитуванні з сховища
- **Валідація URI на всіх шарах:** `isSafeUri()` використовується в `asset-resolver.ts`, `story-hooks.ts`, `story-validator.ts`
- **JSON.parse з валідацією:** `isValidUser()` після JSON.parse в auth.ts

### Залишилось

#### 🟡 MEDIUM

**S-01: data:image/svg+xml заблокований, але без санітизації**
`lib/asset-resolver.ts:80` блокує `data:image/svg+xml`. Якщо колись буде дозволено — потрібна санітизація SVG.

**S-02: file:// дозволений на native**
`lib/story-validator.ts:33` дозволяє `file://` на native платформах. Необхідно для Expo FileSystem.

#### 🟢 LOW

**S-03: Відсутність Subresource Integrity для зовнішніх ресурсів**
Низький пріоритет для внутрішнього додатку.

---

## 4. UX/UI — 7.5/10

### Що працює добре
- **Hardcoded colors виправлено:** `#ffffff` → `colors.surface`, `rgba(0,0,0,0.32)` → `withAlpha(colors.foreground, 0.32)`
- **186 accessibilityLabel/accessibilityRole** — гарне покриття
- **0 scroll-to-bottom антипатернів**
- **useSceneExecutor** — єдиний екзек'ютор для PreviewScreen і Reader
- **Dark theme працює** — всі кольори теж тематичні

### Залишилось

#### 🟡 MEDIUM

**U-01: 601 inline style={{}} у components/**
Системна проблема. Ускладнює підтримку тем.

**U-02: Відсутність accessibilityState для loading/error станів**
Багато компонентів мають `accessibilityLabel`, але майже ніхто не використовує `accessibilityState={{ busy: true }}`.

#### 🟢 LOW

**U-03: Не всі Pressable мають accessibilityRole="button"**
Деякі `Pressable` компоненти мають `accessibilityLabel`, але не `accessibilityRole`.

---

## 5. Документація — 8.0/10

### Що працює добре
- **32 сторінки в wiki/** — архітектура, компоненти, хуки, стори, аудіо, безпека
- **architecture-reference.md** — детальна архітектурна довідка
- **security-audit-report-2026-05-31-rev2.md** — повний звіт безпеки
- **changelog.md** — створено, актуальний
- **hooks-reference.md** — оновлено з новими хуками
- **AGENTS.md** — правила проекту з Context7, Lego, Zustand
- **JSDoc коментарі** у ключових модулях

### Залишилось

#### 🟢 LOW

**D-01: Відсутність API-документації для lib/engine/**
Модулі `lib/engine/useSceneExecutor.ts`, `lib/engine/conditionUtils.ts` мають JSDoc, але немає окремої сторінки в wiki.

---

## 6. Тестування — 6.5/10

### Що працює добре
- **42 тестових файли** — гарне покриття для проекту такого розміру
- **Vitest infrastructure** — налаштовано (__mocks__, vitest.config.ts, vitest.setup.ts)
- **Тести бізнес-логіки:** condition-utils, block-validation, story-domain, story-validator, useSceneExecutor, editor-scene-draft, editor-scene-save
- **Тести хуків:** use-typewriter, use-reader-auto-advance, use-reader-audio
- **Новий тест:** `__tests__/unit/lib/auth.test.ts` — створено (заблоковано esbuild)

### Залишилось

#### 🟡 MEDIUM

**TST-01: esbuild версія не збігається (0.21.5 vs 0.28.0)**
Тестовий раннер не запускається. Інфраструктурна проблема, не код.
**Фікс:** `rm -rf node_modules && pnpm install` або `pnpm add -D esbuild@0.28.0`

**TST-02: Непокриті критичні модулі**
- `lib/_core/api.ts` — немає тестів
- `lib/error-handler.ts` — немає тестів
- `lib/audio-player-service.ts` — немає тестів

**TST-03: Немає component tests**
Всі тести — unit-тести для lib/ та hooks/. Немає тестів для React Native компонентів.

---

## Статистика проекту

| Метрика | Значення |
|---------|----------|
| Вихідні файли (.ts/.tsx) | ~170 (без тестів та моків) |
| Загальний LOC | ~28,465 |
| Тестові файли | 42 |
| Файли в lib/ | 50 |
| Файли в components/ | 50 |
| Файли в hooks/ | 17 |
| Файли в stores/ | 5 |
| Файли в wiki/ | 32 |
| `as any` | 0 |
| `@ts-ignore` | 0 |
| `as unknown as` | 6 |
| `console.*` без `__DEV__` | 0 |
| `accessibilityLabel/Role` | 186 |
| `data: any` | 0 |
| `router.*as never` | 0 |
| `eval()/new Function()` | 0 |
| `import * from stores` в lib/ | 0 (theme-provider.tsx — виняток) |
| `import * from @/lib/types` | 0 |

---

## Знаходження за пріоритетом

### 🔴 CRITICAL (0)

Немає CRITICAL знаходжень. Всі виправлено у попередньому раунді.

### 🟡 HIGH (0)

Немає HIGH знаходжень.

### 🟡 MEDIUM (5)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| M-01 | 6× `as unknown as` | 6 місць | Подвійне приведення без валідації |
| M-02 | 601 inline style={{}} | components/ | Системна проблема з темами |
| M-03 | Відсутність accessibilityState | components/ | Loading/error стани не анонсуються |
| M-04 | esbuild версія не збігається | — | Тестовий раннер не запускається |
| M-05 | Непокриті модулі тестами | api.ts, error-handler.ts, audio-player-service.ts | Відсутні unit-тести |

### 🟢 LOW (6)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| L-01 | theme-provider.tsx store import | lib/theme-provider.tsx:6 | Допустимий виняток (.tsx) |
| L-02 | Math.random() для ID | toast-store.ts:20, embedded-html.ts:263 | Не криптографічно безпечно |
| L-03 | Не всі Pressable мають accessibilityRole | components/ | Для скрін-рідерів |
| L-04 | Відсутність CHANGELOG.md | — | Створено як wiki/changelog.md |
| L-05 | Відсутність API-документації для lib/engine/ | wiki/ | Немає сторінки |
| L-06 | Немає E2E тестів | — | Критичні сценарії не протестовані |

---

## Що працює добре (позитивні знаходження)

1. **TypeScript гігієна:** 0 `as any`, 0 `@ts-ignore`, 0 `data: any` — ідеальний показник
2. **Безпека OAuth:** Повний цикл валідації з crypto.getRandomValues, sessionStorage, SecureStore
3. **Архітектура екзек'ютора:** Чистий патерн useSceneExecutor з yielding/non-yielding блоками
4. **Декомпозиція:** StoryReaderResponsive 315 LOC, чисті шари lib/ → hooks/ → stores/
5. **CSP заголовок:** Наявний у app/+html.tsx
6. **Протокольна валідація:** isSafeUri() на всіх шарах
7. **Wiki-документація:** 32 сторінки, changelog, hooks-reference
8. **Тестова інфраструктура:** 42 файли, vitest налаштовано
9. **lib/types.ts міграція:** 0 продакшен-імпортів з барреля
10. **Dark theme:** Всі кольори тематичні, hardcoded colors виправлено
11. **console.* гарди:** Всі 9 викликів всередині `if (__DEV__)`
12. **Layer boundaries:** 0 порушень lib/ → stores/ (theme-provider.tsx — документований виняток)

---

## Порівняння з попереднім аудитом (2026-06-15)

| Знаходження | Статус 2026-06-15 | Статус 2026-06-16 |
|-------------|-------------------|-------------------|
| 6 порушень lib/ → stores/ | ❌ OPEN | ✅ FIXED |
| Hardcoded #ffffff / rgba() | ❌ OPEN | ✅ FIXED |
| useFocusEffect з неправильного джерела | ❌ OPEN | ✅ FIXED |
| type-only імпорт з lib/types.ts | ❌ OPEN | ✅ FIXED |
| console.* без __DEV__ | ❌ OPEN (false positive) | ✅ VERIFIED (всі мають гарди) |
| Rate limiting не підтверджений | ❌ OPEN (false positive) | ✅ VERIFIED (RATE_LIMIT є) |
| as unknown as (8→6) | ❌ OPEN | 🟡 PARTIAL (зменшено з 8 до 6) |
| 601 inline style | ❌ OPEN | ❌ OPEN (системна) |
| Непокриті тестами | ❌ OPEN | ❌ OPEN (esbuild блокує) |

---

## Рекомендації

### Швидкі виправлення (Easy)
1. Виправити esbuild: `pnpm add -D esbuild@0.28.0` — розблокує тести
2. Додати accessibilityState для loading/error станів

### Середній пріоритет (Medium)
3. Додати unit-тести для api.ts, error-handler.ts, audio-player-service.ts
4. Замінити `as unknown as` на type guards (6 місць)

### Довгострокові (Low)
5. Міграція inline style → StyleSheet.create/NativeWind (системна)
6. Додати E2E тести для критичних сценаріїв

---

## Пов'язані сторінки

- [[full-project-review-2026-06-15]] — Попередній GSD-аудит (7.2/10)
- [[security-audit-report-2026-05-31-rev2]] — Аудит безпеки
- [[architecture-reference]] — Архітектурна довідка
- [[changelog]] — Історія змін
- [[hooks-reference]] — Довідка хуків
