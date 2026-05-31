# Phase 06 — Type, Spacing, And Radius Convergence

## Objective

Apply the UI-SPEC type, spacing, and radius constraints to high-traffic surfaces without a risky full-app rewrite.

## Source Findings

- 18 unique font sizes.
- 20+ spacing values.
- many border radii.
- tiny `fontSize` 8-10 in editor/flow panels.

## Scope

High-traffic/touched surfaces only:

- `components/document-editor/DocumentSceneEditor.tsx`
- `components/editor/SceneComposer.tsx`
- `components/editor/MiniPreview.tsx`
- `components/editor/StoryFlowScreen.tsx`
- `components/editor/TimelinePanel.tsx`
- shared UI constants file if introduced

## Implementation Plan

1. Introduce local/shared constants for type, spacing, and radius if no existing helper fits.
2. Replace `fontSize` below 11 in scoped files.
3. Normalize font weights to numeric strings.
4. Add lineHeight to touched text styles.
5. Normalize common margins/paddings to `4, 8, 12, 16, 24, 32, 48`.
6. Normalize radii to `6, 8, 12, 16, 999`.
7. Avoid broad mechanical edits outside scope.

## Acceptance Criteria

- Scoped files comply with `UI-SPEC.md` scales.
- No touched text uses `fontSize < 11`.
- No visible layout regression on mobile or desktop.
- No nested-card design introduced.

## Verification

- `corepack pnpm run check`
- relevant layout tests if existing
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- final `gsd-ui-review` comparing against `standalone-UI-REVIEW.md`.

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-ui-review`
- `gsd-audit-fix`

## Execution Result

Status: completed.

Implemented:

- Removed scoped `fontSize < 11` usage from `MiniPreview`, `StoryFlowScreen`, and `TimelinePanel`.
- Added `lineHeight` to touched compact labels and preview metadata.
- Normalized touched compact chip padding and radii to the approved spacing/radius scale.
- Replaced the touched MiniPreview secondary color fallback with the guaranteed theme token.

Verification:

- `rg` check for scoped `fontSize < 11`, negative letter spacing, and oversized radii: passed.
- `corepack pnpm run check`: passed.
- `git diff --check` on scoped files: passed.
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`: passed.
