# Phase 04 — Character Creator And Sprite UX

## Objective

Fix the Character Creator defects that make sprite display/picker behavior misleading.

## Source Findings

- `CharacterCreator.tsx`: `spriteIds` is `{}`.
- Sprite slot labels use wrong accessibility token.
- Sprite picker affordance appears incomplete.
- Character color swatches are hardcoded.
- Phase 02 explicitly defers CharacterCreator palette cleanup to this phase.

## Scope

- `components/editor/modals/CharacterCreator.tsx`
- related character/sprite types and helpers
- `lib/translations.ts`
- theme tokens if swatches need named values

## Implementation Plan

1. Inspect character and sprite data model.
2. Replace empty `spriteIds` lookup with real sprite name resolution.
3. If picker implementation exists, connect it; if not, disable picker action with clear copy.
4. Fix sprite slot accessibility labels.
5. Tokenize character color swatches or route through a shared theme palette after sprite behavior is fixed.
6. Add focused tests for sprite name resolution if pure helpers exist.

## Acceptance Criteria

- Sprite slots never show generic `"Sprite"` when a real sprite name is available.
- Incomplete picker actions are not exposed as working controls.
- Accessibility labels describe sprite slots correctly.
- Character color options are theme-derived.
- No duplicate CharacterCreator color work remains in Phase 02.

## Verification

- `corepack pnpm run check`
- targeted tests if helper extracted
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- manual create/edit character smoke review.

## Execution Result

Status: complete.

- Replaced empty `spriteIds` lookup with real `editCharacter.sprites` name resolution.
- Preserved existing sprite name/uri/createdAt during save instead of rewriting every sprite as a generic slot.
- Disabled incomplete sprite picker affordance with explicit unavailable copy and semantic accessibility labels.
- Moved CharacterCreator visible strings to i18n for EN/UK/PL.
- Replaced hardcoded swatches with theme-derived color token values.

Verified:

- `corepack pnpm run check`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- `git diff --check -- <phase files>`

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-add-tests`
- `gsd-code-review`
