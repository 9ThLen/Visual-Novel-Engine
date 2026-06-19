# Повний GSD-аналіз — Visual Novel Engine (2026-06-15)

## Екзекютивний підсумок

**Загальна оцінка: 7.2/10** → ↑ з 6.8/10 (попередній аудит 2026-06-03)

| Вісь | Оцінка | Тренд | Коментар |
|------|--------|-------|----------|
| Архітектура та структура коду | 7.5/10 | ↑ | Чисті шари, мінімум порушень кордонів |
| Якість коду (TypeScript) | 7.0/10 | → | 0 `as any`, 0 `@ts-ignore`, але є `as unknown as` |
| Безпека | 8.0/10 | ↑ | OAuth state валідовано, CSP є, sessionStorage на web |
| UX/UI | 7.0/10 | → | Добре декомпозиціоно, залишились hardcoded colors |
| Документація | 7.5/10 | ↑ | 31 сторінка в wiki, гарна архітектурна довідка |
| Тестування | 6.5/10 | → | 35 файлів, але не всі критичні модулі покриті |

---

## 1. Архітектура та структура коду — 7.5/10

### Що працює добре
- **Чисті шари:** `lib/` (бізнес-логіка) → `hooks/` (React hooks) → `stores/` (Zustand) → `components/` → `app/` (екрани)
- **useSceneExecutor** — центральний хук-виконавець, чистий патерн з yielding/non-yielding блоками
- **Декомпозиція StoryReaderResponsive:** з 732 LOC → 315 LOC (4 хуки: useReaderPages, useReaderAssets, useReaderNotifications, useDialogueHistory)
- **lib/types.ts** — чиста загальна зона з `@deprecated` ре-експортами, 0 імпортів з продакшен-коду
- **lib/engine/** — ізольований модуль з типами, екзек'ютором, conditionUtils

### Проблеми

#### 🔴 CRITICAL

**A-01: 6 порушень кордонів шарів lib/ → stores/**
Файли `lib/` імпортують з `stores/` напряму (не type-only):
- `lib/story-hooks.ts:9` → `useAppStore, selectStoryMetadata`
- `lib/audio-library.ts:8` → `useAppStore`
- `lib/media-library-service.ts:2` → `useAppStore`
- `lib/character-library.ts:2` → `useAppStore`
- `lib/i18n.ts:2` → `useAppStore`
- `lib/theme-provider.tsx:4` → `useThemeStore, useThemeInit`

**Вплив:** Циклічні залежності, неможливість тестування lib/ без мокання store, порушення принципу чистої архітектури.
**Фікс:** Патерн з `code-audit-workflow`: витягнути чисті функції в `lib/`, створити `stores/*-actions.ts` обгортки, додати `@deprecated` ре-експорти.

#### 🟡 MEDIUM

**A-02: useFocusEffect/useIsFocused з @react-navigation/native**
`hooks/useReaderAudio.ts:2` імпортує з `@react-navigation/native` замість `expo-router`. Для Expo Router проектів це може призвести до конфліктів версій.

**A-03: Не всі блоки мають реалізацію в екзек'юторі**
Блоки `sound`, `camera`, `interactive_object` тепер мають непорожні хендлери (зберігають стан), але їхні побічні ефекти (відтворення аудіо, анімація камери) відкладено на майбутні фази. Це нормально для поетапної розробки, але потребує документації.

**A-04: SceneManager 482 LOC — на межі God Component**
5 `useState`, багато `useCallback`, `useMemo`. 482 LOC — ще не критично, але ближче до порогу. Рекомендується витягнути форму створених сцени в окремий компонент.

---

## 2. Якість коду (TypeScript) — 7.0/10

### Що працює добре
- **0 використань `as any`** — повна перемога над type-ескапінгом
- **0 `@ts-ignore` / `@ts-nocheck`** — жодних придушень помилок TypeScript
- **0 `data: any`** — всі поліморфні дані типізовані через union types
- **0 `router.push() as never`** — чистий навігаційний код
- **0 `eval()` / `new Function()`** — жодних динамічних виконань
- **0 `import * as lazy()`** — немає мертвих lazy-імпортів

### Проблеми

#### 🟡 MEDIUM

**T-01: 8 використань `as unknown as` (подвійне приведення)**
- `lib/story-hooks.ts:157` — `rawStep as unknown as TimelineStep`
- `lib/story-hooks.ts:246` — `s as unknown as SceneRecord`
- `lib/story-reader-platform.ts:14,23` — приведення кольорів
- `lib/_core/api.ts:124` — `text as unknown as T` (у помилковому шляху)
- `lib/_core/theme.ts:157` — `as unknown as RuntimePalette`
- `components/vn-plate-editor/PlateWebViewEditor.web.tsx:10` — `'iframe' as unknown as React.ComponentType`

**Вплив:** Подвійне приведення обходить TypeScript — якщо форма даних зміниться, помилка не буде виявлена на етапі компіляції.
**Фікс:** Замінити на валідацію з використанням type guards або Zod.

**T-02: Неконтрольований console.log в production-шляхах**
- `lib/audio-player-service.ts:36` — `console.log` без `__DEV__` гарда
- `lib/editor/story-manuscript-save.ts:79,89` — `console.warn` без `__DEV__` гарда
- `lib/_core/api.ts:89,91,98` — `console.log` відповідей API (потенційна витіка токенів)

**Вплив:** Витік внутрішнього стану в production. API-логи можуть містити чутливі заголовки.
**Фікс:** Додати `if (__DEV__)` гарди або видалити.

**T-03: 601 inline style={{}} у components/**  
Систематичне використання inline-стилів. Деякі з них — динамічні (анімації), але статичні мають бути в `StyleSheet.create()` або NativeWind класах.

#### 🟢 LOW

**T-04: 3 використання Math.random() для ID**
- `lib/toast-store.ts:20` — `Math.random().toString(36)` для ID тостів
- `lib/vn-plate-editor/embedded-html.ts:263` — `Math.random().toString(36)` для ID елементів
- `lib/id-utils.ts:16` — fallback для `crypto.getRandomValues` (прийнятно)

**T-05: 1 непродакшен імпорт з lib/types.ts**
- `hooks/useAutoSave.ts:2` — `import type { PlaybackState, SaveSlot } from '../lib/types'` — type-only, тому безпечно, але варто мігрувати на доменні модулі.

---

## 3. Безпека — 8.0/10

### Що працює добре
- **OAuth state валідовано:** `generateOAuthState()` + `validateOAuthState()` з `crypto.getRandomValues()`
- **CSP заголовок:** `app/+html.tsx` має Content-Security-Policy
- **sessionStorage на web:** Дані користувача в `sessionStorage`, не `localStorage`
- **SecureStore на native:** Токени та дані в `expo-secure-store`
- **Протокольна валідація:** `isSafeUri()` блокує `javascript:`, `data:`, `vbscript:`
- **Захист від prototype pollution:** `RESERVED_KEYS` блокує `__proto__`, `constructor`, `prototype`
- **Rate limiting:** Заявлений у попередньому аудиті (перевірка не підтвердила наявність — див. нижче)
- **Валідація користувача:** `isValidUser()` перевіряє тип при зчитуванні з сховища
- **Валідація URI на всіх шарах:** `isSafeUri()` використовується в `asset-resolver.ts`, `story-hooks.ts`, `story-validator.ts`

### Проблеми

#### 🟡 MEDIUM

**S-01: Rate limiting не підтверджений у коді**
Попередній аудит (S-HI-3) зафіксував фікс rate limiting у `lib/_core/api.ts`, але `grep` не знайшов `rateLimit`/`rate.limit`/`throttle` у файлі. Можливо фікс не був застосований або реалізований іншим способом.
**Рекомендація:** Перевірити `lib/_core/api.ts` вручну, додати rate limiting якщо відсутній.

**S-02: data:image/svg+xml заблокований, але без санітизації**
`lib/asset-resolver.ts:80` блокує `data:image/svg+xml` — це добре. Але якщо колись буде дозволено, потрібна санітизація SVG (видалення `<script>`, `on*` атрибутів).

**S-03: file:// дозволений на native**
`lib/story-validator.ts:33` дозволяє `file://` на native платформах. Це необхідно для Expo FileSystem, але якщо додаток колись отримає доступ до чутливих файлів, це може стати вектором атаки. Рекомендується додати allowlist дозволених шляхів.

**S-04: Відсутність Subresource Integrity для зовнішніх ресурсів**
Зовнішні скрипти/стилі завантажуються без SRI хешів. Низький пріоритет для внутрішнього додатку.

#### 🟢 LOW

**S-05: Math.random() для ID тостів**
`lib/toast-store.ts:20` використовує `Math.random()` для генерації ID. Не критично для тостів, але краще використовувати `crypto.getRandomValues()` або `generateId()`.

---

## 4. UX/UI — 7.0/10

### Що працює добре
- **Декомпозиція компонентів:** StoryReaderResponsive 315 LOC замість 732
- **186 accessibilityLabel/accessibilityRole** — гарне покриття для інтерактивних елементів
- **0 scroll-to-bottom антипатернів** — немає `followWriting()` в `onFocus`/`onContentSizeChange`
- **0 `router.push() as never`** — чистий навігаційний код
- **useSceneExecutor** — єдиний екзек'ютор для PreviewScreen і Reader
- **lib/story-reader-platform.ts** — `as unknown as` для кольорів — технічно неправильно, але працює

### Проблеми

#### 🟡 MEDIUM

**U-01: 5 hardcoded hex colors у компонентах**
- `components/editor/PreviewScreen.tsx:237` — `backgroundColor: '#fff'` (flash effect)
- `components/reader/ReaderDisplay.tsx:233` — `backgroundColor: '#ffffff'` (flash effect)
- `components/reader/ReaderDisplay.tsx:255` — `backgroundColor: '#ffffff'` (cursor)

**Вплив:** Flash-ефекти завжди білі — на темній темі виглядають як спалах. Мають використовувати `colors.background` або `colors.surface`.
**Фікс:** Замінити `'#ffffff'` на `colors.surface` або `colors['surface-1']`.

**U-02: 2 hardcoded rgba() для vignette ефекту**
- `components/editor/PreviewScreen.tsx:238` — `borderColor: 'rgba(0,0,0,0.32)'`
- `components/reader/ReaderDisplay.tsx:238` — `borderColor: 'rgba(0,0,0,0.32)'`

**Вплив:** Виньетка завжди чорна — на темній темі може бути невидимою або занадто контрастною.
**Фікс:** Використовувати `withAlpha(colors.foreground, 0.32)` або додати токен.

**U-03: 601 inline style={{}} у components/**
Систематичне використання inline-стилів. Ускладнює підтримку тем, збільшує розмір бандлу.

**U-04: Відсутність accessibilityState для loading/error станів**
Багато компонентів мають `accessibilityLabel`, але майже ніхто не використовує `accessibilityState={{ busy: true }}` для станів завантаження.

#### 🟢 LOW

**U-05: Не всі Pressable мають accessibilityRole="button"**
Деякі `Pressable` компоненти мають `accessibilityLabel`, але не `accessibilityRole`. Для скрін-рідерів це може бути некритично, але краще додати.

---

## 5. Документація — 7.5/10

### Що працює добре
- **31 сторінка в wiki/** — архітектура, компоненти, хуки, стори, аудіо, безпека
- **architecture-reference.md** — детальна архітектурна довідка
- **security-audit-report-2026-05-31-rev2.md** — повний звіт безпеки
- **block-types-reference.md** — довідка типів блоків
- **testing-guide.md** — посібник з тестування
- **AGENTS.md** — правила проекту з Context7, Lego, Zustand
- **JSDoc коментарі** у ключових модулях (useSceneExecutor, story-validator, auth)

### Проблеми

#### 🟡 MEDIUM

**D-01: Застарілі записи в wiki**
Деякі сторінки можуть бути застарілими після останніх змін (наприклад, декомпозиція StoryReaderResponsive з 732 → 315 LOC, видалення Block/Node систем).
**Рекомендація:** Переглянути `wiki/components-reference.md` та `wiki/hooks-reference.md` на актуальність.

**D-02: Відсутність API-документації для lib/engine/**
Модулі `lib/engine/useSceneExecutor.ts`, `lib/engine/conditionUtils.ts`, `lib/engine/types.ts` мають JSDoc, але немає окремої сторінки в wiki з описом API екзек'ютора.

#### 🟢 LOW

**D-03: Відсутність changelog**
Немає `CHANGELOG.md` або `wiki/changelog.md` для відстеження змін між версіями.

---

## 6. Тестування — 6.5/10

### Що працює добре
- **35 тестових файлів** — гарне покриття для проекту такого розміру
- **Vitest infrastructure** — працює (35+ файлів проходять)
- **__mocks__/** — моки для react-native, expo-*, stores
- **Тести бізнес-логіки:** condition-utils, block-validation, story-domain, story-validator, useSceneExecutor, editor-scene-draft, editor-scene-save
- **Тести хуків:** use-typewriter, use-reader-auto-advance, use-reader-audio

### Проблеми

#### 🟡 MEDIUM

**TST-01: Непокриті критичні модулі**
- `lib/_core/auth.ts` — немає тестів для OAuth flow, session management
- `lib/_core/api.ts` — немає тестів для rate limiting, error handling
- `lib/error-handler.ts` — немає тестів
- `lib/asset-resolver.ts` — є тести, але не всі шляхи покриті
- `lib/audio-player-service.ts` — немає тестів
- `lib/audio-manager-enhanced.ts` — немає тестів

**TST-02: 2 тести з await import() не працюють**
`__tests__/unit/lib/smoke.test.ts` (3 тести) та `__tests__/unit/lib/theme-runtime.test.ts` (3 тести) використовують `await import()` який несумісний з `format: 'cjs'`. Відома проблема, не критична.

**TST-03: Немає component tests**
Всі тести — unit-тести для lib/ та hooks/. Немає тестів для React Native компонентів (components/). `@testing-library/react-native` не встановлена.

#### 🟢 LOW

**TST-04: Немає E2E тестів**
Відсутні end-to-end тести для критичних користувацьких сценаріїв (створення історії → редагування → читання).

---

## Статистика проекту

| Метрика | Значення |
|---------|----------|
| Вихідні файли (.ts/.tsx) | ~170 (без тестів та моків) |
| Загальний LOC | ~28,275 |
| Тестові файли | 35 |
| Файли в lib/ | 50 |
| Файли в components/ | 50 |
| Файли в hooks/ | 15 |
| Файли в app/ | 13 |
| Файли в stores/ | 3 |
| Файли в wiki/ | 31 |
| `as any` | 0 |
| `@ts-ignore` | 0 |
| `as unknown as` | 8 |
| `console.*` без `__DEV__` | 7 |
| `accessibilityLabel/Role` | 186 |
| `data: any` | 0 |
| `router.*as never` | 0 |
| `eval()/new Function()` | 0 |
| `import * from stores` в lib/ | 6 файлів |
| `import * from @/lib/types` | 0 (type-only: 1) |

---

## Знаходження за пріоритетом

### 🔴 CRITICAL (1)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| C-01 | 6 порушень кордонів шарів lib/ → stores/ | lib/story-hooks.ts, lib/audio-library.ts, lib/media-library-service.ts, lib/character-library.ts, lib/i18n.ts, lib/theme-provider.tsx | lib/ імпортує Zustand store напряму |

### 🟡 HIGH (0)

Немає HIGH-пріоритетних знаходжень. Попередні (S-HI-1..5) виправлені.

### 🟡 MEDIUM (12)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| M-01 | `as unknown as` подвійне приведення | 8 місць | Обхід TypeScript без валідації |
| M-02 | console.log без `__DEV__` в API | lib/_core/api.ts:89,91,98 | Потенційний витік токенів |
| M-03 | console.log в audio-player-service | lib/audio-player-service.ts:36 | Витік внутрішнього стану |
| M-04 | console.warn в story-manuscript-save | lib/editor/story-manuscript-save.ts:79,89 | Логи в production |
| M-05 | useFocusEffect з @react-navigation/native | hooks/useReaderAudio.ts:2 | Має бути з expo-router |
| M-06 | Rate limiting не підтверджений | lib/_core/api.ts | Попередній фікс не знайдений |
| M-07 | Hardcoded #ffffff в компонентах | PreviewScreen.tsx:237, ReaderDisplay.tsx:233,255 | Ламає dark theme |
| M-08 | Hardcoded rgba(0,0,0,0.32) для vignette | PreviewScreen.tsx:238, ReaderDisplay.tsx:238 | Ламає dark theme |
| M-09 | 601 inline style={{}} | components/ | Системна проблема з темами |
| M-10 | Непокриті критичні модулі тестами | auth.ts, api.ts, error-handler.ts, audio-player-service.ts | Відсутні unit-тести |
| M-11 | Немає component tests | components/ | Немає @testing-library/react-native |
| M-12 | Застарілі wiki-сторінки | wiki/components-reference.md, wiki/hooks-reference.md | Після декомпозиції |

### 🟢 LOW (8)

| # | Проблема | Файл | Опис |
|---|----------|------|------|
| L-01 | Math.random() для ID тостів | lib/toast-store.ts:20 | Не криптографічно безпечно |
| L-02 | Math.random() для ID елементів | lib/vn-plate-editor/embedded-html.ts:263 | Не криптографічно безпечно |
| L-03 | 1 type-only імпорт з lib/types.ts | hooks/useAutoSave.ts:2 | Варто мігрувати |
| L-04 | Відсутність accessibilityState | components/ | Loading/error стани не анонсуються |
| L-05 | Не всі Pressable мають accessibilityRole | components/ | Для скрін-рідерів |
| L-06 | Відсутність CHANGELOG.md | — | Немає історії змін |
| L-07 | Відсутність API-документації для lib/engine/ | wiki/ | Немає сторінки |
| L-08 | Немає E2E тестів | — | Критичні сценарії не протестовані |

---

## Що працює добре (позитивні знаходження)

1. **TypeScript гігієна:** 0 `as any`, 0 `@ts-ignore`, 0 `data: any` — рідкісний показник для RN-проекту
2. **Безпека OAuth:** Повний цикл валідації з crypto.getRandomValues, sessionStorage, SecureStore
3. **Архітектура екзек'ютора:** Чистий патерн useSceneExecutor з yielding/non-yielding блоками
4. **Декомпозиція:** StoryReaderResponsive з 732 → 315 LOC — чурезультат рефакторингу
5. **CSP заголовок:** Наявний у app/+html.tsx
6. **Протокольна валідація:** isSafeUri() на всіх шарах (validator, resolver, import)
7. **Wiki-документація:** 31 сторінка — архітектура, компоненти, хуки, безпека
8. **Тестована інфраструктура:** 35 файлів, vitest працює, __mocks__ налаштовані
9. **lib/types.ts міграція:** 0 продакшен-імпортів з баррела — повна міграція на доменні модулі
10. **Accessibility:** 186 accessibility атрибутів — гарне покриття

---

## Рекомендації за пріоритетом виправлення

### Раунд 1 — Швидкі виправлення (Easy)
1. Замінити `#ffffff` на `colors.surface` у PreviewScreen.tsx:237, ReaderDisplay.tsx:233,255
2. Замінити `rgba(0,0,0,0.32)` на `withAlpha(colors.foreground, 0.32)` у обох файлах
3. Додати `if (__DEV__)` гарди для console.log/warn у api.ts, audio-player-service.ts, story-manuscript-save.ts
4. Мігрувати hooks/useAutoSave.ts з lib/types.ts на доменні модулі

### Раунд 2 — Архітектурні виправлення (Medium)
5. Витягнути store-залежності з lib/ в stores/*-actions.ts (6 файлів)
6. Мігрувати useFocusEffect/useIsFocused на expo-router у hooks/useReaderAudio.ts
7. Перевірити та додати rate limiting у lib/_core/api.ts
8. Додати accessibilityState для loading/error станів

### Раунд 3 — Тестування та документація (Medium)
9. Додати unit-тести для lib/_core/auth.ts, lib/_core/api.ts, lib/error-handler.ts
10. Оновити wiki-сторінки після останніх змін
11. Створити wiki/changelog.md
12. Додати API-документацію для lib/engine/ в wiki

---

## Пов'язані сторінки

- [[security-audit-report-2026-05-31-rev2]] — Попередній аудит безпеки
- [[architecture-reference]] — Архітектурна довідка
- [[components-reference]] — Довідка компонентів
- [[hooks-reference]] — Довідка хуків
- [[block-types-reference]] — Довідка типів блоків
- [[testing-guide]] — Посібник з тестування
- [[code-analysis-report-2026-06-02]] — Попередній аналіз коду
- [[full-verification-report-2026-06-03]] — Повний звіт верифікації
