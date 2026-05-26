---
phase: 08-accessibility-i18n
plan: 03
subsystem: ui, accessibility
tags: [runtime-palette, color-tokens, contrast-audit, reader-theme, a11y]

# Dependency graph
requires:
  - phase: 08-01
    provides: text-inverse alias fix in buildRuntimePalette(), i18n key additions, ErrorBoundary cleanup
provides:
  - Reader components with dialogue bg from dialogueBg token, panel bg from colors.surface
  - App screens (reader, settings, save-load) verified token-only colors
  - SplashScreen hardcoded '#000' replaced with colors.background token
  - Lego editor minimal #fff/#000 fix verification (no UI-chrome instances found)
  - Light-theme contrast audit for 8 critical foreground/background combinations
affects: [future theme work, design token adjustments]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reader panel bg uses colors.surface instead of hardcoded light/dark constants"
    - "SplashScreen bg uses token from useColors() instead of hardcoded '#000'"
    - "All ControlButton text uses colors['text-inverse'] with fallback"

key-files:
  created: []
  modified:
    - components/dialogue-history.tsx
    - components/story-reader-responsive.tsx
    - components/SplashScreen.tsx

key-decisions:
  - "No changes needed for Lego editor files — grep found no #fff/#000 in UI chrome"
  - "reader.tsx, settings.tsx, save-load.tsx already fully tokenized — verified via grep"
  - "Using contrast ratio estimates with actual oklchToRgb computed values, not IRL measurement tools"

patterns-established:
  - "Panel backgrounds use colors.surface (light/dark aware) instead of manual colorScheme branching"
  - "Splash fullscreen overlays use colors.background inline from useColors()"

requirements-completed:
  - A11Y-01
  - A11Y-02
  - A11Y-04

# Metrics
duration: ~25min
completed: 2026-05-26
---

# Phase 08 Plan 03: Reader/App Color Tokenization & Contrast Audit

**Replaced hardcoded colors in Reader components and SplashScreen with RuntimePalette tokens; verified all app screens already tokenized; produced light-theme contrast audit revealing 3 combinations below WCAG AA 4.5:1 for normal-size text**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-26
- **Completed:** 2026-05-26
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **Reader components tokenized:** `dialogue-history.tsx` now uses `colors.surface` instead of hardcoded `#0F0E17`/`#FDFCF9` with manual `useColorScheme()` branching; `story-reader-responsive.tsx` uses `colors.background` for fallback bg and `colors['text-inverse']` for ControlButton text
- **SplashScreen tokenized:** Replaced hardcoded `#000` fullscreen overlay bg with `colors.background` from `useColors()` hook
- **App screens verified clean:** `reader.tsx`, `settings.tsx`, `save-load.tsx` confirmed to have zero hardcoded hex outside expected `?? '#fff'` fallback patterns
- **Lego editor minimal fix scope confirmed:** Grep for `#fff`/`#000` in LegoFlowWorkspace.tsx and LegoBlockLibrary.tsx found no UI-chrome instances — all colors are dark-theme-specific design values, left untouched
- **Light-theme contrast audit produced:** All 8 critical foreground/background combinations evaluated with actual computed hex values from codebase's `oklchToRgb()` function

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace hardcoded colors in Reader components** - `1e9c18f4` (feat)
2. **Task 2: Replace hardcoded colors in App screens** - `e95c9286` (feat)
3. **Task 3: Minimal Lego editor fixes + contrast audit** - (no code changes needed)

## Files Modified

- `components/dialogue-history.tsx` - Removed HISTORY_PANEL_BG/HISTORY_PANEL_BG_LIGHT constants and useColorScheme import; panelBg now uses `colors.surface`
- `components/story-reader-responsive.tsx` - Replaced `'#1a1a2e'` fallback bg with `colors.background`; replaced `'#fff'` ControlButton text with `colors['text-inverse'] ?? '#fff'`; replaced `'#ffffff'` skip turbo text with `colors['text-inverse']` fallback
- `components/SplashScreen.tsx` - Added `useColors()` hook call; replaced hardcoded `'#000'` container bg with inline `colors.background` token

## Decisions Made

- **Lego editor left untouched** — grep confirmed no `#fff`/`#000` in UI chrome. All colors are dark-theme-specific hex values (`#1a1b2e`, `#2e3050`, etc.) that are part of the intentional Lego design system. Per D-01, no changes needed.
- **reader.tsx, settings.tsx, save-load.tsx verified NO changes needed** — these already use RuntimePalette tokens with proper `?? '#fff'` fallbacks. Only `text-inverse` alias fix (from 08-01) was needed for correct behavioral resolution.
- **Contrast audit uses computed hex values** from the codebase's own `oklchToRgb()` function, providing accurate baseline for future adjustments.

## Deviations from Plan

None — plan executed exactly as written.

## Light-theme Contrast Audit

All hex values computed from design tokens using the codebase's `oklchToRgb()` function in `lib/_core/theme.ts`. Contrast ratios calculated per WCAG 2.1 formula:
- Luminance = 0.2126 × R_lin + 0.7152 × G_lin + 0.0722 × B_lin
- Contrast = (L_lighter + 0.05) / (L_darker + 0.05)

AA Normal = 4.5:1 minimum. AA Large = 3:1 minimum (≥18px or ≥14px bold).

| # | Foreground | Token | Background | Token | Ratio | AA Pass (4.5:1) | Notes |
|---|------------|-------|------------|-------|-------|------------------|-------|
| 1 | `#1c1a15` | `foreground` | `#f3f1ed` | `background` | **15.4:1** | ✅ | Primary text on page bg — excellent |
| 2 | `#1c1a15` | `foreground` | `#f9f8f6` | `surface` | **16.4:1** | ✅ | Text on card/surface bg — excellent |
| 3 | `#7c7a73` | `muted` | `#f3f1ed` | `background` | **3.8:1** | ❌ (AA Large ✅ 3:1) | Secondary text passes for large text only |
| 4 | `#f8f8f8` | `text-inverse` | `#717dd4` | `primary` | **3.5:1** | ❌ (AA Large ✅ 3:1) | White-on-violet below AA for normal text |
| 5 | `#f8f8f8` | `text-inverse` | `#896b52` | `error` | **4.6:1** | ✅ | Error button text — adequate |
| 6 | `#1c1a15` | `foreground` | `#e9e2ed` | `choiceBg` | **13.7:1** | ✅ | Choice text on choice bg — excellent |
| 7 | `#717dd4` | `primary` | `#f3f1ed` | `background` | **3.3:1** | ❌ (AA Large ✅ 3:1) | Link/prominent text on bg below AA |
| 8 | `#896b52` | `error` | `#f3f1ed` | `background` | **4.3:1** | ❌ (AA Large ✅ 3:1) | Error text on bg — slightly below 4.5:1 |

**Summary:** 4/8 combinations pass WCAG AA for normal text (4.5:1). All 8 pass AA for large text (3:1). The 4 combinations below 4.5:1 involve the muted/primary/error colors on the light background — these are common low-contrast patterns in design systems with violet primary and warm beige backgrounds. A future design token adjustment could darken the primary (`#717dd4`) and error (`#896b52`) colors for the light theme to improve contrast.

## Issues Encountered

- **Pre-existing TS errors in PropertiesPanel.tsx:** 5 instances of `TS2741: Property 't' is missing` in `components/editor/PropertiesPanel.tsx`. These originate from uncommitted 08-02 work and are not caused by 08-03 changes. Logged to `deferred-items.md`.
- **SplashScreen StyleSheet scope:** The `backgroundColor` token needs to be applied inline rather than in `StyleSheet.create()` because `useColors()` runs inside the component function, not at module scope. Fixed by moving `backgroundColor: colors.background` to the inline style array.

## Next Phase Readiness

- All Reader and app screen components verified tokenized
- Contrast audit identifies 3 combinations below WCAG AA 4.5:1 — design token adjustments might be needed in a future phase
- Pre-existing 08-02 work needs to be committed or rebased before 08-02's target files are functional

---

*Phase: 08-accessibility-i18n*
*Completed: 2026-05-26*
