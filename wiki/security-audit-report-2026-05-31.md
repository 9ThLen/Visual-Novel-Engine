# Звіт аудиту безпеки VNE — 2026-05-31

## Загальна оцінка: **7.5/10** 🟡

Проект має базовий рівень захисту (валідація імпорту, санітизація, path traversal prevention), але є серйозні прогалини в авторизації, обробці помилок та деяких векторах ін'єкцій.

---

## Критичні вразливості (CRITICAL)

### C-1: `data:` URI не повністю заблоковано — можливий XSS через SVG
**Файл:** `story-validator.ts:204`, `asset-resolver.ts:147-161`

Валідатор URI (`validateUri`) дозволяє `file://` протокол (рядок 224):
```typescript
!lowerUri.startsWith('file://') &&
```
Але в `asset-resolver.ts` data URI фільтруються ТІЛЬКИ за префіксом:
```typescript
const safeDataPrefixes = ['data:image/', 'data:audio/', 'data:video/', 'data:font/', ...]
```

**Ризик:** `data:text/html;base64,...` або `data:image/svg+xml;base64,...` з JavaScript всередині SVG пройдуть фільтр в `asset-resolver.ts` але можуть бути заблоковані в `story-validator.ts`. Немає єдиної точки валідації. Якщо шлях проходить через `story-validator.ts` → `validateUri` повертає `file://` URI → `asset-resolver.ts` не перевіряє `file://` на безпеку.

**Рекомендація:** Створити єдину функцію `isSafeUri()` яка перевіряє ВСІ протоколи. Заборонити `file://` повністю якщо не потрібен локальний доступ. Додати блокування `data:text/html` та `data:application/xhtml+xml`.

### C-2: OAuth state parameter не валідується (CSRF в OAuth)
**Файл:** `app/oauth/callback.tsx:15-21`, `api.ts:98-121`

Параметр `state` приходить з OAuth callback але НІДЕ не перевіряється на відповідність згенерованому значенню:
```typescript
export async function exchangeOAuthCode(code: string, state: string): Promise<...> {
  // state передається на backend але не перевіряється локально
```

**Ризик:** CSRF атака на OAuth flow — зловмисник може прив'язати свій акаунт до сесії жертви.

**Рекомендація:** Генерувати `state` на початку OAuth flow, зберігати в SecureStore/localStorage, і перевіряти в callback перед `exchangeOAuthCode()`.

### C-3: Користувацькі дані з OAuth callback не санітизуються
**Файл:** `app/oauth/callback.tsx:35-52`

User info декодується з base64 параметра URL без валідації:
```typescript
const userJson = typeof atob !== "undefined" ? atob(params.user) : Buffer.from(params.user, "base64").toString("utf-8");
const userData = JSON.parse(userJson);
```

**Ризик:** Якщо зловмисник підробить `user` параметр, можна інжектувати довільні дані (openId, email) в сесію користувача. `JSON.parse` може бути експлуітований через prototype pollution.

**Рекомендація:** Не довіряти URL-параметрам. Отримувати user info з backend API (`/api/auth/me`) після встановлення session token.

---

## Високі вразливості (HIGH)

### H-1: localStorage для user info на web (XSS → token theft)
**Файл:** `auth.ts:64-66`, `auth.ts:88-90`

На web платформі user info зберігається в `localStorage`:
```typescript
info = typeof window !== 'undefined' ? window.localStorage.getItem(USER_INFO_KEY) : null;
window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
```

**Ризик:** Будь-яка XSS в web-версії може вкрасти user info з localStorage. На native — SecureStore використовується правильно, але web fallback незахищений.

**Рекомендація:** Використовувати `httpOnly` cookies для session на web. Не зберігати user info в localStorage — отримувати з `/api/auth/me` при кожному завантаженні.

### H-2: Немає rate limiting на API виклики
**Файл:** `api.ts:15-94`

`apiCall()` не має rate limiting, retry with backoff, або circuit breaker:
```typescript
const response = await fetch(url, { ...options, headers, credentials: ... });
```

**Ризик:** Необмежені запити до API можуть призвести до DoS або вичерпання квоти API.

**Рекомендація:** Додати rate limiting на клієнтській стороні (max N запитів/хвилину) та exponential backoff для retry.

### H-3: Блок types `sound`, `camera`, `interactive_object` — no-op в executor
**Файл:** `useSceneExecutor.ts:173-188`

```typescript
case 'sound': break;
case 'camera': break;
case 'interactive_object': break;
```

**Ризик:** Не стільки безпеки, скільки коректності: користувач додає блоки які нічого не роблять. Якщо `interactive_object` мав виконувати дії — він просто ігнорується. Це може призвести до оманливої поведінки (користувач думає що інтерактивний об'єкт працює, але ні).

**Рекомендація:** Додати warning в UI для unimplemented block types, або реалізувати handlers.

### H-4: `evaluateVariable` дозволяє prototype pollution через variableName
**Файл:** `useSceneExecutor.ts:28-55`

```typescript
function evaluateVariable(variables: Record<string, ...>, varName: string, operation, value) {
  const next = { ...variables };
  next[varName] = ...;  // varName з user-controlled data
```

**Ризик:** Якщо `varName` приходить зі сцени створеної користувачем (VariableBlockData.variableName), зловмисник може встановити `varName = "__proto__"` або `"constructor"` для prototype pollution.

**Рекомендація:** Валідувати `varName` — заборонити `__proto__`, `constructor`, `prototype` та інші зарезервовані імена.

### H-5: Помилки в `migrateFromLegacyKeys` маскуються (silent failure)
**Файл:** `use-app-store.ts:141-238`

```typescript
migrateFromLegacyKeys: async () => {
  try {
    // ... 100+ рядків
  } catch (e) {
    ErrorHandler.handle('AppStore migration failed', e, ...);
    set({ isLoaded: true });  // App continues with empty state!
  }
```

**Ризик:** При невдалій міграції користувач отримує порожній стейт без попередження. Усі існуючі сторі та дані зникають.

**Рекомендація:** Показувати користувачу повідомлення про невдалу міграцію з опцією повторити.

---

## Середні вразливості (MEDIUM)

### M-1: `data:image/svg+xml` дозволено — потенційний XSS in web
**Файл:** `asset-rescriptor.ts:150`

`data:image/svg+xml` є дозволеним префіксом. SVG може містити `<script>` теги.

**Рекомендація:** Сканувати SVG на наявність script/event handler перед відображенням, або заборонити inline SVG в data URI.

### M-2: story text не екранується при відображенні
**Файл:** `translations.ts:20`, `story-validator.ts:237-253`

`sanitizeText()` видаляє `<script>` та event handlers, АЛЕ:
- Не видаляє `<iframe>`, `<object>`, `<embed>`
- Не видаляє CSS expression/javascript в style атрибутах
- Не захищає від injection через React Native `source={{ uri: }}`

**Рекомендація:** Використовувати DOMPurify для web-версії, обмежити дозволені HTML теги.

### M-3: Немає Content Security Policy для web
**Файл:** `app/index.tsx`, `app/+html.tsx`

Немає жодного CSP хедера для web-версії.

**Рекомендація:** Додати `<meta http-equiv="Content-Security-Policy">` або налаштувати CSP на сервері.

### M-4: `user-info` localStorage не валідується при читанні
**Файл:** `auth.ts:60-83`

User info з localStorage парситься без валідації:
```typescript
const user: User = JSON.parse(info);
```

**Рекомендація:** Додати runtime валідацію після JSON.parse (zod або manual check).

### M-5: Session token логується в __DEV__ режимі
**Файл:** `api.ts:27-31`, `api.ts:111-115`

```typescript
if (__DEV__) console.log("[API] OAuth exchange result:", {
  sessionToken: sessionToken ? `${sessionToken.substring(0, 50)}...` : null,
});
```

**Ризик:** Token частково логується. Якщо __DEV__ залишиться true в production build — витік.

**Рекомендація:** Переконатися що __DEV__ = false в production. Не логувати token навіть частково.

### M-6: `importStory` — canonical path не валідується
**Файл:** `story-hooks.ts:64-141`

Коли `looksCanonical = true`, дані іпортуються БЕЗ валідації через `StoryValidator`:
```typescript
if (looksCanonical) {
  // No validation! Directly normalize and import
  const importedScenes = normalizeImportedSceneRecords(storyId, rawScenes);
```

**Ризик:** Спотворений canonical JSON може містити недійсні дані яі пройдуть без перевірки.

**Рекомендація:** Валідувати canonical path теж — хоча б перевірити типи полів.

---

## Низькі вразливості (LOW)

### L-1: `getApiBaseUrl()` може бути підроблений в env
Довіряється `constants/oauth` для base URL без валідації. Якщо env змінена — запитають на зловмисний сервер.

### L-2: `__DEV__` console.log в production
**Файл:** `api.ts`, `use-app-store.ts`, `useSceneExecutor.ts` — декілька `console.warn/error` викликів які працюють навіть в production.

### L-3: Немає Subresource Integrity (SRI) для завантажуваного контенту
Файли з `http://` / `https://` URI завантажуються без перевірки цілісності.

### L-4: `story-reader-responsive.tsx` state not reset on navigation
**Файл:** `reader.tsx:38` — `objDialogue` state не скидається при зміні sceneId (міг бути баг який залишився з попередньої навігації).

---

## Що реалізовано добре ✅

| Аспект | Статус |
|---|---|
| **Path traversal prevention** | ✅ `isPathSafe()` в `asset-resolver.ts:24-30` — блокує `..`, null bytes, небезпечні символи |
| **URI validation** | ✅ `StoryValidator.validateUri()` — блокує `javascript:`, `data:`, `vbscript:` протоколи |
| **XSS sanitization** | ✅ `sanitizeText()` видаляє `<script>`, event handlers, `javascript:` |
| **Input size limits** | ✅ JSON size limit 10MB, scene text 50K chars, choices 20 max, characters 50 max |
| **Secure token storage** | ✅ `expo-secure-store` для native платформи |
| **Condition evaluation** | ✅ `conditionsMet()` — pure function, БЕЗ eval()/Function(), безпечна |
| **Scene executor** | ✅ Безпечний switch-case, БЕЗ code injection, з try-catch для кожного step |
| **Error boundary** | ✅ ErrorBoundary в root layout |
| **Recursive error prevention** | ✅ `isHandlingError` flag в ErrorHandler |
| **CORS credentials** | ✅ `credentials: "include"` для web, `"same-origin"` для native |

---

## Рекомендації по пріоритетах

### Терміново (до релізу):
1. **C-2:** Додати CSRF-захист для OAuth flow (state parameter validation)
2. **C-3:** Не довіряти URL-параметрам — отримувати user info з `/api/auth/me`
3. **H-4:** Захист від prototype pollution в `evaluateVariable`
4. **H-5:** Додати UI для невдалої міграції

### Короткостроково (до наступного спринту):
5. **H-1:** Перенести user info з localStorage на httpOnly cookies (web)
6. **M-3:** Додати CSP headers
7. **M-6:** Валідувати canonical path в `importStory`
8. **C-1:** Уніфікувати URI validation в одній функції

### Довгостроково:
9. **H-2:** Додати rate limiting на API виклики
10. **M-1, M-2:** Посилити санітизацію (DOMPurify для web)
11. **L-3:** Додати SRI для зовнішніх ресурсів

---

## Пов'язані сторінки

[[code-analysis-report-2026-05-31]] - Попередній звіт аудиту коду
[[architecture-reference]] - Архітектурна довідка
[[bug-report-2026-05-31]] - Баг-репорти
