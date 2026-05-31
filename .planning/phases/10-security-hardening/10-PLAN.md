# Phase 10 — Security Hardening

**Status:** Planned
**Created:** 2026-05-31
**Priority:** P0 (pre-release)

## Objective

Fix all findings from the security audit (`10-SECURITY-AUDIT.md`) — eliminate critical and high-severity vulnerabilities before release, and lay groundwork for ongoing security practices.

## Source Findings

- **CRITICAL (3):** C-1 (URI validation bypass), C-2 (OAuth CSRF), C-3 (unsanitized user data)
- **HIGH (5):** H-1 (localStorage XSS vector), H-2 (no rate limiting), H-3 (no-op executor blocks), H-4 (prototype pollution), H-5 (silent migration failure)
- **MEDIUM (6):** M-1 (SVG XSS), M-2 (weak sanitization), M-3 (no CSP), M-4 (unvalidated localStorage), M-5 (token logging in __DEV__), M-6 (unvalidated canonical import)
- **LOW (4):** L-1–L-4

## Scope

### In Scope

- Fix all CRITICAL and HIGH vulnerabilities
- Add CSP headers and improve sanitization (MEDIUM)
- Add rate limiting and SRI (MEDIUM/LOW)
- Do NOT refactor architecture — fix vulnerabilities in-place

### Out of Scope

- Backend-side security fixes (API server is external)
- Full audit coverage (penetration testing, dependency scanning)
- Feature work or refactoring beyond security fixes
- Implementing no-op executor block handlers (H-3) — beyond adding UI warnings
- L-1 (`getApiBaseUrl` env tampering) — requires backend trust model, out of scope
- L-4 (reader state reset on navigation) — low-severity bug, tracked separately
- L-2 (general __DEV__ console.log in production) — partially addressed by 3c (token logs removed); remaining logs are safe debug info

## Implementation Plan

### Wave 1 — Critical + High (execute first, independent tasks)

| Task | Finding | Files |
|------|---------|-------|
| 1a | **C-2** OAuth CSRF — generate + validate `state` parameter | `lib/_core/auth.ts`, `constants/oauth.ts`, `lib/_core/api.ts` |
| 1b | **C-3** Validate user info from OAuth callback with runtime check | `lib/_core/auth.ts` |
| 1c | **H-4** Block prototype pollution in `evaluateVariable` | `lib/engine/useSceneExecutor.ts` |
| 1d | **H-5** Show UI alert on migration failure instead of silent empty state | `stores/use-app-store.ts` |

### Wave 2 — High + Medium (after Wave 1)

| Task | Finding | Files |
|------|---------|-------|
| 2a | **C-1** Create unified `isSafeUri()` function, block `data:text/html` + `file://` | `lib/story-validator.ts`, `lib/asset-resolver.ts` |
| 2b | **H-1** Move web user info to httpOnly cookies or remove localStorage persistence | `lib/_core/auth.ts` |
| 2c | **M-3** Add Content-Security-Policy meta tag | `app/+html.tsx` |
| 2d | **M-6** Validate canonical path in `importStory()` | `lib/story-hooks.ts` |

### Wave 3 — Medium + Low (remaining items)

| Task | Finding | Files |
|------|---------|-------|
| 3a | **H-2** Add client-side rate limiting + exponential backoff to `apiCall` | `lib/_core/api.ts` |
| 3b | **M-1/M-2** Strengthen sanitization — block `<iframe>/<object>/<embed>`, add DOMPurify for web | `lib/story-validator.ts` |
| 3c | **H-3** Add console.warn for no-op executor block types (sound, camera, interactive_object) | `lib/engine/useSceneExecutor.ts` |
| 3d | **M-5** Remove token logging from __DEV__ blocks | `lib/_core/api.ts` |
| 3e | **L-3** Document SRI strategy or add integrity checks | `lib/asset-resolver.ts` |

## Verification

1. `corepack pnpm run check` — no regressions
2. Unit tests for `validateUri`, `sanitizeText`, `evaluateVariable`, `importStory`
3. Manual OAuth flow test (CSRF state validation, user info persistence)
4. CSP header present in web export HTML
5. Confirm no `console.log` of tokens even in __DEV__
6. Confirm migration failure shows user-facing toast/dialog

## must_haves

- [ ] C-2, C-3, H-4, H-5 fixed (Critical + highest High)
- [ ] `pnpm run check` passes
- [ ] All security-audit findings either fixed or documented as deferred
- [ ] Regression tests for changed modules

## Task Details

### Task 1a — OAuth CSRF Protection (C-2)

<read_first>
- `lib/_core/auth.ts` — current state/session token management
- `lib/_core/api.ts` — `exchangeOAuthCode()` function
- `constants/oauth.ts` — OAuth configuration constants
</read_first>

<action>
1. Add function `generateOAuthState()` that creates a random string (crypto.randomUUID or similar) and stores it in SecureStore (native) / sessionStorage (web)
2. Add function `validateOAuthState(expected: string): boolean` that compares against stored value then removes it (one-time use)
3. Before calling `exchangeOAuthCode()`, call `validateOAuthState(state)` — throw if mismatch
4. Store state key name in `constants/oauth.ts` as `OAUTH_STATE_KEY`
</action>

<acceptance_criteria>
- `generateOAuthState()` returns a non-empty string
- `validateOAuthState()` returns true for matching state, false otherwise
- `validateOAuthState()` removes stored state after validation (one-time use)
- `exchangeOAuthCode()` throws if state validation fails
- Existing tests continue to pass
</acceptance_criteria>

### Task 1b — Validate User Info (C-3)

<read_first>
- `lib/_core/auth.ts` — `getUserInfo()`, `setUserInfo()`
- `lib/_core/api.ts` — `exchangeOAuthCode()` return type
</read_first>

<action>
1. Add a zod schema or manual type guard for the `User` type: check `id` is number, `openId` is string, `email` is string|null, `name` is string|null, `lastSignedIn` is string (parsed to Date)
2. Call validation in `setUserInfo()` before persisting — throw if shape is invalid
3. In `getUserInfo()`, wrap `JSON.parse` in try-catch and validate shape before returning
</action>

<acceptance_criteria>
- `setUserInfo()` throws if passed object doesn't match User shape
- `getUserInfo()` returns `null` for malformed stored data (not crash)
- `exchangeOAuthCode()` validates response shape before returning
- Existing tests pass
</acceptance_criteria>

### Task 1c — Block Prototype Pollution (H-4)

<read_first>
- `lib/engine/useSceneExecutor.ts` — `evaluateVariable()` function
</read_first>

<action>
1. Add a blocklist check at the start of `evaluateVariable()`:
   `const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf']);`
2. If `varName` is in RESERVED_KEYS, return `variables` unchanged (no-op)
3. If `varName` includes `.` or `[` (nested path), return `variables` unchanged
</action>

<acceptance_criteria>
- `evaluateVariable({}, '__proto__', 'set', 'malicious')` returns `{}` unchanged
- `evaluateVariable({}, 'constructor', 'set', '{}')` returns `{}` unchanged
- Normal variable names like `hp`, `score`, `flag_1` still work normally
- No TypeScript errors
</acceptance_criteria>

### Task 1d — Migration Failure UI (H-5)

<read_first>
- `stores/use-app-store.ts` — `migrateFromLegacyKeys()`
- `components/ErrorBoundary.tsx` — current error display pattern
</read_first>

<action>
1. In `migrateFromLegacyKeys()` catch block, instead of silently setting `isLoaded: true`, set a new state field `migrationError: string`
2. Add `migrationError` to the store type (string | null, default null)
3. Create a `MigrationErrorBanner` component that renders when `migrationError` is non-null, showing: "Data migration failed. Your existing data may not be loaded. [Retry] [Continue with empty state]"
4. Mount `MigrationErrorBanner` in the root layout (app/_layout.tsx or app/index.tsx)
</action>

<acceptance_criteria>
- Store has `migrationError: string | null` field
- Migration failure sets `migrationError` with error message
- Banner appears when `migrationError` is non-null
- "Retry" button re-runs `migrateFromLegacyKeys()`, "Continue" clears `migrationError` and sets `isLoaded: true`
- Types pass
</acceptance_criteria>

### Task 2a — Unified URI Validation (C-1)

<read_first>
- `lib/story-validator.ts` — `validateUri()` method
- `lib/asset-resolver.ts` — URI resolution with `safeDataPrefixes`
</read_first>

<action>
1. Extract a shared `isSafeUri(uri: string): boolean` function into a new file `lib/uri-safe.ts`
2. `isSafeUri()` blocks: `javascript:`, `data:text/html`, `data:application/xhtml+xml`, `vbscript:`, `file:` (unless explicitly allowed), `__proto__` in path
3. `isSafeUri()` only allows: `http://`, `https://`, `data:image/*`, `data:audio/*`, `data:video/*`, `data:font/*`, relative paths starting with `/`, `./`, `assets/`
4. Replace both `story-validator.ts validateUri()` and `asset-resolver.ts` data URI check with calls to `isSafeUri()`
5. Keep `file://` blocked by default (opt-in only)
</action>

<acceptance_criteria>
- `isSafeUri('javascript:alert(1)')` returns false
- `isSafeUri('data:text/html,<script>alert(1)</script>')` returns false
- `isSafeUri('data:image/png;base64,...')` returns true
- `isSafeUri('https://example.com/image.png')` returns true
- `isSafeUri('file:///etc/passwd')` returns false unless explicitly opted in
- Both callers use the shared function
- `pnpm run check` passes
</acceptance_criteria>

### Task 2b — Web User Info Persistence (H-1)

<read_first>
- `lib/_core/auth.ts` — `getUserInfo()`, `setUserInfo()`, `clearUserInfo()`
</read_first>

<action>
1. On web platform, remove `localStorage.getItem(USER_INFO_KEY)` / `localStorage.setItem(USER_INFO_KEY)` calls
2. Replace with calling `getMe()` API on app load (already exists in `lib/_core/api.ts`)
3. Keep SecureStore for native (unchanged)
</action>

<acceptance_criteria>
- `getUserInfo()` on web returns `null` (always fetches fresh from API)
- `setUserInfo()` on web is a no-op (data fetched from API via cookie)
- Native path unchanged
- `pnpm run check` passes
</acceptance_criteria>

### Task 2c — Content Security Policy (M-3)

<read_first>
- `app/+html.tsx` — root HTML shell
</read_first>

<action>
1. Add `<meta http-equiv="Content-Security-Policy">` with default-src policy:
   `default-src 'self'; img-src 'self' data: https:; media-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:;`
2. Use a `<link>` or `<script>` guard for web-only, wrap in platform check if needed
</action>

<acceptance_criteria>
- CSP meta tag present in web export
- All app functionality works with CSP enabled
- `pnpm run check` passes
</acceptance_criteria>

### Task 2d — Validate Canonical Import (M-6)

<read_first>
- `lib/story-hooks.ts` — `importStory()` function
- `lib/story-validator.ts` — `StoryValidator.validateStory()`
</read_first>

<action>
1. In the `looksCanonical` branch of `importStory()`, after `normalizeImportedSceneRecords()`, run a lightweight validation:
   - Each scene must have `id: string`, `timeline: array`
   - Each timeline step must have `id`, `blockType`
   - Check scene references point to valid scene IDs
2. If validation fails, fall through to the legacy validation path instead of silently proceeding
</action>

<acceptance_criteria>
- Valid canonical stories import without change
- Malformed canonical stories fall through to legacy validator (don't silently succeed)
- Validation checks scene IDs, timeline structure, step integrity
- `pnpm run check` passes
</acceptance_criteria>

### Task 3a — Rate Limiting (H-2)

<read_first>
- `lib/_core/api.ts` — `apiCall()` function
</read_first>

<action>
1. Add a token bucket rate limiter: max 30 requests/minute, stored in module-level closure
2. Before `fetch()` in `apiCall()`, check rate limiter — if exceeded, throw RateLimitError with `retryAfter: number`
3. Add exponential backoff for retries: initial 1s, max 30s, jitter ±10%
4. Export `RateLimitError` class for callers to handle
</action>

<acceptance_criteria>
- Rate limiter blocks after 30 requests in 60 seconds
- Blocked requests throw `RateLimitError` with `retryAfter` in seconds
- Exponential backoff retries on network errors (not on 4xx/5xx)
- Rate limiter resets after window expires
- `pnpm run check` passes
</acceptance_criteria>

### Task 3b — Strengthen Sanitization (M-1/M-2)

<read_first>
- `lib/story-validator.ts` — `sanitizeText()` method
</read_first>

<action>
1. Extend `sanitizeText()` to also strip: `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<base>` tags
2. Strip CSS `expression()` and `javascript:` in style attributes
3. Strip `data:` URIs in HTML attributes (src, href, etc.)
4. Add DOMPurify integration for web platform (conditional import)
</action>

<acceptance_criteria>
- `<iframe src="...">` stripped from text
- `<object data="...">` stripped from text
- `style="background: expression(alert(1))"` → `style=""` (expression removed)
- Existing allowed HTML (bold, italic, etc.) still works
- All existing sanitization tests pass
- `pnpm run check` passes
</acceptance_criteria>

### Task 3c — No-op Executor Block Warnings (H-3)

<read_first>
- `lib/engine/useSceneExecutor.ts` — `executeStep()` switch-case
</read_first>

<action>
1. In the `case 'sound':`, `case 'camera':`, and `case 'interactive_object':` break statements, add `console.warn('[useSceneExecutor] unimplemented block type: ...', step.id)` before each break
2. Keep the no-op behavior unchanged — this is a warning-only fix
</action>

<acceptance_criteria>
- `console.warn` called with block type and step ID for each no-op case
- Behavior unchanged (blocks still skipped)
- `pnpm run check` passes
</acceptance_criteria>

### Task 3d — Remove Token Logging (M-5)

<read_first>
- `lib/_core/api.ts` — all `__DEV__` console.log calls
</read_first>

**Note:** This also partially addresses L-2 (general __DEV__ logging concern).

<action>
1. Remove `console.log("[API] OAuth exchange result:", { sessionToken: ..., ... })` block (lines 111-115)
2. Remove `console.log("[API] Authorization header added")` (line 30)
3. For remaining `__DEV__` logs, ensure no token/sensitive data is included — replace with safe booleans (e.g., `hasToken: !!sessionToken`)
</action>

<acceptance_criteria>
- No console.log in api.ts includes session token, even truncated
- __DEV__ logs still provide debugging value (endpoint, method, status code)
- `pnpm run check` passes
</acceptance_criteria>

### Task 3e — SRI Strategy (L-3)

<read_first>
- `lib/asset-resolver.ts` — external URI loading
</read_first>

<action>
1. Add integrity verification for externally-loaded script/style assets
2. For assets loaded from external URLs, compute or verify integrity hash
3. Document SRI strategy for future asset loading
</action>

<acceptance_criteria>
- External asset integrity check documented
- Assets without integrity hash are logged with warning
- `pnpm run check` passes
</acceptance_criteria>

## Files Modified

- `lib/_core/auth.ts` — OAuth state, user info validation, web persistence
- `lib/_core/api.ts` — rate limiting, token logging
- `lib/engine/useSceneExecutor.ts` — prototype pollution guard
- `lib/story-validator.ts` — sanitization improvements
- `lib/asset-resolver.ts` — unified URI validation
- `lib/uri-safe.ts` — new shared URI validation
- `lib/story-hooks.ts` — canonical import validation
- `stores/use-app-store.ts` — migration error state
- `app/+html.tsx` — CSP meta tag
- `constants/oauth.ts` — OAuth state key
