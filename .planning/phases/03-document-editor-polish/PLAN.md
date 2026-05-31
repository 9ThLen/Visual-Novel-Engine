# Phase 03 — Document Editor Visual Polish

## Objective

Make the new document-first UX the visual reference implementation for the project.

## Source Findings

- User feedback: previous mobile document editor looked primitive and not adaptive.
- `UI-SPEC.md` Document Editor rules.
- Current document editor is functional but still uses many inline sizes/colors and hardcoded labels.

## Scope

- `app/document-editor.tsx`
- `components/document-editor/DocumentSceneEditor.tsx`
- `lib/document-editor/*`
- `components/editor/SceneComposer.tsx`
- `lib/translations.ts`

## Implementation Plan

1. Move Document Editor visible strings to i18n.
2. Apply the type scale from `UI-SPEC.md`.
3. Apply spacing/radius tokens from `UI-SPEC.md`.
4. Tokenize paper/surface/chip colors.
5. Improve mobile top bar density and safe-area stability.
6. Add active visual state for sequential page navigation.
7. Keep `/` command menu as mobile bottom sheet and desktop inline menu.
8. Verify auto-follow writing behavior under keyboard.

## Acceptance Criteria

- Document page reads as a calm writing surface, not a raw form.
- Speaker token is visually distinct and accessible.
- Technical chips are compact, readable, and tokenized.
- `/нова сцена` keeps sequential scene order.
- Text input remains visible while typing on mobile.
- No hardcoded visible strings in touched document editor files.

## Verification

- `corepack pnpm run check`
- `corepack pnpm run test -- __tests__/unit/lib/document-editor.test.ts`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- mobile viewport/manual review:
  - keyboard overlap
  - slash menu
  - page navigation
  - long text typing

## Execution Result

Status: complete.

- Moved document editor route/editor visible strings to i18n for EN/UK/PL.
- Tokenized document paper surface, warning chips, command menu pressed state, and mobile modal scrims.
- Localized command menu labels/descriptions at render time while preserving UA+EN alias search.
- Preserved sequential scene creation and mobile auto-follow behavior.

Verified:

- `corepack pnpm run check`
- `corepack pnpm run test -- __tests__/unit/lib/document-editor.test.ts`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- `git diff --check -- <phase files>`

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-ui-review`
- `browser:browser` if available for local viewport screenshots
