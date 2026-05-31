---
status: review
phase: 08
phase_name: post-migration-cleanup
depth: full
files_reviewed: 85
critical: 6
warning: 9
info: 10
total: 25
---

# Phase 08 — Code Review: Post-Migration Cleanup

**Reviewer:** opencode  
**Date:** 2026-05-31  
**Scope:** All files changed/introduced during Phase 08 (test fixes, library cleanup, color tokenization, a11y labels, race condition fixes F-01–F-05)

---

## Executive Summary

Phase 08 delivers meaningful cleanup: test infrastructure fixes, legacy type isolation, race condition hardening (F-01–F-05), and color tokenization. The codebase is **generally healthy** — theme colors are consistently oklch, tests are well-structured with factory helpers, and the engine executor has proper error boundaries.

**6 critical** findings: 2 theme token gaps, 2 import path regressions, 1 potential data-loss path in manuscript save, 1 type mismatch.  
**9 warnings**: anti-patterns, potential runtime edge cases, `console.warn` leaks.  
**10 info**: observations for future refactoring.

---

## Critical

### CR-01 — `story-reader-platform.ts` returns hardcoded colors instead of theme tokens

`components/story-reader-platform.ts:5-6` returns `{ backgroundColor: '#000000', overflow: 'hidden' }` and `{ color: '#ffffff' }`. This violates Phase 08's color tokenization scope — these should use `useColors()` or `colors.background`/`colors.foreground` from the runtime theme.

**Impact:** Reader container always renders with black background regardless of light/dark theme. On light mode (or reader warm-beige theme), this creates an abrupt visual jar.

**Fix:** Either (a) make these platform helpers accept a color parameter, or (b) remove the platform helpers entirely and inline the styles in `story-reader-responsive.tsx` using `useColors()`. Given the pattern in sibling modules (`button-platform.ts`, `screen-container-platform.ts`), option (b) is cleaner.

### CR-02 — `app/tabs/index.tsx` imports deprecated `Story` type from `@/lib/scene-operations`

`app/tabs/index.tsx` uses `import { Story } from '@/lib/scene-operations'`. The plan acknowledges this is blocked on `migrateFromLegacyKeys` (AGENTS.md), but this is a high-traffic home screen file that should be migrated when the blocker clears.

**Impact:** Perpetuates the legacy type chain. `Story` re-exports through `lib/scene-operations` → `lib/types`, creating a fragile dependency path.

**Mitigation:** Add a `// TODO(phase-09): replace with canonical type` comment at the import site for discoverability.

### CR-03 — `app/save-load.tsx` imports from `@/lib/types` (legacy re-export path)

`app/save-load.tsx` uses `import { SaveSlot } from '@/lib/types'`. `lib/types.ts` is a thin re-export wrapper (29 LOC) that the plan identifies for removal. `SaveSlot` is defined in `lib/story-domain.ts` and should be imported directly.

**Impact:** Blocks removal of `lib/types.ts`, which the plan has deferred but still counts as tech debt.

**Fix:** `import { SaveSlot } from '@/lib/story-domain'` (or from the new canonical location).

### CR-04 — Manuscript save `flatMap` can produce mismatched timeline length

`lib/editor/story-manuscript-save.ts:73-80` uses `flatMap` to rebuild a scene's timeline from manuscript blocks. If a block's `sourceStepId` matches **multiple** original steps, or matches **none** (orphaned block), the resulting timeline can have a different length than expected. `flatMap` silently drops `undefined` returns.

```ts
const originalStep = originalStepsById.get(block.sourceStepId);
if (!originalStep) {
  return [createStepFromManuscriptBlock(block)]; // orphan: creates new step
}
return [updateStepFromManuscriptBlock(originalStep, block)]; // maps 1:1
```

**Impact:** If `sourceStepId` is duplicated (blocks pointing to same step), `flatMap` duplicates that step in the output. If a block is orphaned, a new step is auto-created. These are silent mutations with no user feedback.

**Fix:** Validate that `sourceStepId` references are unique and exist before applying, or add a `console.warn` in `__DEV__` when duplicates/orphans are detected.

### CR-05 — `theme-colors.json` has keys missing from `theme.config.d.ts` type

`constants/theme-colors.json` defines `surface-container` (line 258) and `secondary` (line 262) which are **not** in the `theme.config.d.ts:2-66` type definition. These will be typed as `any` when accessed through the JS module, and Tailwind's `var(--color-surface-container)` will reference CSS variables that may not be injected.

**Impact:** Silent runtime — `useColors()` will return `undefined` for these keys at the JS level, while CSS variable injection in `theme-provider.tsx` may also miss them if the provider iterates the type definition keys.

**Fix:** Either add both keys to `theme.config.d.ts`, or remove them from `theme-colors.json`.

### CR-06 — `theme-nativewind.ts` `require('nativewind')` throws on web

`lib/theme-nativewind.ts:12` has `defaultLoadBindings` that calls `require('nativewind')`. On web platforms where nativewind is not bundled (e.g., Expo web), this `require` will throw a `MODULE_NOT_FOUND` error. The code guards with `if (isWeb) return undefined` at each call site, but the **default** `loadBindings` parameter still has the `require` at module parse time.

**Impact:** Tree-shaking will not help because `require` is a dynamic call that Vite/RSPack will attempt to resolve. Could cause a hard crash on web startup.

**Fix:** Make `defaultLoadBindings` a lazy thunk: `() => { try { return require('nativewind') } catch { return {} } }`, or use dynamic `import()`.

---

## Warnings

### WR-01 — `console.warn` instead of `ErrorHandler` in asset-resolver

`lib/asset-resolver.ts:130,199` uses:
```ts
if (__DEV__) console.warn('[AssetResolver] Blocked unsafe path:', uri);
```
The rest of the file correctly uses `ErrorHandler.handle()` for errors (line 202, 238, 254, 289). These two `console.warn` calls are inconsistent with the established pattern.

**Fix:** Replace with `ErrorHandler.handle(...)` at `WARNING` severity, or at minimum strip the `[AssetResolver]` tag for consistency.

### WR-02 — `StoryManuscriptBlock` technical_marker Pressable has no handler

`components/editor/manuscript/StoryManuscriptBlock.tsx:286-298` renders a `Pressable` with rounded-pill styling for `technical_marker` blocks, but **no `onPress` handler** is attached. The component is visually styled as interactive but does nothing when pressed.

**Impact:** Misleading UX — users may tap expecting something to happen. On mobile this wastes a tap and may cause confusion.

**Fix:** Either add a meaningful `onPress` (e.g., reveal more details, scroll to the technical block in the main editor), or use a `View` instead of `Pressable`.

### WR-03 — ViewTransition race condition in `navigateWithViewTransition`

`lib/navigation-transition.ts:28-33` calls `startTransition(navigate)` inside the ViewTransition callback, then has `.finally` on the transition. If the ViewTransition resolves before `startTransition` flushes (microtask timing), the `documentElement.dataset.viewTransition` cleanup runs while the actual navigation is still pending.

```ts
const transition = viewTransitionDocument.startViewTransition(() => {
  startTransition(navigate); // might not flush synchronously
});
void transition.finished.finally(() => {
  delete document.documentElement.dataset.viewTransition; // cleanup too early
});
```

**Impact:** In rare timing conditions, the `viewTransition` data attribute is removed before `navigate` causes a re-render, meaning the CSS transition type is not applied.

**Fix:** Move cleanup into `startTransition`'s callback, or use `transition.finished.then(() => startTransition(navigate)).finally(cleanup)`.

### WR-04 — `numberOfLines` on multiline TextInput is iOS-only

`components/editor/manuscript/StoryManuscriptBlock.tsx:91` uses `numberOfLines={5}` on a multiline `TextInput`. This prop is [iOS-only](https://reactnative.dev/docs/textinput#numberoflines) and does not affect Android rendering.

**Impact:** Minor UI inconsistency on Android — the text input area may render smaller than intended before the user starts typing.

**Fix:** Use `minHeight` (already present at line 90) as the primary sizing mechanism, and remove or comment `numberOfLines`.

### WR-05 — `sceneOffsetsRef` never cleans up removed scenes

`components/editor/StoryManuscriptScreen.tsx:37` uses `sceneOffsetsRef.current[sceneId] = y` in `handleMeasureScene` but never removes entries when scenes are deleted. This is a memory leak (though small — scenes are not typically created/destroyed in large numbers during a session).

**Impact:** Marginal. The ref object will accumulate entries over long editing sessions.

**Fix:** Pass a list of current scene IDs and purge stale keys in a cleanup callback.

### WR-06 — Test: duplicate background collapse tests implementation detail

`__tests__/unit/lib/editor-scene-draft.test.ts:84-107` tests that duplicate background blocks are collapsed. This tests an internal detail of `normalizeEditorTimeline` rather than a behavioral contract. If the dedup logic changes, this test breaks even if the end-user behavior is preserved.

**Impact:** Brittle test — refactoring `normalizeEditorTimeline` requires updating this test.

**Fix:** Test the output behavior (e.g., "scene draft always has exactly 1 background block") rather than the intermediate step.

### WR-07 — Test imports deprecated `Story` from `@/lib/types`

`__tests__/unit/lib/bundled-story-sync.test.ts:2`:
```ts
import type { Story } from '@/lib/types';
```
This is the legacy re-export path. The test file is testing bundled story sync which uses the legacy `Story` type — but the import should still point to the canonical source.

**Impact:** Blocks removal of `lib/types.ts`.

**Fix:** `import type { Story } from '@/lib/scene-operations'` — same type, direct path.

### WR-08 — `story-reader-platform.ts` lacks parameterization

`lib/story-reader-platform.ts` returns a single hardcoded style object per function. Unlike `button-platform.ts` which accepts a `platformOS` parameter, the story reader platform helpers ignore the platform and return constants. This makes them effectively identity functions.

**Impact:** Unnecessary indirection — callers could inline the constants.

**Fix:** Either accept platform parameters and conditionally return theme-aware values, or remove the module and inline the styles.

### WR-09 — `PlayMode.tsx` music `useEffect` may miss edge cases

`components/editor/PlayMode.tsx` uses `useEffect` on `sceneState.musicTrackId` changes to trigger music playback. If `musicTrackId` changes to `null` (stop music), the effect fires cleanup but may not handle the case where `musicTrackId` changes from one track ID to a different track ID within the same render batch.

**Impact:** The `crossFade` mechanism in `AudioPlayerService` handles this, but the orchestrator in `PlayMode` should be explicit about stop-before-play ordering.

**Fix:** Verify the `useEffect` dependency array includes both `musicTrackId` and `musicPlaying` flags, and that the cleanup function stops the previous track before the new effect callback starts the new track.

---

## Info

### IN-01 — Test factory helper pattern is consistent

All test files use factory functions (`makeSceneRecord`, `makeStory`, `makeTimelineStep`) with `overrides` parameters. This is a maintainable pattern that keeps tests readable and DRY. The `...overrides` spread at the end allows test-specific overrides without boilerplate.

### IN-02 — `condition-utils.test.ts` has exhaustive operator coverage

All 8 operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `has`, `not_has`) are tested with true/false cases plus AND logic. Total: 24 assertions across 15 tests. Good coverage.

### IN-03 — `block-validation.test.ts` is the most thorough test file

385 lines covering all 11 block types with both `isBlockComplete` and `getBlockEmptyFields`. Edge cases covered: whitespace-only text, partially empty dialogue entries, `action=stop` without assetId.

### IN-04 — oklch color space used consistently

All 66 color tokens in `theme-colors.json` use `oklch(L% C H)` notation except `rgba()` for hover/overlay/scrim/dialogue-bg tokens and hex for `name-bg`/`name-text`/`choice-border`. The hybrid approach is pragmatic — opaque/solid colors use oklch, alpha-blended colors use rgba.

### IN-05 — Typo: `charakters` in asset-resolver comments

`lib/asset-resolver.ts:60-65` uses `assets/charakters/` in the key names (German spelling) while the directory is likely `assets/characters/`. The keys work because they're internal identifiers, but this is confusing.

### IN-06 — `audio-web-source.ts` is a focused module

`getBrowserSafeAudioUri` correctly rejects `file://` URIs and allows only `https?://`, `blob:`, and `data:audio/`. This is correct for web security. The companion `resolvePlayableAssetUri` in `asset-resolver.ts` handles the cross-platform bridge.

### IN-07 — Mixed module system: CJS in ESM project

`lib/build-tailwind-theme-colors.js` uses `module.exports` (CJS) while the rest of the project uses ES modules (`import`/`export`). This works because Tailwind config (`tailwind.config.js`) is also CJS, but limits tree-shaking.

### IN-08 — Overlap between `react-native-web-interop.ts` and `button-platform.ts`

Both modules export a `shouldUseNativeDriver` variant:
- `lib/button-platform.ts`: `shouldUseNativeDriver(platformOS)`
- `lib/react-native-web-interop.ts`: `shouldUseNativeDriverForPlatform(platformOS)`

These are conceptually identical. Could be consolidated.

### IN-09 — `timeline-item-layout.ts` and `timeline-sortable.ts` are thin wrappers

Each is ~10-14 lines and could reasonably be inlined into their single consumer. Keeping them separate provides stable import boundaries for testing.

### IN-10 — `StoryManuscriptScreen` baseline uses `JSON.stringify` for dirty detection

`components/editor/StoryManuscriptScreen.tsx:43` uses `JSON.stringify(baseManuscript)` as a memo key and dirty-comparison snapshot. This is O(n) serialization on every render cycle that touches `draft`. For typical manuscript sizes (<1000 blocks) this is fine, but worth noting for scalability.

---

## Summary by Area

| Area | Files | CR | WR | IN | Notes |
|------|-------|----|----|----|-------|
| Stores (3) | 3 | 0 | 0 | 0 | Clean |
| Engine/lib (20) | 20 | 2 | 3 | 4 | CR-04 (manuscript save), CR-06 (nativewind) |
| Components (25) | 25 | 1 | 3 | 2 | CR-01 (reader-platform colors) |
| Config/Constants (5) | 5 | 2 | 0 | 1 | CR-05 (theme-colors type mismatch) |
| App pages (6) | 6 | 2 | 0 | 0 | CR-02, CR-03 (import paths) |
| Tests (32) | 32 | 0 | 2 | 3 | WR-06, WR-07 |
| Total | 85 | 6 | 9 | 10 | 25 total findings |

## Verdict

**Condition: PASS with actionable items.** The codebase has no show-stopping bugs — the critical findings are primarily about theme/import consistency rather than runtime crashes or data corruption (with the partial exception of CR-04). The 6 critical items should be addressed before closing the phase to fully satisfy the Phase 08 scope (color tokenization, import path cleanup). Warnings are safe to defer to Phase 09. Test infrastructure is solid — all 32 test files use consistent patterns and factory helpers.
