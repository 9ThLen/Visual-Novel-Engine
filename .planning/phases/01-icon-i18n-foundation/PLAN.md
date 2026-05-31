# Phase 01 — Icon And Copy Foundation

## Objective

Remove the highest-visibility UI inconsistency: emoji icons and hardcoded visible strings in primary app surfaces.

## Source Findings

- `standalone-UI-REVIEW.md` Visuals: 30+ emoji used as primary icons.
- `standalone-UI-REVIEW.md` Copywriting: 25+ hardcoded strings bypass i18n.
- `UI-SPEC.md` P0 Visual Consistency and P0 Copy And I18n.

## Scope

Update these first, using the actual files currently present in the repo:

- `components/ui/icon-symbol.tsx`
- `components/WebSidebar.tsx`
- `components/ReaderMenu.tsx`
- `components/editor/TimelinePanel.tsx`
- `components/editor/BlockLibraryPanel.tsx`
- `components/editor/PropertiesPanel.tsx`
- `components/editor/SceneComposer.tsx`
- `components/editor/modals/AssetPicker.tsx`
- `components/editor/modals/SaveSceneDialog.tsx`
- `app/editor.tsx`
- `app/tabs/index.tsx`
- `app/save-load.tsx`
- `app/reader.tsx`
- `lib/translations.ts`

Explicitly defer the large Lego-editor emoji cleanup to a later slice unless a touched file requires it:

- `components/lego-editor/*`
- `lib/engine/types.ts`

## Implementation Plan

1. Expand `IconSymbol` mapping using existing `@expo/vector-icons/MaterialIcons`.
2. Replace emoji primary icons in navigation, reader menu, timeline empty state, block library headers, properties actions, asset tabs, save/load actions, and reader controls.
3. Add `accessibilityLabel` to icon-only actions.
4. Move touched hardcoded labels into `lib/translations.ts`.
5. Replace duplicate labels with existing tokens when semantically correct.
6. Add missing specific tokens for `document`, `flow`, `manuscript`, `addTag`, `spriteSlot`, and editor save states.

## Acceptance Criteria

- No emoji remains in primary nav, toolbar, menu, destructive action, asset tabs, reader controls, or editor command controls touched by this phase.
- Touched visible strings use `t()`.
- Accessibility labels are semantic, not borrowed from unrelated tokens.
- No behavior changes to scene/core logic.
- Remaining emoji in deferred Lego-editor metadata is documented as out of scope, not accidentally missed.

## Verification

- `corepack pnpm run check`
- `corepack pnpm run test -- __tests__/unit/lib/translations.test.ts`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- Manual mobile review: icon rendering, labels, touch targets.

## Execution Result

Status: complete.

- Added shared MaterialIcons mapping and `BlockType` icon helper.
- Replaced emoji primary icons in scoped nav, reader menu, timeline, block library, properties, asset picker, save/load, and reader controls.
- Moved touched visible strings into `lib/translations.ts` for EN/UK/PL.
- Deferred `components/lego-editor/*` and `lib/engine/types.ts` emoji metadata per scope.

Verified:

- `corepack pnpm run check`
- `corepack pnpm run test -- __tests__/unit/lib/translations.test.ts`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- `git diff --check -- <phase files>`

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-code-review`
- `gsd-ui-review`
