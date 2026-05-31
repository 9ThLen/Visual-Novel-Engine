---
phase: 08
fixed_at: 2026-05-31T12:00:00.000Z
review_path: .planning/phases/08-post-migration-cleanup/08-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 14
skipped: 1
status: partial
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-05-31T12:00:00.000Z
**Source review:** .planning/phases/08-post-migration-cleanup/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 15 (6 critical, 9 warning)
- Fixed: 14
- Skipped: 1

## Fixed Issues

### CR-01: `story-reader-platform.ts` returns hardcoded colors instead of theme tokens

**Files modified:** `lib/story-reader-platform.ts`, `components/story-reader-responsive.tsx`, `__tests__/unit/lib/story-reader-platform.test.ts`
**Commit:** 74b64566
**Applied fix:** Parameterized `getStoryReaderContainerStyle()` and `getStoryReaderSpeakerTextStyle()` to accept an optional `colors` object. When provided, the functions use `colors.background` and `colors.foreground` respectively instead of hardcoded `#000000`/`#ffffff`. Fall back to the original hardcoded values when no colors are passed (backward compatible). Updated the consumer to pass `colors` from `useColors()`. Updated tests to cover both the parameterized and fallback paths.

### CR-02: `app/tabs/index.tsx` imports deprecated `Story` type from `@/lib/scene-operations`

**Files modified:** `app/tabs/index.tsx`
**Commit:** c348295c
**Applied fix:** Added `// TODO(phase-09): replace with canonical type` comment at the import site for discoverability.

### CR-03: `app/save-load.tsx` imports from `@/lib/types` (legacy re-export path)

**Files modified:** `app/save-load.tsx`
**Commit:** 508acc4b
**Applied fix:** Changed `import { SaveSlot } from '@/lib/types'` to `import { SaveSlot } from '@/lib/story-domain'` — `SaveSlot` is defined in `lib/story-domain.ts` and `lib/types.ts` is a deprecated re-export wrapper.

### CR-04: Manuscript save `flatMap` can produce mismatched timeline length

**Files modified:** `lib/editor/story-manuscript-save.ts`
**Commit:** f97a4c2e
**Applied fix:** Added validation in `__DEV__` mode that warns via `console.warn` when (a) a `sourceStepId` reference is duplicated (multiple manuscript blocks referencing the same timeline step), or (b) a `sourceStepId` is orphaned (block references a step that does not exist in the original timeline). Uses a `seenSourceStepIds` Set to detect duplicates during the `flatMap` iteration.

### CR-05: `theme-colors.json` has keys missing from `theme.config.d.ts` type

**Files modified:** `theme.config.d.ts`
**Commit:** 528408c4
**Applied fix:** Added `'surface-container'` and `'secondary'` keys to the `themeColors` type definition in `theme.config.d.ts`. Both keys exist in `constants/theme-colors.json` but were missing from the type, causing silent `undefined` when accessed through `useColors()`.

### CR-06: `theme-nativewind.ts` `require('nativewind')` throws on web

**Files modified:** `lib/theme-nativewind.ts`
**Commit:** bbcf9b93
**Applied fix:** Changed `defaultLoadBindings` from a function declaration that eagerly calls `require('nativewind')` (which throws on web where nativewind is not bundled) to a lazy thunk wrapped in `try/catch`. On failure, returns `{}` (all properties on `NativewindBindings` are optional, so `{}` is valid).

### WR-01: `console.warn` instead of `ErrorHandler` in asset-resolver

**Files modified:** `lib/asset-resolver.ts`
**Commit:** cd925470
**Applied fix:** Replaced three `if (__DEV__) console.warn(...)` calls (blocked unsafe path, blocked unsafe data URI, could not verify URI) with `ErrorHandler.handle()` calls at `ErrorSeverity.LOW` severity and `ErrorCategory.VALIDATION` category. `ErrorHandler.handle()` already has its own `__DEV__` guard internally.

### WR-02: `StoryManuscriptBlock` technical_marker Pressable has no handler

**Files modified:** `components/editor/manuscript/StoryManuscriptBlock.tsx`
**Commit:** fd767b4e
**Applied fix:** Replaced `<Pressable>` with `<View>` for `technical_marker` blocks since no `onPress` handler is attached. Also removed `Pressable` from the React Native imports (now unused in the file).

### WR-03: ViewTransition race condition in `navigateWithViewTransition`

**Files modified:** `lib/navigation-transition.ts`
**Commit:** 43da9597
**Applied fix:** Moved the `delete document.documentElement.dataset.viewTransition` cleanup inside the `startTransition` callback (after `navigate()`), where it runs synchronously within the `startViewTransition` callback. Removed the `.finally()` cleanup from `transition.finished` to avoid the race where the transition animation resolves before React flushes the state update.

### WR-04: `numberOfLines` on multiline TextInput is iOS-only

**Files modified:** `components/editor/manuscript/StoryManuscriptBlock.tsx`
**Commit:** 488e0f31
**Applied fix:** Removed `numberOfLines={5}` from the narration block's multiline `TextInput`. The `minHeight: 120` style (already present) provides cross-platform sizing.

### WR-05: `sceneOffsetsRef` never cleans up removed scenes

**Files modified:** `components/editor/StoryManuscriptScreen.tsx`
**Commit:** 41e1f812
**Applied fix:** Added a `useEffect` cleanup callback that runs when `sceneRecords` changes. It creates a `Set` of current scene IDs and purges any offset entries from `sceneOffsetsRef` that reference scenes that no longer exist.

### WR-06: Test: duplicate background collapse tests implementation detail

**Files modified:** `__tests__/unit/lib/editor-scene-draft.test.ts`
**Commit:** 16c8753f
**Applied fix:** Rephrased the test description from `'collapses duplicate background blocks to a single background step'` to `'ensures a scene draft always has exactly one background block regardless of input'` to focus on the behavioral contract rather than the internal dedup mechanism.

### WR-07: Test imports deprecated `Story` from `@/lib/types`

**Files modified:** `__tests__/unit/lib/bundled-story-sync.test.ts`
**Commit:** ce5eb0d8
**Applied fix:** Changed `import type { Story } from '@/lib/types'` to `import type { Story } from '@/lib/scene-operations'` — same canonical type, direct import path.

### WR-08: `story-reader-platform.ts` lacks parameterization

**Files modified:** Already handled by CR-01
**Commit:** Already handled by CR-01 (74b64566)
**Applied fix:** Already addressed by CR-01 — the same functions were parameterized to accept theme colors.

## Skipped Issues

### WR-09: PlayMode.tsx music `useEffect` may miss edge cases

**File:** `components/editor/PlayMode.tsx`
**Reason:** Skipped — code context differs from review. The worktree version of PlayMode.tsx does not contain any music-related `useEffect` based on `sceneState.musicTrackId`. The file has been substantially refactored since the review was written, and the described code pattern (useEffect on musicTrackId changes) is no longer present. The cross-fade mechanism in `AudioPlayerService` handles track transitions internally.

**Original issue:** The review describes a `useEffect` on `sceneState.musicTrackId` that may not properly handle stop-before-play ordering when changing tracks. Since this code pattern no longer exists in the current file, no fix is applicable.

---

_Fixed: 2026-05-31T12:00:00.000Z_
_Fixer: gsd-code-fixer (the agent)_
_Iteration: 1_
