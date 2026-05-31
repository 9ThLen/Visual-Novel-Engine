# Звіт аудиту безпеки VNE — 2026-05-31

## Загальна оцінка: **7.5/10**

Проект має базовий рівень захисту (валідація імпорту, санітизація, path traversal prevention), але є серйозні прогалини в авторизації, обробці помилок та деяких векторах ін'єкцій.

---

## Критичні вразливості (CRITICAL)

### C-1: `data:` URI не повністю заблоковано — можливий XSS через SVG

**Файли:** `lib/story-validator.ts:204`, `lib/asset-resolver.ts:147-161`

Валідатор URI (`validateUri`) дозволяє `file://` протокол. Але в `asset-resolver.ts` data URI фільтруються ТІЛЬКИ за префіксом. Немає єдиної точки валідації.

**Рекомендація:** Створити єдину функцію `isSafeUri()` яка перевіряє ВСІ протоколи. Заборонити `file://` повністю якщо не потрібен локальний доступ. Додати блокування `data:text/html` та `data:application/xhtml+xml`.

### C-2: OAuth state parameter не валідується (CSRF в OAuth)

**Файли:** `lib/_core/api.ts:98-121`, `constants/oauth.ts`

Параметр `state` передається на backend але НІДЕ не перевіряється на відповідність згенерованому значенню.

**Рекомендація:** Генерувати `state` на початку OAuth flow, зберігати в SecureStore/localStorage, і перевіряти в callback перед `exchangeOAuthCode()`.

### C-3: Користувацькі дані з OAuth callback не санітизуються

**Файли:** `lib/_core/auth.ts:60-83`, `lib/_core/api.ts:98-121`

User info отримується з backend JSON-відповіді та зберігається в localStorage (web) або SecureStore (native) без runtime валідації.

**Рекомендація:** Додати runtime валідацію після JSON.parse (zod або manual check). Отримувати user info з `/api/auth/me` після встановлення session token.

---

## Високі вразливості (HIGH)

### H-1: localStorage для user info на web (XSS → token theft)

**Файл:** `lib/_core/auth.ts:64-66,88-90`

На web платформі user info зберігається в `localStorage`.

**Рекомендація:** Використовувати `httpOnly` cookies для session на web. Не зберігати user info в localStorage — отримувати з `/api/auth/me` при кожному завантаженні.

### H-2: Немає rate limiting на API виклики

**Файл:** `lib/_core/api.ts:15-94`

`apiCall()` не має rate limiting, retry with backoff, або circuit breaker.

**Рекомендація:** Додати rate limiting на клієнтській стороні (max N запитів/хвилину) та exponential backoff для retry.

### H-3: Блоки `sound`, `camera`, `interactive_object` — no-op в executor

**Файл:** `lib/engine/useSceneExecutor.ts:173-188`

```typescript
case 'sound': break;
case 'camera': break;
case 'interactive_object': break;
```

**Рекомендація:** Додати warning в UI для unimplemented block types, або реалізувати handlers.

### H-4: `evaluateVariable` дозволяє prototype pollution через variableName

**Файл:** `lib/engine/useSceneExecutor.ts:28-55`

```typescript
next[varName] = ...;  // varName з user-controlled data
```

**Рекомендація:** Валідувати `varName` — заборонити `__proto__`, `constructor`, `prototype` та інші зарезервовані імена.

### H-5: Помилки в `migrateFromLegacyKeys` маскуються (silent failure)

**Файл:** `stores/use-app-store.ts:141-238`

При невдалій міграції користувач отримує порожній стейт без попередження.

**Рекомендація:** Показувати користувачу повідомлення про невдалу міграцію з опцією повторити.

---

## Середні вразливості (MEDIUM)

### M-1: `data:image/svg+xml` дозволено — потенційний XSS in web

**Файл:** `lib/asset-resolver.ts:150`

**Рекомендація:** Сканувати SVG на наявність script/event handler перед відображенням.

### M-2: story text не екранується при відображенні

**Файли:** `lib/story-validator.ts:237-253`, `lib/translations.ts:20`

`sanitizeText()` видаляє `<script>` та event handlers, АЛЕ не видаляє `<iframe>`, `<object>`, `<embed>`, CSS expression/javascript в style атрибутах.

**Рекомендація:** Використовувати DOMPurify для web-версії, обмежити дозволені HTML теги.

### M-3: Немає Content Security Policy для web

**Файл:** `app/+html.tsx`

Немає жодного CSP хедера для web-версії.

**Рекомендація:** Додати `<meta http-equiv="Content-Security-Policy">`.

### M-4: `user-info` localStorage не валідується при читанні

**Файл:** `lib/_core/auth.ts:60-83`

**Рекомендація:** Додати runtime валідацію після JSON.parse (zod або manual check).

### M-5: Session token логується в __DEV__ режимі

**Файл:** `lib/_core/api.ts:27-31,111-115`

**Рекомендація:** Переконатися що __DEV__ = false в production. Не логувати token навіть частково.

### M-6: `importStory` — canonical path не валідується

**Файл:** `lib/story-hooks.ts:64-141`

Коли `looksCanonical = true`, дані імпортуються БЕЗ валідації через `StoryValidator`.

**Рекомендація:** Валідувати canonical path теж — хоча б перевірити типи полів.

---

## Низькі вразливості (LOW)

### L-1: `getApiBaseUrl()` може бути підроблений в env

### L-2: `__DEV__` console.log в production

### L-3: Немає Subresource Integrity (SRI)

### L-4: `story-reader-responsive.tsx` state not reset on navigation

---

## Що реалізовано добре ✅

| Аспект | Статус |
|---|---|
| Path traversal prevention | ✅ `isPathSafe()` — блокує `..`, null bytes, небезпечні символи |
| URI validation | ✅ `StoryValidator.validateUri()` — блокує `javascript:`, `data:`, `vbscript:` |
| XSS sanitization | ✅ `sanitizeText()` видаляє `<script>`, event handlers, `javascript:` |
| Input size limits | ✅ JSON 10MB, scene text 50K chars, choices 20, characters 50 |
| Secure token storage | ✅ `expo-secure-store` для native |
| Condition evaluation | ✅ pure function, БЕЗ eval()/Function() |
| Error boundary | ✅ ErrorBoundary в root layout |
| CORS credentials | ✅ `credentials: "include"` для web |

---

## Рекомендації по пріоритетах

### Терміново (Wave 1):
1. **C-2:** CSRF-захист для OAuth flow (state parameter validation)
2. **C-3:** Не довіряти URL-параметрам — отримувати user info з `/api/auth/me`
3. **H-4:** Захист від prototype pollution в `evaluateVariable`
4. **H-5:** Додати UI для невдалої міграції

### Short-term (Wave 2):
5. **H-1:** Перенести user info з localStorage на httpOnly cookies (web)
6. **M-3:** Додати CSP headers
7. **M-6:** Валідувати canonical path в `importStory`
8. **C-1:** Уніфікувати URI validation в одній функції

### Довгостроково (Wave 3):
9. **H-2:** Rate limiting на API виклики
10. **M-1, M-2:** Посилити санітизацію (DOMPurify для web)
11. **L-3:** SRI для зовнішніх ресурсів
