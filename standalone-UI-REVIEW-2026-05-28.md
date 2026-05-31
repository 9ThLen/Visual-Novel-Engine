# UI Audit: Visual Novel Engine Post-Change Review

Date: 2026-05-28
Baseline: `UI-SPEC.md` + previous `standalone-UI-REVIEW.md`
Screenshots: not captured
Audit type: code-only, 6-pillar review after UI remediation phases

## Score Summary

Overall: 18/24

| Pillar | Score |
|--------|-------|
| Copywriting | 3/4 |
| Visuals | 3/4 |
| Color | 3/4 |
| Typography | 3/4 |
| Spacing | 3/4 |
| Experience Design | 3/4 |

## 1. Copywriting - 3/4

Improved:

- Document Editor copy now uses translation keys for scene counters, command menu, page navigation, placeholders, and technical panels.
- Character Creator, Scene Composer, Scene Selector connect copy, and Splash removal confirmation gained scoped i18n coverage.
- Ukrainian/English/Polish command labels and descriptions exist for the new document-first flow.

Still open:

- Legacy/editor surfaces still contain hardcoded labels, for example `InteractiveObjectsEditor.tsx`, `StoryManuscriptScreen.tsx`, `SceneEditorForm.tsx`, `PlayMode.tsx`, and `SceneManager.tsx`.
- Some command/action labels remain inline in older components: `+ Add Choice`, `Back`, `Play`, `Remove`, `Saved`.
- Accessibility labels are better in touched files, but legacy components still need a semantic label pass.

## 2. Visuals - 3/4

Improved:

- Primary navigation/menu/timeline/properties surfaces moved away from emoji-as-primary-icons in the first remediation slice.
- `IconSymbol` coverage expanded and block icons now use semantic icon mapping in the touched timeline/editor surfaces.
- Document Editor now has the intended paper/page mental model with sequential scene pages and mobile sheet behavior.

Still open:

- Emoji remain in multiple non-remediated surfaces: `settings.tsx`, `MiniPreview.tsx`, `SceneSelector.tsx`, `StoryFlowScreen.tsx`, `LegoBlockLibrary.tsx`, `LegoFlowWorkspace.tsx`, `SceneEditorHeader.tsx`.
- `MiniPreview` is still visually cramped at 120px height.
- Image loading still mostly uses text fallback rather than skeleton/progressive placeholders.

## 3. Color - 3/4

Improved:

- Theme palette now guarantees important runtime tokens including inverse/backdrop/surface/shadow-related tokens.
- Touched files removed several defensive fallbacks and moved category/swatch colors toward theme-derived values.
- `StoryFlowScreen` and other touched surfaces use tokenized shadow color.

Still open:

- Legacy Lego files still contain many hardcoded hex/rgba colors.
- Some active UI files still have hardcoded fallback patterns, for example `WebSidebar.tsx`, `ReaderMenu.tsx`, `PreviewScreen.tsx`, `story-reader-responsive.tsx`, `Button.tsx`.
- `lib/engine/types.ts` still stores block metadata colors/icons as hardcoded presentation values.

## 4. Typography - 3/4

Improved:

- Phase 06 removed `fontSize < 11` from scoped high-traffic files: Document Editor, Scene Composer, MiniPreview, StoryFlowScreen, TimelinePanel.
- Touched compact labels now include explicit `lineHeight`.
- New/touched work follows the UI-SPEC minimum micro size.

Still open:

- App-wide search still finds `fontSize: 9/10` in legacy surfaces such as `InteractiveObjectsEditor.tsx`, `LegoBlockLibrary.tsx`, `LegoFlowWorkspace.tsx`, `LegoCanvas.tsx`, `SaveSceneDialog.tsx`, `CharacterCreator.tsx`, `PreviewScreen.tsx`, `PropertiesPanel.tsx`, `SceneSelector.tsx`.
- String font weights remain in older components: `fontWeight: 'bold'` / `'normal'`.
- Full app type scale is not centralized yet.

## 5. Spacing - 3/4

Improved:

- Touched compact chips/labels now use the approved spacing/radius scale.
- Document Editor and Scene Composer mobile surfaces are more aligned with the design contract.
- Phase 06 scoped check found no oversized radii or negative letter spacing in targeted files.

Still open:

- Global spacing remains inconsistent in untouched legacy/editor surfaces.
- Border radius values outside the approved scale still exist outside the phase scope.
- The app still lacks shared spacing/radius constants, so future drift is likely.

## 6. Experience Design - 3/4

Improved:

- Document Editor now supports the core planned UX: sequential scene pages, `/` autocomplete with UA+EN aliases, `/new scene`, dialogue speaker recognition, speaker cleanup on delete, colored speaker tokens, and keyboard-follow behavior.
- Character Creator no longer exposes a broken sprite picker path; sprite display preserves existing sprite names.
- Splash removal now has destructive confirmation.
- Scene Composer DOM focus shortcut is guarded for web only.
- Settings text size selector now exposes selected accessibility state.
- Scene connection has a visible action path, not only long-press.

Still open:

- No screenshot/mobile viewport pass was captured in this review.
- Toast/snackbar feedback is still not implemented; several flows use blocking `Alert.alert`.
- Legacy manuscript/block editors still carry older UX patterns and hardcoded copy.
- MiniPreview remains dense and should become a clearer, tokenized preview panel.

## Top Remaining Fixes

1. Replace remaining emoji primary icons in active editor/reader surfaces, especially `MiniPreview`, `SceneSelector`, `StoryFlowScreen`, `settings`, and legacy Lego panels.
2. Move remaining hardcoded copy in legacy editor/manuscript/play surfaces into `translations.ts`.
3. Tokenize or isolate legacy hardcoded colors in Lego/editor files.
4. Create shared `type/spacing/radius` constants and migrate remaining 9/10px text.
5. Run a real mobile + desktop screenshot pass against Document Editor, Scene Composer, StoryFlow, MiniPreview, and Reader.

## Result

The remediation phases improved the baseline from 14/24 to 18/24. The new document-first UX now matches the product direction much better, but the old editor/Lego surfaces still prevent a 4/4 score across visuals, typography, spacing, and copy.
