# Phase 02 — Theme Token Hardening

## Objective

Remove hardcoded color drift and make required palette tokens guaranteed.

## Source Findings

- `SceneSelector.tsx` category hex colors.
- `AtomBlockComponent.tsx` hardcoded atom colors.
- repeated `colors['text-inverse'] ?? '#fff'`.
- repeated `colors.backdrop ?? 'rgba(...)'`.
- `shadowColor: '#000'` patterns.

## Scope

- `constants/theme-colors.json`
- `lib/_core/theme.ts`
- `theme.config.d.ts`
- `lib/theme-variables.ts`
- `lib/theme-nativewind.ts`
- touched components from audit:
  - `SceneSelector.tsx`
  - `AtomBlockComponent.tsx`
  - `ConfirmDialog.tsx`
  - `DialogueHistory.tsx`
  - `AssetPicker.tsx`
  - `StoryFlowScreen.tsx`

## Implementation Plan

1. Verify runtime palette includes guaranteed `foreground-inverse`, `backdrop`, `warning`, `error`, and shadow tokens.
2. Add typed aliases only if needed; prefer existing token names.
3. Replace category colors with `lego-*` or semantic tokens.
4. Replace hardcoded shadow colors with theme shadow token pattern.
5. Remove fallback chains where tokens are guaranteed.
6. Leave CharacterCreator swatch tokenization to Phase 04 so sprite UX and character styling are fixed together.

## Acceptance Criteria

- No new hardcoded hex/rgb in touched components.
- Touched destructive/warning states use semantic tokens.
- `text-inverse`/`foreground-inverse` usage is consistent.
- TypeScript guarantees required palette keys.
- CharacterCreator palette remains explicitly out of scope for this phase and is covered by Phase 04.

## Verification

- `corepack pnpm run check`
- existing theme tests
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- light/dark smoke review on key screens.

## Execution Result

Status: complete.

- Added guaranteed `shadow-color` token to theme config/runtime palette.
- Made `backdrop`, `text-inverse`, `foreground-inverse`, `surface-container`, and shadow color available without component fallbacks.
- Replaced scoped hardcoded category/atom/shadow/overlay colors with semantic or Lego tokens.
- Left CharacterCreator palette out of scope for Phase 04 as planned.

Verified:

- `corepack pnpm run check`
- `corepack pnpm run test -- __tests__/unit/lib/theme-nativewind.test.ts __tests__/unit/lib/theme-variables.test.ts __tests__/unit/lib/theme-runtime.test.ts`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- `git diff --check -- <phase files>`

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-add-tests`
- `gsd-code-review`
