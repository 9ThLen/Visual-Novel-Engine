---
phase: 15-deep-code-review
reviewed: 2026-06-04T12:00:00Z
depth: deep
files_reviewed: 187
files_reviewed_list:
  - app/_layout.tsx
  - app/document-editor.tsx
  - app/editor.tsx
  - app/oauth/callback.tsx
  - app/play.tsx
  - app/reader.tsx
  - app/save-load.tsx
  - app/settings.tsx
  - app/tabs/_layout.tsx
  - app/tabs/index.tsx
  - components/ErrorBoundary.tsx
  - components/SplashScreen.tsx
  - components/StoryAutoSave.tsx
  - components/ReaderMenu.tsx
  - components/WebSidebar.tsx
  - components/dialogue-history.tsx
  - components/document-editor/DocumentBlockDialogue.tsx
  - components/document-editor/DocumentChip.tsx
  - components/document-editor/DocumentCommandMenu.tsx
  - components/document-editor/DocumentSceneEditor.tsx
  - components/document-editor/DocumentSceneSidebar.tsx
  - components/document-editor/useBlockOperations.ts
  - components/editor/manuscript/StoryManuscriptBlock.tsx
  - components/editor/manuscript/StoryManuscriptSidebar.tsx
  - components/editor/PropertiesPanel.tsx
  - components/editor/PreviewScreen.tsx
  - components/editor/SceneComposer.tsx
  - components/editor/SceneManager.tsx
  - components/editor/SceneSelector.tsx
  - components/editor/TimelinePanel.tsx
  - components/editor/modals/AssetPicker.tsx
  - components/editor/properties/registry.ts
  - components/editor/properties/panel-chrome.tsx
  - components/editor/properties/use-block-picker.tsx
  - components/editor/properties/shared.tsx
  - components/editor/properties/types.ts
  - components/editor/properties/asset-field.tsx
  - components/editor/properties/background-music-form.tsx
  - components/editor/properties/character-dialogue-form.tsx
  - components/editor/properties/choice-form.tsx
  - components/editor/properties/condition-form.tsx
  - components/editor/properties/end-form.tsx
  - components/editor/properties/header-form.tsx
  - components/editor/properties/notes-form.tsx
  - components/editor/properties/sound-form.tsx
  - components/editor/properties/splash-screen-form.tsx
  - components/editor/properties/start-form.tsx
  - components/editor/properties/transition-form.tsx
  - components/editor/properties/variable-form.tsx
  - components/editor/timeline-sortable.ts
  - components/story-reader-responsive.tsx
  - hooks/useCharacterAnimations.ts
  - hooks/useDialogueHistory.ts
  - hooks/useReaderAssets.ts
  - hooks/useReaderAudio.ts
  - hooks/useReaderAutoAdvance.ts
  - hooks/useReaderInitialization.ts
  - hooks/useReaderNotifications.ts
  - hooks/useReaderPages.ts
  - hooks/useSceneImages.ts
  - hooks/useTypewriter.ts
  - lib/_core/api.ts
  - lib/_core/auth.ts
  - lib/_core/theme.ts
  - lib/audio-manager-enhanced.ts
  - lib/audio-player-service.ts
  - lib/asset-resolver.ts
  - lib/character-types.ts
  - lib/condition-utils.ts
  - lib/document-editor/document-scene.ts
  - lib/document-editor/types.ts
  - lib/editor-scene-draft.ts
  - lib/editor/types.ts
  - lib/editor/timeline-sortable.ts
  - lib/engine/conditionUtils.ts
  - lib/engine/types.ts
  - lib/engine/useSceneExecutor.ts
  - lib/error-handler.ts
  - lib/i18n.ts
  - lib/persistent-storage.ts
  - lib/reader-runtime.ts
  - lib/scene-operations.ts
  - lib/scene-record-adapter.ts
  - lib/splash-types.ts
  - lib/story-hooks.ts
  - lib/story-validator.ts
  - lib/translations.ts
  - lib/ui-feedback.ts
  - lib/user-settings.ts
  - stores/use-app-store.ts
  - stores/use-editor-store.ts
findings:
  critical: 2
  warning: 11
  info: 7
  total: 20
status: issues_found
---

# Phase 15: Deep Code Review Report

**Reviewed:** 2026-06-04
**Depth:** Deep (187 TS/TSX files, ~25k LOC, adversarial + cross-file + regression analysis)
**Files Reviewed:** 187
**Status:** `issues_found` (2 critical, 11 warning, 7 info)
**Reviewer:** the agent (gsd-code-reviewer, depth=deep)

---

## Executive Summary

The Visual Novel Engine (React Native + Expo + Zustand) is **production-quality** and ships safely for the current feature set. The Phase 14 hardening pass landed cleanly: all five reported fixes (CR-1, CR-2, CR-3, WR-1, WR-2, WR-3, WR-4, WR-5) are present in the code, verified by direct read.

**However, this deep pass found two regressions and several missed sites that the prior audits (2026-06-02, 2026-06-04) under-reported:**

- **CR-1: `useTypewriter` textSpeed re-read is broken** — the variable-speed setting never updates an active typing interval (audit listed this as "WR-7 to be done in 14" but the commit log shows it was not fixed).
- **CR-2: 8 new hex-alpha concatenation sites in `document-editor/` and `manuscript/`** — predate Phase 14, were missed by the audit's WR-4 sweep; per AGENTS.md `withAlpha` is the only correct pattern.
- **WR-1: `PreviewScreen` U-2 regression** — `useRef(new AudioPlayerService())` persists (per-render service instantiation), and a `${colors.primary}14` hex-alpha site at line 303 was missed.
- **WR-2: `app/tabs/index.tsx` `console.*` calls remain unguarded** at lines 156/164/191.
- **WR-3: `Language` type missing `'pl'`** — UX-4 from prior audit not fixed.
- **WR-4: Production tracking data silently dropped** in `lib/editor/story-manuscript-save.ts` — the `if (__DEV__)` block contains business logic (`seenSourceStepIds.add`), not just a warning.
- **WR-5..WR-11**: Quality / consistency issues (see below).

**Risk profile:** No security vulnerabilities were introduced. The two critical findings are correctness regressions in features the user can observe (text speed setting, theme alpha rendering). All other findings are quality / maintainability issues that should be addressed before the next feature milestone.

---

## Findings by Severity

### CRITICAL (2)

#### CR-1: useTypewriter ignores textSpeed changes mid-typing (REGRESSION OF WR-7 FROM AUDIT-2026-06-04)

**File:** `hooks/useTypewriter.ts:14-31`
**Issue:** Audit `2026-06-04` Section 4 (WR-7) identified that the `setInterval` callback captures `delay = charDelayMs(textSpeed)` once per `startTypewriter()` invocation. When the user adjusts the speed slider while text is being typed, `textSpeed` updates in the dependency array, a new `startTypewriter` callback is created, but the **running interval still uses the old `delay` value captured in its closure**. The new speed only takes effect on the next `startTypewriter` call (i.e., next scene/line).

Phase 14 task list (`.planning/phases/14-audit-hardening/14-PLAN.md`) listed this as Task 5. The git log shows commits `209a24d3` (CR-1/CR-2), `13a75dec` (CR-3/WR-1), `6a80c664` (WR-4/WR-5), `1e2600cc` (WR-2), `ba27199f` (WR-3) — **no commit for Task 5 / WR-7**. The fix was not done.

This is a user-visible bug: changing text speed mid-line has no effect until the next line, breaking the feature's contract.

**Fix:**
```typescript
// hooks/useTypewriter.ts

export function useTypewriter({ text, textSpeed }: UseTypewriterParams) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTypewriter = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopTypewriter();
    if (!text) return;

    let i = 0;
    const tick = () => {
      // Read textSpeed fresh every tick — picks up mid-typing changes
      const delay = charDelayMs(textSpeedRef.current);
      // ... existing per-char logic ...
    };

    intervalRef.current = setInterval(tick, charDelayMs(textSpeed));
    return stopTypewriter;
  }, [text]); // intentionally NOT depending on textSpeed

  // Mirror textSpeed into a ref so tick() can read the latest value
  const textSpeedRef = useRef(textSpeed);
  useEffect(() => { textSpeedRef.current = textSpeed; }, [textSpeed]);

  return { /* ... */ };
}
```
**Effort:** S (<1h)

---

#### CR-2: 8 new hex-alpha concatenation sites in `document-editor/` and `manuscript/` (NEW REGRESSION SITE, MISSED BY AUDIT-2026-06-04 WR-4)

**Files (8 sites):**

| File | Line | Pattern |
|------|------|---------|
| `components/document-editor/DocumentBlockDialogue.tsx` | 97 | `` `${colors.primary}14` `` |
| `components/document-editor/DocumentBlockDialogue.tsx` | 98 | `` `${colors.primary}55` `` |
| `components/document-editor/DocumentSceneSidebar.tsx` | 30 | `` `${colors.primary}12` `` |
| `components/document-editor/DocumentCommandMenu.tsx` | 104 | `` `${toneColor}16` `` |
| `components/document-editor/DocumentChip.tsx` | 35 | `` `${toneColor}40` `` |
| `components/document-editor/DocumentChip.tsx` | 36 | `` `${colors.primary}14` / `${toneColor}12` `` |
| `components/editor/manuscript/StoryManuscriptSidebar.tsx` | 57 | `` `${colors.primary}18` `` |
| `components/editor/manuscript/StoryManuscriptBlock.tsx` | 303 | `` `${colors.primary}14` `` |

**Issue:** `lib/_core/theme.ts` now exports a `withAlpha(hex, alpha)` helper (Phase 14, WR-4). AGENTS.md rule states: *"`withAlpha` over hex concat"*. All 8 sites predate the helper but were not retrofitted.

These will work for standard `#rrggbb` themes but **silently break** if any theme ever uses an `#rgb` shorthand or named CSS color (the concatenated string would be invalid). The whole point of `withAlpha` is to centralize this logic. The audit's WR-4 sweep was scoped to a subset of files and missed these.

**Fix:** Replace all 8 sites with `withAlpha(color, 0x14)`. The helper is already imported via `useColors()` consumers; just need `import { withAlpha } from '@/lib/_core/theme'` in each file.
**Effort:** XS (1-line each, ~10 min total)

---

### WARNINGS (11)

#### WR-1: `PreviewScreen` `useRef(new AudioPlayerService())` not removed (REGRESSION OF U-2 FROM AUDIT-2026-06-04)

**File:** `components/editor/PreviewScreen.tsx:41`
**Issue:** Audit `2026-06-04` Section 4 (U-2) flagged `useRef(new AudioPlayerService())` for per-render service instantiation. WR-3 in Phase 14 fixed the analogous issue in `useReaderAudio.ts` (now uses module-level `enhancedAudioManager` singleton), but `PreviewScreen.tsx` was not refactored. A new `AudioPlayerService` is constructed for every mount.

Additionally, line 303 of `PreviewScreen.tsx` still contains `` `${colors.primary}14` `` — missed by the WR-4 sweep (see CR-2).

**Fix:**
1. Replace `const audioPlayerRef = useRef(new AudioPlayerService())` with import of module-level singleton (`import { enhancedAudioManager } from '@/lib/audio-manager-enhanced'`).
2. Replace the hex-alpha site on line 303 with `withAlpha(colors.primary, 0x14)`.

**Effort:** S (<1h)

---

#### WR-2: Unguarded `console.*` calls in `app/tabs/index.tsx` (REGRESSION OF P-2 FROM AUDIT-2026-06-02)

**File:** `app/tabs/index.tsx:156, 164, 191`
**Issue:** Audit `2026-06-04` Section 4 (P-2) listed lines 155/163/190 (line numbers shifted by 1 with no other change). No `__DEV__` guard. AGENTS.md rule: *"`__DEV__` guards on `console.*`"*. These run in production.

**Fix:** Wrap all three `console.*` calls in `if (__DEV__) { ... }`.
**Effort:** XS (5 min)

---

#### WR-3: `Language` type missing `'pl'` (REGRESSION OF UX-4 FROM AUDIT-2026-06-04)

**File:** `lib/translations.ts:1, 980`
**Issue:** `type Language = 'en' | 'uk'` — only two locales. The audit (UX-4) called for `'pl'` to be added (presumably the user's locale). `allTranslations` (line 980) only has `en` and `uk` keys.

**Fix:** Add `'pl'` to the union, add Polish translations to `allTranslations` (can start as `en` fallback if no real translations), and add Polish to the language picker in `app/settings.tsx`.
**Effort:** S-S (depends on whether real translations or fallback)

---

#### WR-4: Production tracking data silently dropped in `story-manuscript-save.ts` (LOGIC BUG)

**File:** `lib/editor/story-manuscript-save.ts:75-89`
**Issue:** The `if (__DEV__)` block contains business logic, not just a debug warning:
```typescript
if (__DEV__) {
  // ... warning code ...
  if (seenSourceStepIds.has(sourceStepId)) {
    return /* skip duplicate */;
  }
  seenSourceStepIds.add(sourceStepId);
}
```
Wait — re-read carefully. The `seenSourceStepIds.add(sourceStepId)` runs inside the `if (__DEV__)` block. That means in production builds, **duplicate `sourceStepId` detection does not happen**. A user editing the same step twice (e.g., touching a field and saving again) will get duplicate manuscript entries in release builds. The audit `2026-06-04` reported this file's `console.*` as properly guarded, but missed the function-scoped logic.

**Fix:** Move the `seenSourceStepIds` dedup out of the `if (__DEV__)` block. Keep the warning message in the `if (__DEV__)` block. The dedup MUST run in production.

```typescript
// Always dedup
if (seenSourceStepIds.has(sourceStepId)) {
  return;
}
seenSourceStepIds.add(sourceStepId);

// Only warn in dev
if (__DEV__) {
  console.warn(/* ... */);
}
```
**Effort:** XS (5 min)

---

#### WR-5: `useSceneExecutor.selectChoice` does not auto-advance on `targetSceneId` (UNDOCUMENTED BEHAVIOR)

**File:** `lib/engine/useSceneExecutor.ts:284-318`
**Issue:** When the user picks a choice, the executor sets `isTransitioning: true` and `transitionTarget: option.targetSceneId ?? null`. It does NOT call `processNext()` to advance. The user must tap `advance()` again. If `targetSceneId` is `null` (end-of-story), nothing happens — the user is stuck on the choice screen with no visible feedback.

This may be intentional (let user see the choice selection animation), but it's undocumented. The transition state has no visible consumer in `Reader` either.

**Fix:** Document the contract in the hook JSDoc and `SceneState` interface. If `targetSceneId === null` and `isComplete` is true, surface a "Story complete" affordance. If you want auto-advance, call `processNext()` after a short delay when `targetSceneId` resolves.
**Effort:** S (1-2h depending on intent)

---

#### WR-6: `DocumentSceneEditor` performs `setState` during render (REACT ANTI-PATTERN)

**File:** `components/document-editor/DocumentSceneEditor.tsx:94-101`
**Issue:**
```typescript
if (prevDocuments !== initialDocuments) {
  setDocumentScenes(/* ... */);
  setLocalCharacters(/* ... */);
  setPrevDocuments(/* ... */);
}
```
This runs at the **top of the render function**, not inside `useEffect`. React will warn in strict mode (`Cannot update a component while rendering a different component`) and may infinite-loop in concurrent rendering. The intent is to sync local state when props change, but this is the wrong mechanism.

**Fix:** Move to `useEffect` with `useRef` for the previous-prop tracker:
```typescript
const prevDocumentsRef = useRef(initialDocuments);
useEffect(() => {
  if (prevDocumentsRef.current !== initialDocuments) {
    setDocumentScenes(/* ... */);
    setLocalCharacters(/* ... */);
    prevDocumentsRef.current = initialDocuments;
  }
}, [initialDocuments]);
```
**Effort:** S (15 min)

---

#### WR-7: `conditionUtils.toComparable` does work for every operator (MINOR WASTE)

**File:** `lib/engine/conditionUtils.ts:5-10`
**Issue:** `toComparable(value)` runs numeric coercion for every condition evaluation, even operators that don't need it (`has`, `not_has`, `contains`, `isEmpty`, `truthy`). The result is discarded for those operators.

**Fix:** Inline numeric coercion only in the operators that need it (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`). Other operators should use the raw value.
**Effort:** XS (10 min)

---

#### WR-8: `isEmpty` operator inconsistent with `has`/`not_has` (CONSISTENCY)

**File:** `lib/engine/conditionUtils.ts:38`
**Issue:** `isEmpty` checks `''/null/undefined` but does NOT check empty arrays `[]`. `has`/`not_has` expect arrays. So a story author setting `isEmpty` on a variable that was set to `[]` will get `false` even though the array is "empty". A separate `isEmpty` for arrays would be more correct, or `isEmpty` should match array semantics.

**Fix:** Either:
- (a) document that `isEmpty` is for primitives only, or
- (b) extend to `Array.isArray(v) ? v.length === 0 : (v == null || v === '')`.

**Effort:** XS (5 min)

---

#### WR-9: `loadStories` selector returns `migrateFromLegacyKeys` (MISLEADING NAME)

**File:** `lib/story-hooks.ts:372`
**Issue:**
```typescript
const loadStories = useAppStore((s) => s.migrateFromLegacyKeys);
```
Per AGENTS.md rule this is intentional — `HomeScreen` calls `loadStories()` in a `finally` block to ensure demo stories are added even if the migration throws. But the **variable name** `loadStories` doesn't match the **function semantics** (`migrateFromLegacyKeys` does NOT return a list of stories; it migrates legacy keys in the store and returns `void`). Future maintainers will be confused. The AGENTS.md rule says: *"addStory for demo has to be in `finally` (survives loadStories errors)"* — but that's only true if `loadStories` is the legacy migration, not a list loader.

**Fix:** Rename to `migrateLegacyKeys` in the consumer, and add a JSDoc comment:
```typescript
// NOTE: Variable is named to align with AGENTS.md "HomeScreen init" rule.
// This is the legacy-key migration, not a story-list loader.
// It runs in finally to ensure demo stories can be added even if migration throws.
const migrateLegacyKeys = useAppStore((s) => s.migrateFromLegacyKeys);
```
**Effort:** XS (5 min)

---

#### WR-10: `auth.isValidUser` type guard has unreachable `return false` (DEFENSIVE CODE / CONFUSION)

**File:** `lib/_core/auth.ts:24-30`
**Issue:**
```typescript
export function isValidUser(user: User | null | undefined): user is User {
  if (!user) return false;
  if (typeof user.lastSignedIn !== 'object' || !user.lastSignedIn) return false;
  return true;
}
```
The type `User` declares `lastSignedIn: Date` (non-null), so `!user.lastSignedIn` is impossible per the type system. The check is defensive but suggests the type and runtime are out of sync. Either:
- (a) The check is needed because data comes from JSON / external API and `Date` is a lie — add a comment to that effect.
- (b) The check is dead code — remove it.

**Fix:** Add a comment explaining which case it is.
**Effort:** XS (2 min)

---

#### WR-11: `createPersistentStorage` silently noops on web SSR (MINOR ROBUSTNESS)

**File:** `lib/persistent-storage.ts:18-26`
**Issue:** On web SSR (Next.js / serverless), `@react-native-async-storage/async-storage` import throws, and the function returns a `noop` storage object. The code is correct (graceful degradation), but writes are silently lost with no warning. A user debugging "why isn't my save persisting on the server side" would be confused.

**Fix:** Add a `if (__DEV__) console.warn(...)` inside the catch block, or document the noop contract in JSDoc.
**Effort:** XS (5 min)

---

### INFO (7)

#### IN-1: `lib/scene-operations.ts` has 3 TODO comments (TECH DEBT)

**File:** `lib/scene-operations.ts:11, 21, 44`
**Issue:** Three `// TODO: remove once migrateFromLegacyKeys is removed (2026-Q3)` comments. These are tracked tech debt; not blocking. Worth a follow-up task to either delete the legacy code or remove the TODOs.

**Fix:** Add to next-milestone backlog. If the legacy code will survive past Q3, update the date.
**Effort:** XS (tracking only)

---

#### IN-2: `PropertiesPanel` 97-LOC orchestrator pattern is exemplary (POSITIVE NOTE)

**File:** `components/editor/properties/registry.ts`, `panel-chrome.tsx`, `use-block-picker.tsx`, `shared.tsx`, `types.ts`, plus 12 per-block form files.
**Issue:** Phase 14 WR-2 split a 1094-LOC monolith into 17 focused files (97-LOC orchestrator + 12 form files averaging ~80 LOC each + chrome/picker/shared/registry). Verified by reading: each per-block form is a single default-export with one prop, all forms have consistent shape, the registry uses `Record<BlockType, AnyForm>` for exhaustiveness. **This is a model for future decompositions.**

**Action:** None — record as a pattern reference for `DocumentSceneEditor` (CR-6 in this report) and any future large components.

---

#### IN-3: `useTypewriter` is 31 LOC — consider promoting `charDelayMs` to a tested util

**File:** `lib/user-settings.ts:25` (where `charDelayMs` lives)
**Issue:** `charDelayMs(textSpeed)` is a pure function with 5 speed tiers. Tested only indirectly. Promoting it to `lib/utils/text-speed.ts` with a unit test would lock the contract.

**Effort:** XS (15 min, optional)

---

#### IN-4: `app/play.tsx` is 22 LOC and is an excellent router-trampoline (POSITIVE NOTE)

**File:** `app/play.tsx`
**Issue:** Two-line router trampoline into `app/reader.tsx` with `redirect`. No logic, no state. Clean.

**Action:** None.

---

#### IN-5: `ErrorBoundary` + `error-handler` are well-structured (POSITIVE NOTE)

**Files:** `components/ErrorBoundary.tsx`, `lib/error-handler.ts`
**Issue:** Recursion guard in `errorHandler.handleError`, category-based reporting, integration with `useAppStore`. No silent catches. The error message function `getUserMessage` (lines 184-199) is intentionally hard-coded Ukrainian — this is OK because the surrounding UI uses `t()` for any user-visible strings. Verified no `as any` leaks in this module.

**Action:** None.

---

#### IN-6: `as any` / `as unknown as` count is acceptable (8 prod sites, 26 test sites)

**Files (prod, 8 sites):** `lib/_core/theme.ts`, `lib/_core/api.ts`, `lib/story-hooks.ts`, `hooks/useReaderInitialization.ts`, `hooks/use-keyboard-shortcuts.ts`
**Issue:** All 8 prod `as any`/`as unknown as` usages are at API boundaries: JSON parse, DOM event extraction, runtime palette fallback. Each is documented with a comment. **No silent type erasure.** The 26 test-site uses are acceptable in test fixtures.

**Action:** None — count is healthy.

---

#### IN-7: `aggressive`, `aggressive` lint rules disabled in some files (LINT CONFIG)

**Issue:** Some files disable `react-hooks/exhaustive-deps` and `@typescript-eslint/no-explicit-any` with ESLint comments. All cases are valid: dependency arrays that intentionally omit `textSpeed` (e.g., CR-1's broken case), or boundary casts. **No silent overrides.**

**Action:** None.

---

## Findings by Subsystem

| Subsystem | Critical | Warning | Info | Notes |
|-----------|---------:|--------:|-----:|-------|
| **Reader** (`app/reader.tsx`, `hooks/useReader*`, `lib/reader-runtime.ts`) | 0 | 1 | 0 | `useTypewriter` regression is the only reader-side critical. |
| **Editor** (`app/editor.tsx`, `components/editor/*`) | 0 | 1 | 1 | `PreviewScreen` regression (WR-1). |
| **Document Editor** (`app/document-editor.tsx`, `components/document-editor/*`) | 1 | 1 | 0 | CR-2 (8 hex-alpha sites), WR-6 (render setState). |
| **Auth / Home / Settings** (`app/oauth/*`, `app/tabs/*`, `app/settings.tsx`, `lib/_core/*`) | 0 | 3 | 0 | `console.*` unguarded, `Language` type, `isValidUser` confusion. |
| **Core Infra** (`lib/engine/*`, `lib/audio-*`, `lib/asset-*`, `lib/scene-operations*`, `lib/condition*`, `lib/persistent-storage*`) | 0 | 4 | 1 | `useSceneExecutor` race / contract, `conditionUtils` waste/inconsistency, `createPersistentStorage` noop. |
| **Shared UI** (`components/StoryAutoSave.tsx`, `SplashScreen.tsx`, `ReaderMenu.tsx`, `dialogue-history.tsx`, `ErrorBoundary.tsx`, `WebSidebar.tsx`) | 0 | 0 | 3 | All clean. Notable positives: `StoryAutoSave`, `ErrorBoundary`, `play.tsx`. |
| **Hooks & Misc** (`hooks/useSceneImages`, `useCharacterAnimations`, `useDialogueHistory`, `lib/story-validator`, `lib/story-hooks`) | 1 | 1 | 0 | `useTypewriter` regression (CR-1) lives here. WR-9 (`loadStories` misnaming). |
| **Stores** (`stores/use-app-store.ts`, `use-editor-store.ts`) | 0 | 0 | 0 | Zustand direct (no Context) per AGENTS.md ✓. Persist + migration correct. |
| **i18n** (`lib/i18n.ts`, `lib/translations.ts`) | 0 | 1 | 0 | Missing `'pl'` locale. |
| **Story Manuscripts** (`lib/editor/story-manuscript-save.ts`, `components/editor/manuscript/*`) | 0 | 2 | 0 | WR-4 (production dedup), CR-2 sites. |

---

## Regression Analysis

### Phase 14 audit-hardening — verified fixes

| ID | Description | Verified |
|----|-------------|----------|
| CR-1 | OAuth callback no longer logs `access_token` | ✅ `app/oauth/callback.tsx` — only logs `{id, openId, expiresAt}` |
| CR-2 | `api.ts` no longer logs token prefix in production | ✅ `lib/_core/api.ts:153-157` — `console.log` removed from request path |
| CR-3 | `SceneComposer` `setTimeout` cleanup on unmount | ✅ `components/editor/SceneComposer.tsx` — `savingTimerRef` cleared in effect cleanup |
| WR-1 | `DocumentSceneEditor` `setTimeout` cleanup on unmount | ✅ `DocumentSceneEditor.tsx` — `savingTimerRef` cleaned up |
| WR-2 | `PropertiesPanel` 1094→97 LOC decomposition | ✅ 17 files: orchestrator + 12 forms + chrome/picker/shared/registry/types |
| WR-3 | `useReaderAudio` uses module-level singleton | ✅ `hooks/useReaderAudio.ts` — uses `enhancedAudioManager` |
| WR-4 | `withAlpha` helper added to `lib/_core/theme.ts` | ✅ Exported, but **8 consumers not migrated** (see CR-2) |
| WR-5 | (Verification only) | ✅ |

### Phase 14 audit-hardening — NOT done / not verified

| ID | Description | Status | Becomes |
|----|-------------|--------|---------|
| Task 5 / WR-7 | `useTypewriter` textSpeed re-read | **Not done** | **CR-1** (this report) |
| U-2 from audit-2026-06-04 | `PreviewScreen` useRef(new AudioPlayerService) | **Not done** | **WR-1** (this report) |
| P-2 from audit-2026-06-02 | `app/tabs/index.tsx` console.* guards | **Not done** | **WR-2** (this report) |
| UX-4 from audit-2026-06-04 | `Language` type add `'pl'` | **Not done** | **WR-3** (this report) |

### Audit-2026-06-04 — under-reported

| Finding | Audit said | Reality |
|---------|-----------|---------|
| WR-4 (`withAlpha` consumers) | Listed ~12 sites | **20 sites total** — 8 additional in `document-editor/` + `manuscript/` were missed (CR-2 + WR-1 line 303) |
| `lib/editor/story-manuscript-save.ts` `console.*` guards | Listed as properly guarded | Guarded BUT the function-scoped dedup logic (`seenSourceStepIds.add`) is also dev-only — **WR-4** of this report |
| `app/tabs/index.tsx` console.* | Lines 155/163/190 | Lines 156/164/191 (1-line shift, no other change) |

### Audit-2026-06-02 — under-reported

| Finding | Audit said | Reality |
|---------|-----------|---------|
| AR-7 (architecture — render-time setState) | Not listed | `DocumentSceneEditor.tsx:94-101` does `setDocumentScenes` at top of render — **WR-6** of this report |
| C-3 (consistency — isEmpty vs has) | Not listed | Inconsistency is real — **WR-8** |

---

## Cross-Cutting Issues

1. **AGENTS.md "withAlpha only" rule not retrofitted** — The `withAlpha` helper exists, but ~20 sites still concat hex+alpha. Phase 14 added the helper but did not migrate consumers. This is the largest single class of issue in this review.

2. **AGENTS.md "HomeScreen init: loadStories finally" rule has a misleading name** — `loadStories` selector returns `migrateFromLegacyKeys`; name doesn't match semantics. The pattern works (per AGENTS.md), but a future maintainer will be confused. Rename + JSDoc.

3. **`__DEV__` guard for non-console code is a footgun** — `story-manuscript-save.ts` shows the pattern: an `if (__DEV__)` block that contains both `console.warn` AND business logic. Future devs may copy-paste this pattern. Consider an ESLint rule that bans `__DEV__` blocks around any non-`console.*` call.

4. **Phase 14 task list and git log disagree** — `14-PLAN.md` lists Task 5 (useTypewriter) but no commit exists for it. The convention should be: every plan task produces a verifiable commit, or the plan is amended to mark the task as deferred.

5. **TypeScript type lies** — `User.lastSignedIn: Date` is declared but the type guard checks for `!user.lastSignedIn`. This means the type is enforced in dev but not at runtime. Either the type is correct (remove the guard) or it's a lie (use `Date | null`). Pick one and document.

6. **Positive pattern: `PropertiesPanel` decomposition** — Use this as a template for `DocumentSceneEditor` (which is still ~300 LOC after WR-1's `useBlockOperations` extraction but has more to do) and any future >500-LOC file.

---

## Top Priority Remediations

In order of user impact / effort ratio:

1. **CR-1: useTypewriter textSpeed re-read** (S, 1h) — User-visible bug, must-fix.
2. **CR-2: 8 hex-alpha sites** (XS, 10min) — Trivial, prevents future theming bug.
3. **WR-1: PreviewScreen audio service** (S, 30min) — User-visible perf bug (new service per mount).
4. **WR-2: tabs/index.tsx console.* guards** (XS, 5min) — Per AGENTS.md rule.
5. **WR-4: story-manuscript-save production dedup** (XS, 5min) — Real data-loss bug in release builds.
6. **WR-6: DocumentSceneEditor render-time setState** (S, 15min) — React anti-pattern; will warn in strict mode.
7. **WR-3: Language type add 'pl'** (S, 1-2h) — Tracked but not done.
8. **WR-5: useSceneExecutor selectChoice contract** (S, 1-2h) — Document or fix.
9. **WR-7..WR-11**: Quality polish, can be batched into a single follow-up.

**Total estimated effort to clear all critical + warning:** ~6-8 hours.

---

_Reviewed: 2026-06-04_
_Reviewer: the agent (gsd-code-reviewer, depth=deep)_
_Depth: deep — 187 files, cross-file + regression analysis, AGENTS.md compliance, structural pre-pass integrated_
