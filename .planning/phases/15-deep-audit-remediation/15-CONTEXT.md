# Phase 15: Deep Audit Remediation - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Source:** PRD Express Path (PLAN-FIXES-2026-06-04.md)
**Source audits:** DEEP-CODE-REVIEW-2026-06-04.md, DEEP-UI-REVIEW-2026-06-04.md, AUDIT-FULL-2026-06-04.md

<domain>

## Phase Boundary

Resolve all 31 findings (4 CRITICAL, 17 WARNING, 10 INFO) from the 2026-06-04 deep audit of the Visual Novel Engine (React Native + Expo + Zustand). Phase scope:

**In scope:**
- All 4 CRITICAL findings (CR-1 through CR-7, with CR-5/6/7 grouped as "additional critical")
- All 11 code-review WARNINGs (WR-1 through WR-11)
- All 6 UI-review WARNINGs (UI-W1 through UI-W10, deduplicated to 6 work areas)
- Selected INFO findings that prevent regressions (ESLint rules, codemod)
- 1 production bug (CR-7: story-manuscript-save production dedup silently dropped)
- 1 critical user-visible bug (CR-1: useTypewriter textSpeed re-read broken)

**Out of scope (deferred to next phase or milestone):**
- 3-editor deduplication (Lego vs Document vs SceneComposer, ~2000 LOC overlap)
- Full `use-app-store.ts` slice decomposition (479 LOC monolith → 5 slices)
- Full `translations.ts` split by locale (947 LOC → 3 files)
- Component test coverage expansion (current: 40 unit tests, 0 component tests)
- Storybook setup
- CI/CD pipeline (`.github/workflows/`)
- Visual screenshot capture (no dev server detected during audit)

</domain>

<decisions>

## Implementation Decisions

### CRITICAL (must-fix, Beta-blocking)

### Code Quality (CR-1)
- **`useTypewriter` textSpeed re-read broken** — Phase 14 Task 5 (WR-7) was NOT done despite being in `14-PLAN.md`. Fix: introduce `textSpeedRef` mirroring pattern; interval tick reads `charDelayMs(textSpeedRef.current)` on every character. Add unit test for mid-typing speed change.

### Code Quality (CR-2)
- **8+ hex-alpha concat sites in `document-editor/` and `manuscript/`** — Phase 14 added `withAlpha()` helper but did not migrate consumers. WR-4 sweep missed these files. Fix: mechanical replacement in 10 files: `DocumentSceneSidebar.tsx:30`, `DocumentBlockDialogue.tsx:97,98`, `DocumentCommandMenu.tsx:104`, `DocumentChip.tsx:35,36`, `StoryManuscriptBlock.tsx:303`, `StoryManuscriptSidebar.tsx:57`, `PreviewScreen.tsx:303`, `TimelinePanel.tsx:169` (shadow color).

### Color/Theme (CR-3)
- **Hardcoded `#000000`/`#ffffff` in `lib/story-reader-platform.ts:7,17`** — Undermines OKLCH theme on Android/iOS native reader. Fix: change to `null` contract; consumers must pass `colors` explicitly.

### Visual P0 (CR-4)
- **Unicode glyphs (▲▼←→✓) as primary controls in 5+ files** — Violates UI-SPEC §P0. Fix: extend `IconSymbol` MAPPING with `chevron.up/down`, `arrow.left/right`, `xmark`, `checkmark`; replace glyphs in `SplashScreenEditor.tsx:122,372`, `InteractiveObjectsEditor.tsx:124`, `PreviewScreen.tsx:280`, `SceneSelector.tsx:390,518`, `SceneComposerPhone.tsx:191` (remove 180° rotate hack).

### i18n (CR-5)
- **21 hardcoded English a11y strings in 10 files** — All need `t()` keys. Add ~30 new translation keys to `lib/translations.ts` (EN/UK/PL).

### UX (CR-6)
- **`app/preview.tsx` dead-end error state** — `Loading...`/`No story or scene ID provided` are hardcoded and have no recovery. Fix: `ActivityIndicator` + `t('common.loading')`; `t('document.invalidRoute')` + back button.

### Code Quality (CR-7)
- **`story-manuscript-save.ts` production dedup silently dropped** — `seenSourceStepIds.add()` runs inside `if (__DEV__)` block; release builds get duplicate entries. Fix: move dedup out of dev guard; keep warning in dev.

### Code Quality (WR-1..WR-11)

- **WR-1:** `PreviewScreen.tsx:41` — `useRef(new AudioPlayerService())` per-mount service instantiation (U-2 from audit-2026-06-04 not done in Phase 14). Use `enhancedAudioManager` module-level singleton.
- **WR-2:** `app/tabs/index.tsx:156,164,191` — Unguarded `console.*` (P-2 from audit-2026-06-02 not done). Wrap in `if (__DEV__)`.
- **WR-3:** `lib/translations.ts:1,980` — `Language` type missing `'pl'`. Add `'pl'` locale (with `en` fallback initially); add to LanguageSelector.
- **WR-5:** `lib/engine/useSceneExecutor.ts:284-318` — `selectChoice` doesn't auto-advance on `targetSceneId`; contract undocumented. Add JSDoc + handle `targetSceneId === null` case.
- **WR-6:** `components/document-editor/DocumentSceneEditor.tsx:94-101` — Render-time `setState` (React anti-pattern). Move to `useEffect` with `useRef` for prev-prop tracker.
- **WR-7:** `lib/engine/conditionUtils.ts:5-10` — `toComparable` does work for operators that don't need it. Inline numeric coercion only in operators that need it.
- **WR-8:** `lib/engine/conditionUtils.ts:38` — `isEmpty` doesn't account for empty arrays. Extend to `Array.isArray(v) ? v.length === 0 : (v == null || v === '')`.
- **WR-9:** `lib/story-hooks.ts:372` — `loadStories` selector returns `migrateFromLegacyKeys` (misleading name). Rename + add JSDoc explaining AGENTS.md "HomeScreen init" rule.
- **WR-10:** `lib/_core/auth.ts:24-30` — `isValidUser` type guard with unreachable `!user.lastSignedIn` check. Add comment explaining runtime safety.
- **WR-11:** `lib/persistent-storage.ts:18-26` — `createPersistentStorage` silent noop on web SSR. Add `if (__DEV__) console.warn(...)` in catch block.

### UI/UX (UI-W1..W10)

- **UI-W1..W4:** Inline `fontSize` in 5 `document-editor/` files bypass `typeScale`. Add `typeScale.documentTitle: 36/42`, `typeScale.propertiesTitle: 18/24` to `lib/design-tokens.ts`. Replace ~10 inline values.
- **UI-W5..W8:** Magic spacing (10, 11, 14, 18, 42, 76) in 4 `document-editor/` files. Add `headerHeight.phone: 76`, `headerHeight.desktop: 56` tokens. Replace ~20 off-scale values.
- **UI-W9:** `SceneComposerPhone.tsx:209,247` — Duplicate `t('editor.blocks')` (screen-reader announces twice). Remove header pill on `:209`, keep tab on `:247`.
- **UI-W10:** `SplashScreenEditor.tsx` — No undo path for preset. Add confirm dialog before applying preset OR store prior splash state for last-action undo.

### Regression Prevention (3.1)

- **ESLint rules to prevent hex+alpha concat, unguarded console, hardcoded colors** — `no-restricted-syntax` with template literal regex; warn on `__DEV__` blocks containing non-`console.*`.
- **Codemod for tokenization** — jscodeshift script: `fontSize: 11/12/14/16/17/18/20/32/36` → `...typeScale.<token>`; off-scale spacing → `spacing.<token>`.
- **Regression check script** — `tools/check_regressions.sh` with grep-based checks for hex+alpha, hardcoded a11y, inline fontSize, unguarded console.

### the agent's Discretion

- Whether to use `useRef` or `useState` for the `textSpeedRef` in `useTypewriter` (recommend ref for synchronous access)
- Whether to fix `WR-3` (Polish locale) with full translations or `en` fallback initially (decision needed from user)
- Whether to use confirm dialog OR last-action undo for `SplashScreenEditor` undo path
- Order of execution within Wave 2 (recommend: WR-1..WR-11 first, then UI-W1..W10)
- Test approach for CR-1 (recommend: unit test + manual verification on device)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source audits (priority order)
- `AUDIT-FULL-2026-06-04.md` — Aggregated audit combining code + UI/UX findings, regression matrix, executive summary
- `PLAN-FIXES-2026-06-04.md` — Detailed fix plan with effort estimates, commit patterns, acceptance criteria per fix
- `DEEP-CODE-REVIEW-2026-06-04.md` — Full code reviewer's report (187 files audited, 2 critical/11 warning/7 info)
- `DEEP-UI-REVIEW-2026-06-04.md` — Full UI auditor's 6-pillar report (47 files audited, 13/24 score, regressed from 15/24)

### Previous audits (for regression analysis)
- `audit-2026-06-04.md` — Earlier 2026-06-04 audit (UX 6.5/10, 6 issues)
- `audit-2026-06-02.md` — 2026-06-02 audit (7.0/10, 21 findings)
- `UI-REVIEW.md` — 2026-05-28 UI review (15/24, 3 priority fixes)

### Project design contracts
- `UI-SPEC.md` — Design contract (P0 violations, typeScale, spacing, radius, color tokens)
- `DESIGN_SYSTEM.md` — Design system documentation
- `AGENTS.md` — Project rules (Context7, Zustand, persistent storage, withAlpha, Pressable + active:)

### Phase context
- `.planning/ROADMAP.md` — Roadmap with Phase 15 entry
- `.planning/STATE.md` — Project state (14 phases, 13 complete, 93%)

### Phase 14 verification (regression baseline)
- `.planning/phases/14-audit-hardening/14-PLAN.md` — Phase 14 plan (5 tasks; Task 5 / WR-7 NOT done)
- `.planning/phases/14-audit-hardening/14-01-PLAN.md` — Wave 1 plan
- `.planning/phases/14-audit-hardening/14-02-PLAN.md` — Wave 2 plan

### Critical source files (read before modifying)
- `lib/_core/theme.ts` — `withAlpha()` helper, OKLCH tokens, RuntimePalette
- `lib/design-tokens.ts` — `typeScale`, `spacing`, `radius` (needs additions)
- `lib/translations.ts` — i18n keys (needs ~30 new keys for a11y)
- `lib/i18n.ts` — `t()` function API
- `components/ui/icon-symbol.tsx` — `MAPPING` object (needs extensions)
- `hooks/useTypewriter.ts` — typewriter logic (CR-1 fix target)
- `lib/editor/story-manuscript-save.ts` — manuscript save (CR-7 fix target)
- `lib/story-reader-platform.ts` — platform layer (CR-3 fix target)

### Pattern reference (positive pattern from Phase 14)
- `components/editor/properties/` (17 files) — `PropertiesPanel` 1094→97 LOC decomposition pattern
- Use this as template for any future >500-LOC file decomposition

</canonical_refs>

<specifics>

## Specific Ideas

### Pattern from Phase 14
- `PropertiesPanel` 1094→97 LOC decomposition: orchestrator + 12 per-block forms (~80 LOC each) + chrome/picker/shared/registry/types
- Apply this pattern to any file >300 LOC in this phase
- `withAlpha()` helper usage: `import { withAlpha } from '@/lib/_core/theme'`

### Specific commit patterns
- `fix(15-01): CR-N <short description>` for critical fixes
- `refactor(15-02): WR-N <short description>` for warnings
- `chore(15-03): <description>` for DX/polish

### Test patterns
- Unit tests: `__tests__/unit/hooks/useTypewriter.test.ts` (create if missing)
- Use Vitest (configured in `vitest.config.ts` + `vitest.setup.ts`)
- Mock pattern: `__mocks__/` directory + `vi.mock()` calls
- Test files use `globals: true` (no `import { describe, expect, it } from 'vitest'`)

### ESLint pattern
- `eslint.config.mjs` exists; extend with `no-restricted-syntax` rules
- Use AST selectors (e.g., `TemplateElement[value.raw=/.../]`)
- Inline disable comments allowed with justification (per `eslint-disable-next-line` pattern in existing code)

### Token additions for design-tokens.ts
```typescript
// New tokens to add in Wave 2
typeScale.documentTitle: { fontSize: 36, lineHeight: 42 }
typeScale.propertiesTitle: { fontSize: 18, lineHeight: 24 }
typeScale.headerSubtitle: { fontSize: 16, lineHeight: 22 }
headerHeight.phone: 76
headerHeight.desktop: 56
```

### IconSymbol MAPPING additions (Wave 1, CR-4)
```typescript
chevron.up: 'chevron.up',
chevron.down: 'chevron.down',
arrow.left: 'arrow.left',
arrow.right: 'arrow.right',
xmark: 'xmark',
checkmark: 'checkmark', // avoid collision with existing 'check'
plus.circle: 'plus.circle.fill',
minus: 'minus',
square.and.arrow.up: 'square.and.arrow.up',
```

### Translation keys to add (Wave 1, CR-5)
```typescript
// In lib/translations.ts (EN, UK, PL)
common.loading: 'Loading...' / 'Завантаження...' / 'Ładowanie...'
common.noRouteProvided: 'No story or scene ID provided' / '...' / '...'
splash.configured: 'Splash configured' / '...' / '...'
splash.status: 'Splash: {duration}ms, {type}' / '...' / '...'
reader.continueHint: 'Tap to advance text or make a choice' / '...' / '...'
reader.hints.back: 'Back' / '...' / '...'
reader.hints.menu: 'Menu' / '...' / '...'
reader.hints.save: 'Save' / '...' / '...'
editor.properties.closeHint: 'Close properties panel' / '...' / '...'
editor.properties.duplicateHint: 'Duplicate this block' / '...' / '...'
editor.properties.deleteHint: 'Delete this block from timeline' / '...' / '...'
editor.properties.assetFieldHint: 'Enter asset ID or tap search to browse' / '...' / '...'
editor.selectX: 'Select {category}...' / '...' / '...'
document.choice.addOption: 'Add choice option' / '...' / '...'
document.choice.removeOption: 'Remove choice' / '...' / '...'
document.choice.editOption: 'Edit choice' / '...' / '...'
document.choice.moveOption: 'Move choice' / '...' / '...'
document.dialogue.characterHint: 'Character name' / '...' / '...'
document.dialogue.lineHint: 'Dialogue line' / '...' / '...'
document.a11y.sceneTitle: 'Scene title' / '...' / '...'
document.a11y.narration: 'Narration or story text' / '...' / '...'
document.a11y.slashCommandInput: 'Type / for commands, Enter to add line' / '...' / '...'
```

</specifics>

<deferred>

## Deferred Ideas

**Tracked for future phases:**

- **3-editor deduplication** (Lego + Document + SceneComposer, ~2000 LOC overlap) — Recommended for Phase 16+ architectural review. Requires product decision on which editor is primary.
- **`use-app-store.ts` slice decomposition** (479 LOC → 5 slices) — Phase 3+ candidate. Risk: many call sites, large refactor. Could be done alongside 3-editor work.
- **`translations.ts` split by locale** (947 LOC → 3 files) — Phase 3+ candidate. Mechanical split with `locales/{en,uk,pl}.ts` + `index.ts` aggregator.
- **Component test coverage** (0 component tests currently) — Phase 4 candidate. Add `@testing-library/react-native` for PropertiesPanel, SceneManager, ReaderDisplay, SceneComposer.
- **Storybook** — Phase 4+ candidate. Useful for visual regression testing of design system components.
- **CI/CD pipeline** — Phase 4+ candidate. Add GitHub Actions: `pnpm check && pnpm test && pnpm lint`.
- **Visual screenshot capture** — Requires dev server running during audit. Out of scope for code-only audit.
- **PL (Polish) full translations** — Wave 2 WR-3 adds locale type + fallback to EN; full PL translations can be added incrementally by translators.

</deferred>

---

*Phase: 15-deep-audit-remediation*
*Context gathered: 2026-06-04 via PRD Express Path (PLAN-FIXES-2026-06-04.md)*
