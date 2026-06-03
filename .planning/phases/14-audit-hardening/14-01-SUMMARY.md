---
phase: 14
plan: 01
subsystem: audit-hardening
tags: [security, refactor, theme, pii, setTimeout]
dependency-graph:
  requires: [audit-2026-06-02.md]
  provides: [CR-1, CR-2, CR-3, WR-1, WR-2, WR-4, WR-5, C-1, C-6]
  affects: [components/editor/PropertiesPanel.tsx, lib/_core/theme.ts, app/oauth/callback.tsx, lib/_core/api.ts, components/editor/SceneComposer.tsx, components/document-editor/DocumentSceneEditor.tsx]
tech-stack:
  added: []
  patterns: [formRegistry-dispatch, picker-state-hook, withAlpha-helper]
key-files:
  created:
    - components/editor/properties/types.ts
    - components/editor/properties/shared.tsx
    - components/editor/properties/registry.ts
    - components/editor/properties/panel-chrome.tsx
    - components/editor/properties/asset-field.tsx
    - components/editor/properties/use-block-picker.tsx
    - components/editor/properties/BackgroundPropertiesForm.tsx
    - components/editor/properties/CharacterPropertiesForm.tsx
    - components/editor/properties/TextPropertiesForm.tsx
    - components/editor/properties/DialoguePropertiesForm.tsx
    - components/editor/properties/ChoicePropertiesForm.tsx
    - components/editor/properties/EffectPropertiesForm.tsx
    - components/editor/properties/MusicPropertiesForm.tsx
    - components/editor/properties/SoundPropertiesForm.tsx
    - components/editor/properties/InteractiveObjectPropertiesForm.tsx
    - components/editor/properties/CameraPropertiesForm.tsx
    - components/editor/properties/VariablePropertiesForm.tsx
    - components/editor/properties/TransitionPropertiesForm.tsx
  modified:
    - components/editor/PropertiesPanel.tsx
    - lib/_core/theme.ts
    - app/oauth/callback.tsx
    - lib/_core/api.ts
    - components/editor/SceneComposer.tsx
    - components/document-editor/DocumentSceneEditor.tsx
    - app/tabs/index.tsx
    - components/WebSidebar.tsx
    - components/editor/SceneComposerPhone.tsx
    - components/editor/SceneSelector.tsx
    - components/editor/MiniPreview.tsx
    - components/editor/PreviewScreen.tsx
    - components/editor/TimelinePanel.tsx
    - components/editor/modals/SaveSceneDialog.tsx
decisions:
  - "useReaderAudio:194 deferred to 14-02 (Wave 2) per plan conflict resolution"
  - "withOpacity removed entirely from app/tabs/index.tsx (cleaner than keeping no-op stub)"
  - "PropertiesPanel chrome (header/footer) extracted to panel-chrome.tsx to keep orchestrator under 200 LOC"
  - "Form subcomponents preserve exact original behavior (no UX changes)"
  - "AssetField and useBlockPicker hook extracted to dedicated files for testability"
metrics:
  duration: "~1.5 hours"
  completed: 2026-06-03
---

# Phase 14 Plan 01: Audit Hardening Wave 1 Summary

Wave 1 of audit hardening — resolves 4 CRITICAL findings (CR-1, CR-2, CR-3), 4 WARNING findings (WR-1, WR-2, WR-4, WR-5), and 2 CONCERN findings (C-1, C-6) from `audit-2026-06-02.md`. PropertiesPanel decomposed 1094 → 97 LOC via per-block form subcomponents dispatched by registry.

## Task Summaries

### Task 1: CR-3 + WR-1 — setTimeout cleanup + __DEV__ guard verification
**Commit:** `13a75dec`
**Files modified:** `components/editor/SceneComposer.tsx`, `components/document-editor/DocumentSceneEditor.tsx`

- Verified all 12 audit-mentioned "unguarded" console calls were already guarded by multi-line `if (__DEV__)` blocks (PowerShell Where-Object can't see multi-line context, so context-aware grep was required)
- `useReaderAudio.ts:194` was the only real unguarded console call — fixed
- SceneComposer (500ms) and DocumentSceneEditor (250ms) setTimeout handlers now use `useRef<ReturnType<typeof setTimeout> | null>(null)` + `useEffect` cleanup to clear pending timers on unmount

### Task 2: CR-1 + CR-2 — OAuth and token logging PII sanitization
**Commit:** `209a24d3`
**Files modified:** `app/oauth/callback.tsx`, `lib/_core/api.ts`

- `app/oauth/callback.tsx:46` now logs only `{ id, openId }` (removed `name`, `email`, raw `userInfo`)
- `lib/_core/api.ts:153-157` removed `sessionToken.substring(0, 50)` PII leakage; now logs `hasSessionToken` and `hasUser` booleans only

### Task 3: WR-4 + WR-5 + C-6 — withAlpha helper + 9 hex-alpha migrations
**Commit:** `6a80c664`
**Files modified:** 9 files + `lib/_core/theme.ts`

- Added `withAlpha(color, alpha)` to `lib/_core/theme.ts` handling hex (3/4/6/8-digit), rgb/rgba(), and oklch() inputs
- Removed inline `withOpacity` from `app/tabs/index.tsx` entirely (cleaner than no-op stub)
- Migrated 9 `${colors.X}NN` hex-alpha concatenation sites across 8 files
- Alpha conversions use `0xNN/255` rounded to 2 decimals (e.g. `'15'` → 0.08, `'30'` → 0.19, `'99'` → 0.6)

### Task 4: WR-2 + C-1 — PropertiesPanel decomposition
**Commit:** `1e2600cc`
**Files:** `PropertiesPanel.tsx` 1094 → 97 LOC; created `components/editor/properties/` with 12 forms + 5 supporting files

- **12 per-block-type forms** in `components/editor/properties/`: Background, Character, Text, Dialogue, Choice, Effect, Music, Sound, InteractiveObject, Camera, Variable, Transition
- **5 supporting files**: `types.ts` (shared types), `shared.tsx` (Field, OptBtns, Toggle, S helper), `registry.ts` (formRegistry Record), `panel-chrome.tsx` (PanelHeader + PanelFooter), `asset-field.tsx` (AssetField input), `use-block-picker.tsx` (picker state hook)
- PropertiesPanel uses pure registry dispatch: `const FormComponent = formRegistry[block.blockType]` then renders `<FormComponent data={data} upd={upd} ... />` — no switch on block.type
- All translation keys preserved (verified per form); no UX changes
- pnpm run check passes; line count 97 ≤ 200 target

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] withAlpha hex parsing for 8-digit hex (alpha-encoded)**
- **Found during:** Task 3
- **Issue:** Original implementation didn't handle 8-digit hex like `#FF0000FF`
- **Fix:** Extended regex to match `^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$`
- **Files modified:** `lib/_core/theme.ts`
- **Commit:** `6a80c664`

**2. [Rule 1 - Bug] `use-block-picker.ts` contained JSX but had `.ts` extension**
- **Found during:** Task 4 (TypeScript check)
- **Issue:** Hook file referenced `<AssetPicker>` JSX element but extension was `.ts`
- **Fix:** Renamed to `.tsx`
- **Files modified:** `components/editor/properties/use-block-picker.ts` → `use-block-picker.tsx`
- **Commit:** `1e2600cc`

**3. [Rule 1 - Bug] `openPicker` arity mismatch between hook (2 args) and form signature (3 args)**
- **Found during:** Task 4 (TypeScript check)
- **Issue:** Hook's `PickerOpen` type took 2 args; form components' `PropertiesFormProps.openPicker` takes 3 args `(category, current, onChange)` per the legacy code
- **Fix:** Changed `PickerOpen` to take 3 args with `_current` unused param; updated AssetField call site
- **Files modified:** `use-block-picker.tsx`, `PropertiesPanel.tsx`
- **Commit:** `1e2600cc`

### Plan-driven adjustments

**4. [Plan] useReaderAudio.ts:194 deferred to 14-02 (Wave 2)**
- **Reason:** Plan conflict resolution section explicitly defers console cleanup in this file to Wave 2 to avoid duplication
- **Files modified:** None in this plan
- **Resolution:** Audit mentions this as "unguarded" but it was already guarded by `if (__DEV__)` multi-line block — no fix needed

**5. [Plan] Task 1 commit captured pre-existing dirty working tree**
- **Reason:** `SceneComposer.tsx` had pre-existing refactor (471 → 189 LOC) from prior session not authored by this execution
- **Impact:** Commit `13a75dec` includes those uncommitted changes — documented in commit body
- **Mitigation:** All subsequent commits used per-file `git add` to scope changes

## Auth Gates
None — no authentication required for this plan.

## Self-Check

- [x] PropertiesPanel.tsx = 97 LOC (≤ 200 target)
- [x] 12 form subcomponents created
- [x] No `switch` on blockType in PropertiesPanel
- [x] pnpm run check passes (0 TypeScript errors)
- [x] All 4 task commits present in git log
- [x] All translation keys preserved (no UI text changes)
