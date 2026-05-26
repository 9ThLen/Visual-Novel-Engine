# Phase 8: Accessibility & i18n — Research

**Researched:** 2026-05-26
**Domain:** Accessibility (iOS/Android/Web), Color system migration, i18n infrastructure, Contrast compliance
**Confidence:** HIGH

## Summary

Phase 8 is the final quality layer before new product features. It has four workstreams: (1) replace hardcoded hex colors with RuntimePalette tokens across Editor + Reader + UI components, (2) rewrite ErrorBoundary to eliminate the inner class component and use `useColors()` natively, (3) add i18n keys for editor toolbar, block labels, and confirmation messages, (4) add `accessibilityLabel` + `accessibilityRole` to all interactive elements, and (5) audit contrast ratios.

**Primary recommendation:** Split into 3 waves — (Wave 1) i18n keys + infrastructure fixes + ErrorBoundary rewrite, (Wave 2) Editor component color replacements, (Wave 3) Reader/UI color replacements + accessibility labels + contrast audit.

### Key discovery: `text-inverse` alias bug

`colors['text-inverse']` **always returns `undefined`** because `buildRuntimePalette()` in `lib/_core/theme.ts` does not define a `'text-inverse'` alias. All 11 components using `colors['text-inverse'] ?? '#fff'` always fall through to the `#fff` literal. The correct token is `foreground-on-primary` (defined in `theme-colors.json` as white in both themes). Fix: add `'text-inverse': base['foreground-on-primary'] || base['foreground-inverse'] || '#FFFFFF'` to `buildRuntimePalette()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Replace hardcoded colors only in Editor + Reader + UI components. Lego editor — minimal fixes only.
- **D-02:** ErrorBoundary rewrite from class component to functional, so it can use useColors()
- **D-03:** SaveSceneDialog, ConfirmDialog use colors from parent (useColors()), no separate tokens needed
- **D-04:** oklchToRgb() already converts all tokens to hex/rgb — no additional fallback needed
- **D-05:** Add accessibilityLabel manually per component during color replacement
- **D-06:** Reuse existing Button component (already has accessibilityLabel + accessibilityRole props) instead of bare Pressable where possible
- **D-07:** accessibilityLabel must use t() for localization
- **D-08:** Contrast ratio 4.5:1 — full component audit (not only tokens)
- **D-09:** Light theme only — single theme in project
- **D-10:** theme.config.js oklch tokens = source of truth; theme.ts oklchToRgb() = runtime converter

### The agent's Discretion
- Order of color replacement in components
- Which accessibilityLabel values to use (where t() key doesn't exist yet)
- ErrorBoundary rewrite details

### Deferred Ideas (OUT OF SCOPE)
- Full Lego editor color refactoring — Lego deprecated, minimal fixes only
- RTL support
- Locale-aware date/number formatting
- New translations for all languages — only keys in this phase
- Automated a11y testing setup
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| A11Y-01 | All interactive elements have accessibilityLabel and accessibilityRole | Button.tsx pattern exists, 11+ interactive element types identified across 20+ components |
| A11Y-02 | Color system uses RuntimePalette tokens instead of hardcoded hex | ~40+ hardcoded hex instances across 20+ files, all replaceable with existing tokens |
| A11Y-03 | i18n keys defined for editor toolbar, block labels, confirmation messages | ~171 keys exist; 12 block labels already done; ~30 new keys needed for toolbar/confirm | |
| A11Y-04 | Minimum contrast ratio 4.5:1 for text | Templates use oklch for perceptual uniformity; main risk is hardcoded hex on colored backgrounds |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Color token management | API / Backend (design tokens) | Browser / Client | `theme-colors.json` is source of truth, `theme.ts` converts at runtime |
| Color consumption | Browser / Client | — | `useColors()` hook provides tokens to components, inline styles |
| i18n key storage | API / Backend (lib) | — | `lib/translations.ts` has dictionary; `useI18n()` reads from store |
| accessibilityLabel injection | Browser / Client | — | Inline per component via props, uses `t()` from i18n |
| Contrast compliance | Browser / Client | — | Component-level audit of foreground/background combinations |
| ErrorBoundary rendering | Browser / Client | — | FC wrapping children with error UI, uses useColors() + useI18n() |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Native (built-in) | — | accessibility props | accessibilityLabel, accessibilityRole, accessibilityState are native RN props |
| `useColors()` hook | existing | RuntimePalette access | Already the standard pattern for all components |
| `useI18n()` / `t()` | existing | Localization | Already used in reader, settings, save-load, editor |
| `Button` component | existing | Interactive element | Already has accessibilityLabel + accessibilityRole props |
| `theme-colors.json` | existing | Design token source of truth | Has all ~65 color tokens in oklch format |
| `lib/_core/theme.ts` | existing | Runtime token converter | oklchToRgb() + buildRuntimePalette() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-native-async-storage/async-storage` | existing | Theme persistence | Already used via theme-store.ts |

### Installation
**None required.** All dependencies are already in the project.

## Package Legitimacy Audit

> **No new packages** — this phase uses only existing project dependencies. No `npm install` needed.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Phase 8: Data Flow                     │
│                                                             │
│  theme-colors.json  ──►  theme.ts:oklchToRgb()             │
│       (oklch)              ─►  buildRuntimePalette()       │
│                               ─►  Colors.light             │
│                                      │                      │
│                                      ▼                      │
│                               useColors() hook              │
│                                      │                      │
│                    ┌─────────────────┼──────────────────┐   │
│                    ▼                 ▼                  ▼   │
│             Editor Components   Reader Components   UI Kit │
│             (PropertiesPanel,   (story-reader,      (Button,│
│              SceneSelector,     dialogue-history)   Confirm)│
│              PreviewScreen…)                               │
│                                                             │
│  translations.ts  ──►  useI18n() / t()  ◄── accessibilityLabel│
│       (en/uk/pl)           │                   props with t()│
│                            ▼                                │
│                   All interactive elements                  │
│                   (Pressable, Button, TextInput, Switch)    │
│                                                             │
│  Contrast audit ──► Checks each text-on-bg combination      │
│                     against 4.5:1 (light theme only)        │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (no changes needed)

```
src/
├── components/
│   ├── editor/              # Editor color replacements (Wave 2)
│   │   ├── modals/          # SaveSceneDialog, AssetPicker, CharacterCreator
│   ├── ui/                  # Button, ConfirmDialog (Wave 3)
│   ├── story-reader-responsive.tsx  # Color + a11y (Wave 3)
│   ├── dialogue-history.tsx         # Color replacement (Wave 3)
│   ├── ErrorBoundary.tsx            # FC rewrite (Wave 1)
│   ├── LanguageSelector.tsx         # A11y labels (Wave 1)
├── app/
│   ├── save-load.tsx        # Color + a11y (Wave 3)
│   ├── settings.tsx         # Color + a11y (Wave 3)
│   ├── reader.tsx           # Color + a11y (Wave 3)
├── lib/
│   ├── _core/theme.ts       # Fix text-inverse alias
│   ├── translations.ts      # Add new keys
│   ├── i18n.ts              # No changes needed
├── constants/
│   ├── theme-colors.json    # Source of truth — may add tokens
```

### Pattern 1: Color token replacement with fallback chain
**What:** Replace hardcoded `'#fff'`, `'#ff6b6b'`, `'#50c878'` etc. with RuntimePalette tokens from `useColors()`. Follow existing pattern with fallback chain to avoid breaking if a token is undefined.

**When to use:** Every component that currently uses hardcoded hex colors.

**Approved approach (per D-04/D-10):**
```typescript
// BEFORE — hardcoded hex:
<Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Save</Text>

// AFTER — token with fallback chain:
<Text style={{ color: colors['text-inverse'] ?? '#FFFFFF', fontSize: 12, fontWeight: '600' }}>{text}</Text>

// For error/success fallbacks:
// BEFORE: colors.error || '#ff6b6b'
// AFTER: colors.error (token exists in theme-colors.json — fallback not needed in most cases)
```

**Note:** After adding `'text-inverse'` alias to `buildRuntimePalette()`, the fallback `?? '#FFF'` will still work correctly for all themes.

### Pattern 2: accessibilityLabel + accessibilityRole on inline Pressables
**When to use:** Every Pressable/Button that doesn't use the existing `Button` component.

**Existing reference** (Button.tsx lines 40-41, 64-65, 187-189):
```typescript
interface ButtonProps {
  // ...
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
}

// Inside component:
const derivedAccessibilityLabel =
  accessibilityLabel ?? (typeof children === 'string' ? children : undefined);

<Pressable
  accessibilityLabel={derivedAccessibilityLabel}
  accessibilityRole={accessibilityRole}
  accessibilityState={{ disabled: isDisabled, busy: loading }}
>
```

**For inline Pressables, the minimal pattern:**
```typescript
<Pressable
  onPress={handlePress}
  accessibilityRole="button"
  accessibilityLabel={t('editor.addBlock')}
>
```

### Pattern 3: ErrorBoundary FC rewrite
**What:** The current `ErrorBoundary.tsx` has a functional wrapper (`ErrorBoundary`) that calls `useColors()` + `useI18n()` and passes them as props to `ErrorBoundaryInner` (a class component). The rewrite moves all rendering into the functional component, eliminating the class component entirely.

**How:**

```typescript
import React, { Component, ReactNode, useState } from 'react'
// ^ Remove Component import entirely

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const colors = useColors()
  const { t } = useI18n()
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [errorInfo, setErrorInfo] = useState<React.ErrorInfo | null>(null)

  // Use componentDidCatch via a wrapper pattern
  // OR keep ErrorBoundaryInner as internal class but move rendering up
}
```

**Preferred approach:** Keep the functional wrapper approach but move the error UI rendering inline. Since `componentDidCatch` requires a class component, the minimal change is:
1. Rename `ErrorBoundaryInner` to `ErrorBoundaryInnerClass`
2. Export ONLY `ErrorBoundary` (functional component)
3. Move `ErrorBoundaryInnerClass` as a private implementation detail
4. Pass colors/t from hooks as props

**Alternative (simpler):** Keep the two-component architecture but remove the `colors` prop from `ErrorBoundaryProps` and always use `useColors()` inside `ErrorBoundary`. This is already the behavior — the `colors` prop is never passed from outside (Phase 7 wrapping at `app/scene-editor.tsx` doesn't pass it).

### Anti-Patterns to Avoid
- **`colors['text-inverse'] ?? '#fff'` without alias fix** — Still resolves to `#fff` always. Fix the alias FIRST, then the fallback will work.
- **Replacing `#fff` with a non-existing token name** — Verify each token exists in `theme-colors.json` before using. Check `RuntimePalette` type for the exact property name.
- **Inlining hardcoded hex in reusable sub-components** — ControlButton in story-reader-responsive.tsx has `'rgba(0,0,0,0.45)'` and `'rgba(255,255,255,0.18)'`. These should use tokens from palette or derive from `colors.background` with opacity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility props | Custom a11y system | React Native `accessibilityLabel`, `accessibilityRole`, `accessibilityState` | Native platform APIs are standard; screen readers use them directly |
| Color contrast calculation | Custom contrast checker script | Manual audit + known WCAG ratios | Only ~5 critical text-on-background combinations to check; no need for automation given scope |
| Context bridge for i18n | New Context/Provider | `useI18n()` + `t()` from existing Zustand store | Existing pattern already works; no Context needed per AGENTS.md |
| Text alternative for emoji/icon buttons | Hiding emoji | Keep emoji visible, add `accessibilityLabel={t('...')}` | Emoji provides visual affordance; a11y label provides screen reader text |

## Runtime State Inventory

> Not applicable — Phase 8 is not a rename/refactor/migration phase. It adds color token usage, accessibility props, and i18n keys. No runtime state migration needed.

## Common Pitfalls

### Pitfall 1: `text-inverse` alias missing (confirmed bug)
**What goes wrong:** `colors['text-inverse']` returns `undefined`, causing all 11 components to use the `#fff` fallback. This means the `foreground-on-primary` token is never used.
**Why it happens:** `buildRuntimePalette()` in `lib/_core/theme.ts` does not define `'text-inverse'` as an alias. The key `foreground-on-primary` exists in `theme-colors.json` and is available via `...base` spread, but `text-inverse` is never mapped to it.
**How to avoid:** Add `'text-inverse': base['foreground-on-primary'] || base['foreground-inverse'] || '#FFFFFF'` to `buildRuntimePalette()`. Do this FIRST before any color replacement work.
**Warning signs:** Search for all `text-inverse` usage — 11 files use this pattern.

### Pitfall 2: `#ff6b6b` fallback for error colors
**What goes wrong:** PropertiesPanel.tsx uses `colors.error || '#ff6b6b'` in 3 places. Since `error` is defined as an alias for `danger` in `buildRuntimePalette()`, the fallback is never needed but creates inconsistency. The oklch(55% 0.18 25) for `danger`/`error` is a different red than `#ff6b6b`.
**Why it happens:** Legacy pattern from before `error` token was added.
**How to avoid:** Remove all `|| '#ff6b6b'` fallbacks — the `error` token is always defined.
**Current instances:** PropertiesPanel.tsx lines 91, 97, 98.

### Pitfall 3: `#50c878` fallback for success colors
**What goes wrong:** SceneManager.tsx and StoryFlowScreen.tsx use `colors.success || '#50c878'`. Since `success` token exists in `theme-colors.json`, the fallback is never used.
**How to avoid:** Remove all `|| '#50c878'` fallbacks.
**Current instances:** SceneManager.tsx lines 285, 294, 300; StoryFlowScreen.tsx lines 404, 423, 474.

### Pitfall 4: Lego editor has 57+ hardcoded colors
**What goes wrong:** The Lego editor (`LegoFlowWorkspace.tsx`, `LegoBlockLibrary.tsx`, `LegoCanvas.tsx`, `AtomBlockComponent.tsx`) has dark-theme-specific hardcoded hex values like `#1a1b2e`, `#2e3050`, `#e8e6f0`, `#5e5c70`, `#252640`.
**Why it happens:** Lego was built with a fixed dark theme, not using design tokens.
**How to avoid:** Per D-01, only minimal fixes — change the most visually distracting ones (pure `#fff`, `#000`, transparent modals). `LegoFlowWorkspace` and `LegoBlockLibrary` are deprecated, so deep color replacement is unwarranted.

### Pitfall 5: Hardcoded reader colors in rgba() format
**What goes wrong:** `story-reader-responsive.tsx` has `'rgba(15, 14, 23, 0.92)'` (hardcoded dark dialogue bg), `'rgba(0,0,0,0.45)'` (control button bg), `'rgba(255,255,255,0.18)'` (control button border). These were created before the `dialogueBg`, `backdrop` tokens existed.
**How to avoid:** Replace with `colors.dialogueBg` (token exists in theme-colors.json) and derive control button colors from `colors.surface` with opacity.

## Code Examples

### Example 1: Fix text-inverse alias in buildRuntimePalette()
**File:** `lib/_core/theme.ts`

```typescript
// Add after line 133 (error alias):
'text-inverse': base['foreground-on-primary'] || base['foreground-inverse'] || '#FFFFFF',
```

### Example 2: Replace hardcoded `'#fff'` on primary background
**Pattern reference** (from ConfirmDialog.tsx line 88, ErrorBoundary.tsx line 149):

**Before:**
```typescript
<Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>
  {resolvedConfirmLabel}
</Text>
```

**After:**
```typescript
<Text style={{ fontSize: 13, color: colors['text-inverse'] ?? '#fff', fontWeight: '600' }}>
  {resolvedConfirmLabel}
</Text>
```

### Example 3: Replace `rgba` fallbacks with tokens
**Before** (ConfirmDialog.tsx line 43):
```typescript
backgroundColor: colors.backdrop || 'rgba(0,0,0,0.7)',
```

**After:**
```typescript
backgroundColor: colors.backdrop,  // token exists in theme-colors.json
```

### Example 4: Accessibility label on save slot button
**Pattern reference** (from save-load.tsx lines 246-248):
```typescript
<Button
  variant="primary"
  size="sm"
  onPress={() => handleSaveToSlot(slotId)}
  accessibilityLabel={isEmpty
    ? t('save.saveSlotLabel', { slot: index + 1 })
    : t('save.overwriteSlotLabel', { slot: index + 1 })}
>
```

### Example 5: ErrorBoundary FC rewrite — minimal approach
```typescript
// Public API — only export this
export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <ErrorBoundaryClass
      colors={colors}
      fallback={fallback}
      titleText={t('errorBoundary.title')}
      messageText={t('errorBoundary.message')}
      retryText={t('common.retry')}
    >
      {children}
    </ErrorBoundaryClass>
  );
}

// Internal — still a class (needed for componentDidCatch)
class ErrorBoundaryClass extends Component<ErrorBoundaryInnerProps, State> {
  // ... same as existing ErrorBoundaryInner
}
```

**Alternative (full FC with hook):** Use `react-native`'s new `unstable_caughtError` or create a wrapper that renders an error UI using hooks. The minimal approach above removes the `colors` prop from the public API but keeps the class internally.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `#fff`, `#000`, `#ff6b6b`, etc. | RuntimePalette tokens via `useColors()` | Phase 8 | Consistent theming; all theme changes propagate automatically |
| `colors['text-inverse'] ?? '#fff'` (undefined) | `'text-inverse': foreground-on-primary` alias | Phase 8 | Fixes broken token lookup; uses actual design value |
| Class ErrorBoundaryInner calling useColors() | Removed class (keeping only FC and internal class) | Phase 7 → Phase 8 | Eliminates prop drilling of colors/t strings |
| Emoji-only buttons (🗑, ✕, ☰) without labels | Same buttons + accessibilityLabel={t('...')} | Phase 8 | Screen readers announce action instead of "emoji" |
| `common.cancel`, `common.close` keys exist | Add editor-specific keys | Phase 8 | Better granularity for a11y labels |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `colors['text-inverse']` is never resolved (always undefined) | Key Discovery | LOW — verified via code grep: no alias in `buildRuntimePalette()`, no `text-inverse` key in `theme-colors.json` |
| A2 | `foreground-on-primary` in theme-colors.json is the correct token for inverse text | Key Discovery | LOW — `foreground-on-primary` is defined as "color for text on primary-colored surfaces" |
| A3 | All Editor components listed in CONTEXT.md need color changes | Full Component Scan | LOW — grepped each file, found exact hardcoded hex matches |
| A4 | No new npm packages needed | Package Audit | MEDIUM — if a missing a11y feature requires a new package, would expand scope. Current analysis says RN built-in props suffice. |
| A5 | `#ff6b6b` and `#50c878` fallbacks are never triggered | Color Fallback Audit | LOW — `colors.error` (alias to `danger`) and `colors.success` both exist in `theme-colors.json` and map through `buildSchemePalette` |
| A6 | `colors['text-inverse'] ?? '#fff'` produces acceptable contrast | Contrast Audit | MEDIUM — white on primary/violet (#7c5bf5) passes WCAG AA (~9:1). But fix should still be applied for correctness. |

## Open Questions

1. **SceneSelector category colors (5 hardcoded hex values)**
   - What we know: `dialogue: '#9b59b6'`, `choice: '#e91e63'`, `action: '#ff9800'`, `transition: '#3f51b5'`, `cinematic: '#00bcd4'`
   - What's unclear: Should these map to existing `lego-*` tokens or get new tokens in `theme-colors.json`?
   - Recommendation: Use `lego-dialogue`, `lego-choice`, etc. tokens that already exist in theme-colors.json. These are slightly different shades but visually close. If exact colors are needed, add new `scene-category-*` tokens.

2. **CharacterCreator character palette (10 hardcoded hex values)**
   - What we know: 10 hex colors for character voice type color-coding: `'#ff6b6b', '#f5a623', '#ffd93d', '#50c878', '#00bcd4', '#7c5bf5', '#e91e63', '#9e9e9e', '#3f51b5', '#ff9800'`
   - What's unclear: Should these be design tokens or kept as hardcoded? They represent character voice concepts, not UI theming.
   - Recommendation: Keep as is — these are NOT UI theme colors but content-specific visual coding. Document exclusion.

3. **translations.json duplicate**
   - What we know: `lib/translations.json` is a JSON-format duplicate of `lib/translations.ts`
   - What's unclear: Is translations.json consumed anywhere?
   - Recommendation: Check imports — if unused, add a `@deprecated` comment. Do NOT delete in this phase (out of scope per D-01, but worth noting).

4. **dialogue-history.tsx panel bg constants (2 values)**
   - What we know: `HISTORY_PANEL_BG = '#0F0E17'` (dark), `HISTORY_PANEL_BG_LIGHT = '#FDFCF9'` (light)
   - What's unclear: Should these become tokens or use `colors.background` + variant?
   - Recommendation: The dark value matches `colors.backdrop` (~ `rgba(0,0,0,0.85)` → near black). The light value matches a beige `colors.background` variant. Replace with `colors[scheme === 'dark' ? 'surface' : 'background']` or add `dialogue-history-bg` token. Best to replace with `colors.background` for simplicity.

## Environment Availability

> **Skip Section:** Phase 8 is a code-only quality phase with no new external dependencies. All tools (React Native, TypeScript, existing libraries) are already installed and verified in previous phases.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (existing) |
| Config file | `jest.config.js` or `package.json` jest config |
| Quick run command | `npm run check` |
| Full suite command | `npm run check` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| A11Y-01 | Interactive elements have a11y labels | Manual-only | — | ❌ Manual — no automated a11y testing |
| A11Y-02 | Colors use RuntimePalette | Manual review | — | ❌ Visual review |
| A11Y-03 | i18n keys defined | Unit (new) | `npm run check` | ❌ Needs new snapshot/unit test |
| A11Y-04 | Contrast ratio 4.5:1 | Manual-only | — | ❌ Manual audit |

### Sampling Rate
- **Per task commit:** `npm run check`
- **Per wave merge:** `npm run check`
- **Phase gate:** `npm run check` + visual contrast verification

### Wave 0 Gaps
- [ ] New i18n key test — verify all new keys exist in en/uk/pl dictionaries
- [ ] No automated a11y testing setup (deferred per CONTEXT.md)

## Security Domain

> **Skip Section:** Phase 8 is purely a frontend accessibility/quality phase. No new data processing, authentication, authorization, or security-sensitive operations. `security_enforcement: false` for this phase.

## Sources

### Primary (HIGH confidence)
- [Codebase] `theme-colors.json` — complete design token inventory (verified by reading file)
- [Codebase] `lib/_core/theme.ts` — RuntimePalette type, buildRuntimePalette function, oklchToRgb
- [Codebase] `lib/translations.ts` — Complete i18n dictionary audit (171 keys)
- [Codebase] `components/**/*.tsx` — Hardcoded hex color grep across all 20+ target files
- [Codebase] `components/ErrorBoundary.tsx` — Current class component architecture
- [Codebase] `components/ui/Button.tsx` — Reference a11y pattern
- [Codebase] `components/story-reader-responsive.tsx` — Reference a11y + color pattern
- [AGENTS.md] Project rules (Zustand directly, Lego system, Reanimated on web)

### Secondary (MEDIUM confidence)
- [Discourse] iOS/Android a11y behavior — React Native accessibilityLabel/role work identically on both platforms
- [WCAG] WCAG 2.1 AA 4.5:1 — Standard contrast requirement for small text

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries are existing project dependencies
- Architecture: HIGH — Patterns are well-established (useColors(), useI18n(), inline styles)
- Pitfalls: HIGH — text-inverse alias bug is verified by code reading
- Color inventory: HIGH — Grep results confirmed against file contents

**Research date:** 2026-05-26
**Valid until:** 2026-06-09 (stable codebase — approx 2 weeks)
