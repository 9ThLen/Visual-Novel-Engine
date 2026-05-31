---
phase: 10-security-hardening
reviewed: 2026-05-31T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - constants/oauth.ts
  - lib/_core/auth.ts
  - lib/_core/api.ts
  - lib/story-validator.ts
  - lib/asset-resolver.ts
  - lib/engine/useSceneExecutor.ts
  - stores/use-app-store.ts
  - components/MigrationErrorBanner.tsx
  - app/+html.tsx
  - app/_layout.tsx
  - lib/story-hooks.ts
  - wiki/sri-strategy.md
findings:
  critical: 3
  warning: 6
  info: 6
  total: 15
status: issues_found
---

# Phase 10: Code Review Report — Security Hardening

**Reviewed:** 2026-05-31T12:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed 12 files from Phase 10 (Security Hardening) covering OAuth authentication, API client, story validation, asset resolution, scene execution, app store, UI components, and CSP configuration. Found **3 Critical** issues (security validation bypasses), **6 Warnings** (logic gaps and quality concerns), and **6 Info** items.

The security hardening work is generally solid — rate limiting, CSRF protection via OAuth state, prototype pollution guards, URI safety checks, and CSP are all present. However, two validation bypasses in the path traversal protection and story import pipeline undermine the hardening goals.

---

## Critical Issues

### CR-01: URL-encoded path traversal bypass in URI/path safety checks

**Files:** `lib/story-validator.ts:20`, `lib/asset-resolver.ts:26`

**Issue:** Both `isSafeUri()` in `story-validator.ts` and `isPathSafe()` in `asset-resolver.ts` check for `..` sequences in plain text, but do **not** normalize URL-encoded sequences. An attacker supplying a URI like `%2e%2e%2f%2e%2e%2fetc%2fpasswd` would bypass both checks because `%2e%2e` is not the literal string `..`.

- `story-validator.ts:20` — `if (trimmed.includes('..')) return false;` — only catches literal `..`
- `asset-resolver.ts:26` — `if (path.includes('..')) return false;` — same blind spot

The `..` literal check was clearly added as a traversal guard, but URL-encoded variants are a well-known bypass. On platforms where `FileSystem.getInfoAsync` or similar APIs receive the URI (lines 173, 188, 198 in `asset-resolver.ts`), the platform HTTP/file stack may decode it before resolving, enabling path traversal.

**Fix:** Decode URL-encoded sequences before checking for `..`:

```typescript
// In story-validator.ts isSafeUri():
function isSafeUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (!trimmed) return false;
  // Decode URL-encoded characters before path traversal check
  const decoded = decodeURIComponent(trimmed);
  if (decoded.includes('..')) return false;
  if (decoded.includes('\0')) return false;
  // ... rest of validation using decoded value
}
```

```typescript
// In asset-resolver.ts isPathSafe():
function isPathSafe(path: string): boolean {
  const decoded = decodeURIComponent(path);
  if (decoded.includes('..')) return false;
  if (decoded.includes('\0')) return false;
  // ...
}
```

---

### CR-02: Canonical story import bypasses content sanitization and DoS guards

**File:** `lib/story-hooks.ts:78-130`, `lib/story-validator.ts:241-257`

**Issue:** The `importStory()` function has two code paths — a "canonical" path (when imported JSON has `timeline` arrays) and a "legacy" path. The legacy path runs through `StoryValidator.validateStory()`, which applies:
- Scene text length limits (max 50,000 chars) — DoS protection
- Choice text length limits (max 500 chars)
- Choice count limits (max 20 per scene)
- Character count limits (max 50 per scene)
- ID format validation (`/^[a-zA-Z0-9_-]+$/`)
- Title length limits (max 200 chars)
- URI safety validation (`validateUri`)
- Text sanitization (`sanitizeText` — strips HTML, removes event handlers, removes `javascript:` protocol)
- String sanitization (`sanitizeString` — strips control chars)

The canonical path (lines 84-129) only validates:
- Title is a non-empty string
- At least one scene exists
- `startSceneId` is present and references a valid scene
- Each scene has a `timeline` array

**No content sanitization or DoS protection is applied.**

An attacker-supplied canonical-format story can contain:
- Scene text millions of characters long (exhausts memory)
- Hundreds of choices per scene (UI rendering overload)
- Unbounded character arrays
- Unsanitized asset URIs (bypasses the URI safety check)
- Unsanitized text (HTML, control chars, protocol injection)
- Invalid ID formats

The `looksCanonical` heuristic (line 78-81) is loose — any object where at least one scene has a `timeline` property enters the bypass path.

**Fix:** Apply the same validation limits and sanitization to the canonical import path. At minimum:

```typescript
// In importStory(), before lines 108-129:
// Validate scene text length
for (const [sceneId, scene] of Object.entries(rawScenes as Record<string, unknown>)) {
  const s = scene as Record<string, unknown>;
  const timeline = s.timeline as Array<unknown> || [];
  // Reuse StoryValidator validations
  if (typeof s.text === 'string' && s.text.length > 50000) {
    throw new ValidationError(`Scene text too long for ${sceneId} (max 50000 chars)`);
  }
  // Count choices, characters, etc. in timeline
  // ... validate lengths
}
// Sanitize text fields
importedScene.text = StoryValidator.sanitizeText(importedScene.text);
```

Or better, create a shared `validateContent()` function used by both paths.

---

### CR-03: Critical validation gaps in scene block execution (type-unsafe casting)

**File:** `lib/engine/useSceneExecutor.ts:109-186`

**Issue:** Multiple block handlers cast `step.data` to their expected types without runtime validation. While TypeScript provides compile-time safety for the `data` field's type union, **no runtime guard** verifies that the object shape matches expectations before property access.

Specifically:
- Line 110: `const d = step.data as BackgroundBlockData;` — no check that `d.assetId` exists
- Line 116: `const d = step.data as CharacterBlockData;` — no check for `d.characterId`
- Line 139: `const d = step.data as DialogueBlockData;` — accesses `d.entries?.[d.currentEntryIndex ?? 0]` — safe via optional chaining
- Line 155: `(step.data as ChoiceBlockData).options ?? null` — safe via nullish coalescing
- Line 159: `const d = step.data as EffectBlockData;` — accesses `d.duration` without validation; `undefined * 1000 = NaN`
- Line 174: `const d = step.data as MusicBlockData;` — accesses `d.assetId`, `d.action`, `d.volume`
- Line 186: `const d = step.data as VariableBlockData;` — accesses `d.variableName`, `d.operation`, `d.value`
- Line 192: `(step.data as TransitionBlockData).targetSceneId` — no guard

If malformed step data reaches the executor (e.g., via imported story, corrupted storage, or bug), the `as` casts silently produce `undefined` for missing properties, leading to `NaN` computations, `undefined` string concat, or runtime type errors in arithmetic operations (`(parsed as number)` at line 48-54 — TypeScript cast is erased at runtime).

In particular, `EffectBlockData.duration` being `undefined` causes `now + undefined * 1000` → `NaN` for `endTime`, creating an effect that ends at `Invalid Date` comparison.

**Fix:** Add runtime type guards for each block data type before casting:

```typescript
case 'effect': {
  const d = step.data as EffectBlockData;
  if (!d || typeof d.effectType !== 'string' || typeof d.duration !== 'number') {
    console.warn('[useSceneExecutor] invalid effect block data', step.id);
    return { nextState: currentState, result: 'continue' };
  }
  // ...
}
case 'variable': {
  const d = step.data as VariableBlockData;
  if (!d || typeof d.variableName !== 'string' || !['set','add','subtract','multiply','toggle'].includes(d.operation)) {
    return { nextState: currentState, result: 'continue' };
  }
  // ...
}
```

---

## Warnings

### WR-01: evaluateVariable numeric type coercion produces unexpected results

**File:** `lib/engine/useSceneExecutor.ts:41-59`

**Issue:** The `evaluateVariable` function auto-coerces string values to numbers if they look numeric (`!isNaN(Number(value))`), but then casts the parsed value with `as number` in arithmetic operations. The `as number` cast is a TypeScript type assertion — it is **erased at runtime** and does not perform conversion.

When a non-numeric value reaches an arithmetic operation:
- `add` with value `"hello"` → `"0hello"` (string concat, not addition)
- `multiply` with boolean `true` → `0 * true` → `0` (works by accident)
- `add` with value `[1]` (coerced to `[1]` — not converted by `Number`) → `"01"`

Additionally, the `value` parameter type is `string | number | boolean`, but `add`, `subtract`, and `multiply` only make sense with `number`.

**Fix:** Validate operation-value compatibility before applying:

```typescript
case 'add':
case 'subtract':
case 'multiply': {
  const numericValue = typeof parsed === 'number' ? parsed : Number(parsed);
  if (isNaN(numericValue)) {
    console.warn('[useSceneExecutor] non-numeric value for arithmetic op on', varName, value);
    return variables;
  }
  const current = typeof next[varName] === 'number' ? next[varName] as number : 0;
  switch (operation) {
    case 'add': next[varName] = current + numericValue; break;
    case 'subtract': next[varName] = current - numericValue; break;
    case 'multiply': next[varName] = current * numericValue; break;
  }
  break;
}
```

---

### WR-02: Dialogue history always shows character IDs instead of display names

**File:** `lib/engine/useSceneExecutor.ts:145`

**Issue:** The `DialogueHistoryEntry` type defines separate `characterId: string` and `characterName: string` fields (`types.ts:274-275`). However, the executor always sets `characterName: entry.characterId` (line 145), using the character ID as the display name. The `DialogueEntry` type (`types.ts:147-152`) only has `characterId` and no `characterName`, so there's no way to provide a human-readable name at the dialogue entry level.

This means dialogue history renders raw IDs like `"char_guide"` instead of display names like `"Guide"`. The `CharacterSprite` type has a `name` field, suggesting character names are available elsewhere but not propagated into dialogue entries.

While not a runtime bug, this is a UX quality gap where character identity resolution is incomplete.

**Fix:** Either add a `characterName` field to `DialogueEntry` and populate it from the character library at story-edit time, or look up the character name from the scene's `characters` array:

```typescript
// Resolve character name from scene state
const character = nextState.characters.find(c => c.characterId === entry.characterId);
const resolvedName = character?.characterId || entry.characterId;
// In dialogueHistory push:
{
  characterId: entry.characterId,
  characterName: resolvedName,
  // ...
}
```

---

### WR-03: getLoginUrl default state is deterministic (CSRF weakening risk)

**File:** `constants/oauth.ts:85`

**Issue:** When `getLoginUrl` is called without a `stateOverride`, it falls back to `encodeState(redirectUri)` — a base64-encoded redirect URI that is deterministic and predictable. The OAuth `state` parameter should always be a cryptographically random nonce for CSRF protection.

Currently, all callers pass `stateOverride` (from `generateOAuthState()` in `auth.ts:179-181`), so this fallback is never exercised in normal flow. But if a future caller omits the override, the OAuth state becomes trivially forgeable by anyone who knows the redirect URI.

**Fix:** Move `encodeState` into `generateOAuthState()` and remove the fallback altogether, or throw if `stateOverride` is not provided:

```typescript
export const getLoginUrl = (stateOverride?: string) => {
  if (!stateOverride) {
    throw new Error('getLoginUrl requires a state parameter (call generateOAuthState first)');
  }
  // ...
};
```

---

### WR-04: OAuth code exchange uses GET with code and state in query string

**File:** `lib/_core/api.ts:146-148`

**Issue:** The `exchangeOAuthCode` function sends the authorization code and state as GET query parameters:

```typescript
const params = new URLSearchParams({ code, state });
const endpoint = `/api/oauth/mobile?${params.toString()}`;
```

Per OAuth 2.0 best practices (RFC 6749 Section 4.1.3 and RFC 9700), the authorization code should be sent via POST to prevent it from being logged in server access logs, browser history, or Referer headers. A GET request with the code in the URL exposes it to:

1. Server access logs (full URL including query is logged)
2. `Referer` header leakage to third-party resources
3. Network intermediary inspection (proxies, CDNs)

If the backend team intentionally designed this endpoint as GET, this may be an accepted trade-off, but for a security hardening phase this should be reviewed.

**Fix:** Change to POST with body payload:

```typescript
const result = await apiCall<{ app_session_id: string; user: ApiUser }>('/api/oauth/mobile', {
  method: 'POST',
  body: JSON.stringify({ code, state }),
});
```

---

### WR-05: CSP for web allows broad framing and eval (hardening opportunity)

**File:** `app/+html.tsx:23-25`

**Issue:** The Content Security Policy meta tag is extremely permissive:

```
default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:;
media-src 'self' blob: data: https:; font-src 'self' data:;
connect-src 'self' https:; frame-src 'self' https:;
```

Specific weaknesses:
- **`frame-src 'self' https:`** — Any HTTPS origin can embed the app in an iframe (clickjacking risk). This should be restricted to specific origins needed for OAuth frames.
- **`script-src 'unsafe-inline' 'unsafe-eval'`** — Allows arbitrary inline scripts and `eval()`. Required by Metro/Expo dev mode but should be hardened for production.
- **`connect-src 'self' https:`** — Allows connections to any HTTPS origin, not constrained to the OAuth server URL.

While `unsafe-inline` and `unsafe-eval` are known Metro requirements, the `frame-src` directive could be tightened immediately without breaking functionality.

**Fix:** At minimum restrict `frame-src` to `'self'` (only allow same-origin framing). For production builds, consider nonce-based CSP for scripts:

```
<!-- development -->
frame-src 'self';

<!-- production (with nonce support) -->
script-src 'strict-dynamic' 'nonce-{random}';
```

---

### WR-06: asset-resolver fallback passes through unverifiable URIs silently

**File:** `lib/asset-resolver.ts:204-205`

**Issue:** When `resolveUri()` cannot verify a URI at any known location, it returns the URI as-is with only a LOW-severity error log:

```typescript
ErrorHandler.handle('Could not verify URI, using as-is', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri });
return uri;
```

This means that a URI that:
- Passes `isSafeUri()` and `isPathSafe()` but points to a non-existent file
- Is not in the bundled assets
- Is not a `file://`, `http://`, `https://`, `blob:` or `data:` URI
- Fails to resolve from document/caches directories

...will still be returned and used by the caller. The caller will then attempt to access this URI (e.g., via `<Image source={{ uri }} />`), which could trigger an unexpected network request or file system access.

**Fix:** Return `null` for unverifiable URIs instead of passing them through:

```typescript
// After all resolution attempts fail:
if (uri.startsWith('assets/') || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://')) {
  return uri; // these are known-safe patterns
}
ErrorHandler.handle('Could not verify URI, rejecting', null, ErrorCategory.VALIDATION, ErrorSeverity.LOW, { uri });
return null;
```

---

## Info

### IN-01: `reorderScenes` is a no-op — does not persist ordering

**File:** `stores/use-app-store.ts:424-433`

The `reorderScenes` function iterates over a `sceneIds` array and updates `updatedAt` timestamps, but scene records are stored as `Record<string, SceneRecord>` in the state, which has no inherent key ordering. The function neither stores the scene ID order nor changes the rendered sequence. This is dead code if ordering is never used, or a logic gap if ordering is expected.

If scene ordering is intended to be preserved, add a `sceneOrder: string[]` field alongside `sceneRecordsByStory`.

---

### IN-02: `getScenesForStory` uses `get()` instead of selector pattern

**File:** `stores/use-app-store.ts:398-400`

The `getScenesForStory` action uses `get()` directly instead of reading from the `set` callback argument. This is inconsistent with the other actions that use the `(s) => ...` setter pattern and means the action doesn't participate in zustand's reactive update batching. While functionally correct, it's an inconsistency.

---

### IN-03: `looksCanonical` heuristic is fragile

**File:** `lib/story-hooks.ts:78-81`

The canonical format detection checks if any scene has a `timeline` array property:

```typescript
Object.values(rawScenes as Record<string, unknown>).some((scene) =>
  !!scene && typeof scene === 'object' && Array.isArray((scene as { timeline?: unknown }).timeline),
);
```

A legacy story with a scene that happens to have a `timeline` key (unlikely but possible) would be misclassified as canonical. Consider using a version/format field instead, or checking all scenes (not just `some`).

---

### IN-04: `encodeState` fallback to plaintext in non-browser/non-Node environments

**File:** `constants/oauth.ts:56-66`

The `encodeState` function falls back to returning the raw value if neither `btoa` nor `Buffer` is available. In React Native, `btoa` may not be available in all contexts (Hermes), and `Buffer` is only available in Node.js polyfilled environments. The raw state string (from `generateOAuthState()`) is already alphanumeric and URL-safe, so this works in practice, but the fallback is not robust across all target environments. Consider using `expo-crypto` or a dedicated base64 polyfill.

---

### IN-05: Empty catch blocks for non-critical errors (pattern established by AGENTS.md)

**Files:** `app/_layout.tsx:23-24`, `lib/asset-resolver.ts:177`, `lib/asset-resolver.ts:190`, `app/_layout.tsx:33`

Several catch blocks are empty (`catch {}`). The AGENTS.md explicitly approves the `try { require("react-native-reanimated") } catch {}` pattern for web compatibility. However, the empty catches in `asset-resolver.ts` (`FileSystem.getInfoAsync` failures) could silently swallow legitimate errors that indicate misconfiguration. Consider at minimum logging the error in `__DEV__` mode.

---

### IN-06: `sanitizeText` does not handle unquoted event handlers

**File:** `lib/story-validator.ts:250`

The event handler removal regex requires quotes: `/on\w+\s*=\s*["'][^"']*["']/gi`. An unquoted event handler like `onclick=alert(1)` would pass through. In the current React Native rendering context, this is safe since `<Text>` components don't interpret HTML attributes. However, if text is ever rendered in a WebView or via `dangerouslySetInnerHTML`, this becomes an XSS vector. The fix would be to amend the regex to also match unquoted values: `on\w+\s*=\s*["']?[^\s>"']+["']?`.

---

_Reviewed: 2026-05-31T12:00:00Z_
_Reviewer: gsd-code-reviewer agent_
_Depth: standard_
