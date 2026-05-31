# UI-SPEC — Visual Novel Engine

**Status:** active design contract  
**Created:** 2026-05-27  
**Inputs:** `standalone-UI-REVIEW.md`, `DESIGN_SYSTEM.md`, current Document Editor direction

## Goal

The product UI must feel like a focused visual-novel writing workspace: calm, document-first, fast for beginners, and expandable for advanced scene logic. The new Document Editor is the reference experience: scenes behave like sequential pages, text creation stays visible while typing, and technical actions stay hidden behind `/` commands until needed.

## Product Principles

1. **Story first:** writing and reading scene text are always the primary visual task.
2. **Document mental model:** each scene is a page; sequential scenes are ordered by `next` links and presented as previous/current/next pages.
3. **Progressive disclosure:** sprite, background, transition, variable, and audio controls appear as compact chips, panels, or `/` commands, not as permanent clutter.
4. **Beginner speed:** a user should create a simple playable story in 15 minutes with only text, `Name: dialogue`, choices, and `/нова сцена`.
5. **Advanced depth:** all existing Lego/core runtime capabilities remain reachable without forcing them into the writing flow.

## Priority Scope

### P0 — Visual Consistency

- Replace emoji-as-icons with `IconSymbol` or `@expo/vector-icons`.
- No emoji may be used as a primary command, nav, toolbar, destructive action, or status icon.
- Icon-only buttons must have `accessibilityLabel`.
- Empty states may use vector icons, not emoji.

### P0 — Copy And I18n

- All visible UI text must use `t()` unless it is user-generated content.
- Add missing tokens before changing component copy.
- Accessibility labels must use semantically correct tokens; do not reuse unrelated labels.
- Document Editor strings must support Ukrainian and English aliases/copy.

### P1 — Document Editor UX

- Scene pages must show `Сцена N з M` and preserve sequential navigation.
- `/нова сцена`, `/лист`, `/сторінка`, `/new scene`, `/page` create a new sequential page.
- `Name: text` renders as dialogue with the speaker name as a distinct colored token.
- Deleting the speaker name converts the block back to plain text and removes unused accidental characters when safe.
- While typing at the bottom or in the last block, the editor must auto-follow the writing position above the keyboard.
- `/` autocomplete must include UA+EN aliases and open as a bottom sheet on mobile.

### P1 — Theme Contract

- Component files must not introduce new hardcoded hex/rgb colors.
- Use `constants/theme-colors.json` and runtime palette tokens first.
- `foreground-inverse`, `backdrop`, `warning`, `error`, and shadow tokens must be guaranteed in palette types before removing fallbacks.
- Lego category colors must use existing `lego-*` tokens.
- Destructive actions use `danger`/`danger-bg`; warnings use `warning`/`warning-bg`.

### P1 — Typography

Use this type scale for new or touched UI:

| Role | Size | Line Height | Weight |
|---|---:|---:|---:|
| Page title | 32 | 40 | 800 |
| Section title | 20 | 28 | 700 |
| Body | 17 | 27 | 400 |
| UI label | 14 | 20 | 600 |
| Caption | 12 | 16 | 600 |
| Micro | 11 | 14 | 600 |

- Do not add `fontSize` below 11.
- Use numeric weights only.
- Long-form document text uses body scale.

### P1 — Spacing And Radius

Use this spacing scale for new or touched UI:

`4, 8, 12, 16, 24, 32, 48`

Use this radius scale:

| Token | Value | Use |
|---|---:|---|
| sm | 6 | small controls |
| md | 8 | chips, inputs |
| lg | 12 | panels, sheets |
| xl | 16 | modals, large surfaces |
| full | 999 | circular/pills only |

- Cards stay at `8` unless existing shared component requires otherwise.
- Avoid nested cards.
- Page sections are unframed layouts or full-width bands; cards are for repeated items, modals, and framed tools only.

## Component-Specific Rules

### Document Editor

- Mobile top bar must respect safe area and avoid status-bar overlap.
- The page surface is white/light paper in light mode and tokenized surface in dark mode.
- Technical actions render as compact chips with label + summary + warning state.
- Properties open as a right panel on desktop and bottom sheet on mobile.
- Command menu opens near input on desktop and as bottom sheet on mobile.
- Current writing target must remain visible while keyboard is open.

### Scene Composer

- Phone tabs need a visible active indicator, not text color only.
- The Document entry point must use i18n and icon system.
- No direct DOM access without explicit platform guard.

### Character Creator

- Sprite display must resolve actual sprite names.
- If sprite picker is not implemented, disable the action with clear copy instead of exposing dead UI.
- Character color swatches must use theme-derived palette values.

### Reader

- Reader visuals may be cinematic, but controls remain quiet and readable.
- Menus use vector icons and tokenized colors.
- Image-backed states need loading placeholders or blurhash/skeleton behavior.

## Accessibility Contract

- Every `Pressable` used as a button needs `accessibilityRole="button"`.
- Selected segmented controls need `accessibilityState={{ selected: true }}`.
- Destructive controls need explicit text or accessible label; icon-only delete is allowed only with label.
- Long-press-only workflows must have visible affordance or alternate button path.

## Verification Checklist

Before a UI phase is complete:

- `corepack pnpm run check`
- targeted unit tests
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- mobile viewport review for:
  - safe-area top bar
  - keyboard overlap
  - bottom sheets
  - text fitting
  - active tab states
- run `gsd-ui-review` after implementation and compare against `standalone-UI-REVIEW.md`.

## First Remediation Slice

Recommended first implementation slice:

1. Replace emoji icons in primary navigation, reader menu, timeline, properties, and document editor entry points.
2. Move touched hardcoded strings into `translations.ts`.
3. Tokenize colors in touched files.
4. Apply type/spacing/radius scale to Document Editor and Scene Composer mobile surfaces.
5. Fix `CharacterCreator` sprite name display or disable incomplete picker affordance.

## Out Of Scope For First Slice

- Full app-wide typography rewrite.
- Full app-wide spacing rewrite.
- New animation system.
- Replacing Lego/core logic.
- Removing old UX layer.
