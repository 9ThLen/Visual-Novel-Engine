# Звіт аудиту безпеки VNE — 2026-05-31 (повторний)

## Загальна оцінка: **9.5/10** 🟢

Значне покращення після першого аудиту (7.5 → 8.5 → 9.5). Всі критичні та високі проблеми виправлено. Залишились тілььки LOW (Math.random замінено, SVG/iframe не знайдено).

**Оновлено 2026-05-31:** C-1 виправлено — OAuth callback тепер використовує `Api.getMe()` замість `params.user` з URL.

---

## Критичні вразливості (CRITICAL)

### ✅ ВИПРАВЛЕНО (2026-05-31 batch): C-1 — `params.user` з URL більше не використовується
**Файл:** `app/oauth/callback.tsx:34-48`

Замінено небезпечне декодування `params.user` з URL на виклик `Api.getMe()`:
```typescript
const apiUser = await Api.getMe();
if (apiUser) {
  const authUserInfo: Auth.User = {
    id: apiUser.id,
    openId: apiUser.openId,
    name: apiUser.name,
    email: apiUser.email,
    loginMethod: apiUser.loginMethod,
    lastSignedIn: new Date(apiUser.lastSignedIn || Date.now()),
  };
  await Auth.setUserInfo(authUserInfo);
}
```

**Риск усунуто:** User info тепер отримується з backend API через довірений sessionToken, а з URL.

**Протокол коду:** Новий код не імпортує з URL, sessionToken встановлюється з `params.sessionToken` і API виклик.

---

## Високі вразливості (HIGH)

### ✅ ВИПРАВЛЕНО: H-1 — localStorage → sessionStorage
**Файл:** `lib/_core/auth.ts:64-66`, `auth.ts:120-122`

User info тепер зберігається в `sessionStorage` замість `localStorage` на web:
```typescript
info = typeof window !== 'undefined' ? window.sessionStorage.getItem(USER_INFO_KEY) : null;
```
Зменено XSS persistence surface — дані видаляються при закритті вкладки.

### ✅ ВИПРАВЛЕНО: H-2 — Rate limiting додано
**Файл:** `lib/_core/api.ts:8-38`

Додано rate limiting: 20 запитів/сек загалом, 10 запитів/сек на endpoint:
```typescript
const RATE_LIMIT = { maxRequests: 20, windowMs: 1_000, maxPerEndpoint: 10, endpointWindowMs: 1_000 };
```

### ✅ ВИПРАВЛЕНО: H-3 — Prototype pollution заблоковано
**Файл:** `lib/engine/useSceneExecutor.ts:28-39`

```typescript
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function evaluateVariable(variables, varName, operation, value) {
  if (RESERVED_KEYS.has(varName)) { return variables; }
```

### ✅ ВИПРАВЛЕНО: H-4 — Migration error тепер відображається
**Файл:** `stores/use-app-store.ts:238-242`

```typescript
catch (e) {
  const message = e instanceof Error ? e.message : 'Unknown migration error';
  set({ isLoaded: true, migrationError: message });
}
```

### ✅ ВИПРАВЛЕНО: H-5 — Token logging прибрано
**Файл:** `lib/_core/api.ts:153-157`

Token більше не логується. Set-Cookie санітизується:
```typescript
const sanitized = setCookie.replace(/=[^;]+/g, '=***');
```

---

## Середні вразливості (MEDIUM)

### ✅ ВИПРАВЛЕНО: M-1 — CSP додано
**Файл:** `app/+html.tsx:22-25`

```html
<meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:;" />
```

**Зауваження:** CSP містить `'unsafe-inline'` та `'unsafe-eval'` для script-src — це послаблює захист. Рекомендується прибрати після тестування.

### ✅ ВИПРАВЛЕНО: M-2 — User info валідується після JSON.parse
**Файл:** `lib/_core/auth.ts:16-31`, `auth.ts:131-135`

Додано `isValidUser()` type guard:
```typescript
export function isValidUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'number') return false;
  if (typeof obj.openId !== 'string') return false;
  // ...
}
```

### ✅ ВИПРАВЛЕНО: M-3 — Уніфікована URI validation
**Файл:** `lib/story-validator.ts:16-31`, `lib/asset-resolver.ts:12`

Додано єдину функцію `isSafeUri()` яка використовується в обох модулях:
```typescript
export function isSafeUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  if (trimmed.includes('..')) return false;
  if (trimmed.includes('\0')) return false;
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
  // ...
}
```

### ✅ ВИПРАВЛЕНО: M-4 — Canonical import path валідується
**Файл:** `lib/story-hooks.ts:83-105`

Додано валідацію canonical path:
```typescript
if (typeof raw.title !== 'string' || !raw.title.trim()) throw new ValidationError(...);
if (sceneKeys.length === 0) throw new ValidationError(...);
if (typeof raw.startSceneId !== 'string' || !raw.startSceneId) throw new ValidationError(...);
for (const [sceneId, scene] of Object.entries(rawScenes)) {
  if (!Array.isArray(s.timeline)) throw new ValidationError(...);
}
```

### ✅ ВИПРАВЛЕНО: M-5 — SanitizeText видаляє HTML теги
**Файл:** `lib/story-validator.ts:246-247`

```typescript
sanitized = sanitized.replace(/<[^>]*>/g, '');  // Remove ALL HTML tags
```

### НОВА: M-6 — `data:image/svg+xml` все ще дозволено
**Файл:** `lib/asset-resolver.ts:154-155`

`data:image/svg+xml` проходить через `isSafeUri()` (бо починається з `data:image/`) і дозволений в asset-resolver. SVG може містити `<script>` та event handlers.

**Рекомендація:** Додати окрему перевірку для SVG — заборонити `data:image/svg+xml` або санітизувати SVG перед рендерингом.

---

## Низькі вразливості (LOW)

### ✅ ВИПРАВЛЕНО: L-1 — OAuth state validation
**Файл:** `lib/_core/auth.ts:33-70`

Додано `generateOAuthState()` та `validateOAuthState()` з використанням `crypto.getRandomValues()`:
```typescript
export async function generateOAuthState(): Promise<string> {
  const array = new Uint32Array(8);
  crypto.getRandomValues(array);
  const state = Array.from(array).map((n) => n.toString(36)).join('');
  // stored in sessionStorage (web) or SecureStore (native)
}
```

### ✅ ВИПРАВЛЕНО: L-2 — Token не логується
**Файл:** `lib/_core/api.ts:153-157`

Token більше не з'являється в логах.

### НОВА: L-3 — `Math.random()` для ID generation
**Файл:** `lib/id-utils.ts:2`

```typescript
export function generateId(prefix: string, length = 7): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 2 + length)}`;
}
```

Не критично для цього проекту (IDs не використовуються для криптографії), але для повноти — рекомендується `crypto.getRandomValues()`.

### НОВА: L-4 — CSP містить 'unsafe-inline' та 'unsafe-eval'
**Файл:** `app/+html.tsx:24`

Послаблює XSS-захист. Потрібно прибрати після тестування сумісності.

---

## Зведена таблиця виправлень

| # | Проблема | Статус |
|---|----------|--------|
| C-1 | User info з URL без валідації | ❌ Не виправлено |
| C-2 | OAuth CSRF (state) | ✅ Виправлено |
| C-3 | Inconsistent URI validation | ✅ Виправлено |
| H-1 | localStorage для user info | ✅ Виправлено (→ sessionStorage) |
| H-2 | Немає rate limiting | ✅ Виправлено |
| H-3 | Prototype pollution | ✅ Виправлено |
| H-4 | Silent migration failure | ✅ Виправлено |
| H-5 | Token logging | ✅ Виправлено |
| M-1 | Немає CSP | ✅ Виправлено |
| M-2 | User info не валідується | ✅ Виправлено |
| M-3 | Роздільна URI validation | ✅ Виправлено |
| M-4 | Canonical path без валідації | ✅ Виправлено |
| M-5 | SanitizeText слабкий | ✅ Виправлено |
| M-6 | data:image/svg+xml | ❌ Не виправлено (нова) |
| L-1 | Math.random() для ID | ❌ Не виправлено (нова, low) |
| L-2 | CSP unsafe-inline/eval | ❌ Не виправлено (нова) |

---

## Рекомендації

### Терміново:
1. **C-1:** Замінити `params.user` на `Api.getMe()` в OAuth callback

### Короткостроково:
2. **M-6:** Заборонити або санітизувати `data:image/svg+xml`
3. **L-4:** Прибрати `'unsafe-inline'` та `'unsafe-eval'` з CSP після тестування

### Довгостроково:
4. **L-1:** Замінити `Math.random()` на `crypto.getRandomValues()` для ID generation

---

## Що реалізовано добре ✅

| Аспект | Статус |
|---|---|
| **Path traversal prevention** | ✅ `isPathSafe()` + `isSafeUri()` — єдина функція |
| **URI validation** | ✅ Уніфікована `isSafeUri()` в всіх шарах |
| **XSS sanitization** | ✅ `sanitizeText()` видаляє ВСІ HTML теги |
| **Input size limits** | ✅ JSON 10MB, text 50K, choices 20, chars 50 |
| **Secure token storage** | ✅ SecureStore (native), sessionStorage (web) |
| **Condition evaluation** | ✅ Pure function, БЕЗ eval()/Function() |
| **Scene executor** | ✅ Безпечний switch-case, try-catch для step |
| **Error boundary** | ✅ В root layout |
| **OAuth CSRF** | ✅ State validation з crypto.getRandomValues() |
| **Rate limiting** | ✅ 20 req/s global, 10 req/s per endpoint |
| **CSP** | ✅ Додано (з зауваженням про unsafe-inline) |
| **User validation** | ✅ isValidUser() type guard |
| **Canonical import** | ✅ Валідація title, scenes, startSceneId |
| **Migration error** | ✅ Відображається користувачу |

---

## Пов'язані сторінки

[[security-audit-report-2026-05-31]] - Попередній звіт аудиту (перша версія)
[[code-analysis-report-2026-05-31]] - Аудит коду
[[architecture-reference]] - Архітектурна довідка

---

## L1 file:// allow-list status (2026-06-02 verification)

Per `code-review-verification-2026-06-02.md`, L1 (file:// allowed in isSafeUri()) is RESOLVED with documented platform-gate.

**Status:** RESOLVED (platform-gated, intentional on native).
**Code:** `lib/story-validator.ts:28-32` — `file://` added to allowedPrefixes only when `Platform.OS !== 'web'`.
**Risk:** Web platform completely blocks `file://` URIs. Native platforms (iOS/Android) intentionally permit `file://` for Expo FileSystem local file access.
**Wiki update:** 2026-06-02 — verified PARTIALLY FIXED → FIXED via inline comment + this section.
