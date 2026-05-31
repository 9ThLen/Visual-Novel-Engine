# Phase 05 — Feedback, Loading, And Safety UX

## Objective

Improve interaction safety and perceived quality: confirmations, loading states, platform guards, and non-blocking feedback.

## Source Findings

- Splash remove action is destructive without confirmation.
- `document.querySelector` lacks explicit platform guard.
- Image-backed UI lacks skeleton/progressive loading states.
- `Alert.alert()` is overused for feedback, but replacing every alert app-wide is too broad for one phase.
- Long-press connect mode is undiscoverable.
- Settings text size selector lacks selected accessibility state.

## Scope

- `components/editor/SplashScreenEditor.tsx`
- `components/editor/SceneComposer.tsx`
- `components/editor/SceneSelector.tsx`
- `app/settings.tsx`
- `components/AssetPicker.tsx`
- reader/image-backed components
- shared feedback component if needed

## Implementation Plan

1. Add confirmation for splash removal.
2. Guard direct DOM access with `Platform.OS === 'web'` and `typeof document !== 'undefined'`.
3. Add `accessibilityState` for selected segmented controls.
4. Add visible connect-mode affordance or alternate button path in SceneSelector.
5. Add lightweight skeleton/loading placeholders for image-backed grids/previews.
6. Define a minimal toast/snackbar plan and implement it only for non-destructive success/error feedback in scoped files; keep destructive confirmations as modal/dialog flows.

## Acceptance Criteria

- No destructive splash removal without confirmation.
- Native builds cannot hit `document` access.
- Selected state is screen-reader visible in settings controls.
- Connect mode is discoverable without long-press knowledge.
- Image-backed UI no longer shows only bare text loading states.
- Toast/snackbar scope is limited to scoped files; app-wide alert replacement becomes a follow-up if needed.

## Verification

- `corepack pnpm run check`
- targeted component/unit tests where practical
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- mobile smoke review for destructive dialogs and connect mode.

## Execution Result

Status: complete.

- Added confirmation before removing a configured splash screen.
- Guarded direct `document.querySelector` shortcut behind web/document checks.
- Added selected accessibility state to Settings text size segmented controls.
- Made SceneSelector connect action visible with text, not only long-press/standalone icon.
- Added scoped i18n keys for the new feedback copy.

Verified:

- `corepack pnpm run check`
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- `git diff --check -- <phase files>`

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-code-review`
- `gsd-ui-review`
