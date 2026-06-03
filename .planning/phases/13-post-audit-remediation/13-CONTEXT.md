# Phase 13: Post-Audit Remaining Issues — Context

**Gathered:** 2026-06-02
**Status:** Ready for planning
**Source:** Code Review Verification Report (`code-review-verification-2026-06-02.md`)

<domain>

## Phase Boundary

This phase closes the **4 remaining PARTIALLY-FIXED issues** from the 2026-06-02 verification of the 2026-06-01 external code audit. Phase 12 (Code Analysis Remediation) addressed 7 of 11 findings; this phase is the follow-up scope.

**Source:** `code-review-verification-2026-06-02.md` — verification of `code-analysis-report-2026-06-02.md`.

**In scope:**
- **H1** — Finish DocumentSceneEditor decomposition (was 719 LOC, refactored to 562 LOC; target was ~250 LOC, actual still 562 due to a 14-LOC exported helper and inline sub-component `useMemo`s)
- **M2** — Replace remaining 5 hardcoded `rgba()` colors in 2 files (3/6 files fully fixed)
- **M3** — Add overflow protection to SceneComposer phone header (6 Pressables in `flexDirection: 'row'` without scroll/fallback for screens < 360px)
- **L1** — Document the `file://` allow-list decision (web eliminated; native platforms still permit `file://` for Expo FileSystem — INTENTIONAL)

**Out of scope:**
- The 7 FIXED issues from verification (H2, M1, M4, M5, L2, L3, L4) — already addressed
- New issues not in the verification report
- L1 implementation change — L1 is intentionally platform-gated; only documentation needed

</domain>

<decisions>

## Implementation Decisions

### H1: DocumentSceneEditor — finish decomposition

**Reported:** 719 LOC, 34 hooks (God Component)
**Current state:** 562 LOC, 9 hook calls in main body (refactor extracted `useDocumentScroll` and `useBlockOperations` custom hooks; 7 `useState`, 2 `useCallback`)
**Remaining gap:** File header claims "~250 LOC" but actual is 562 LOC. The discrepancy is:
1. A 14-LOC exported helper `saveDocumentSceneToRecord` at lines 548-562 (should move to a separate file)
2. Sub-component `useMemo`s still defined inline in the main file
3. Possibly the exported helper pulls in other concerns

**Locked decision:**
- Move `saveDocumentSceneToRecord` to `lib/document-scene-persistence.ts` (new file)
- Audit remaining inline `useMemo`s in DocumentSceneEditor and move to nearest sub-component
- Target: ≤350 LOC (not 250 — was optimistic estimate)
- Preserve all existing 7 `accessibilityHint` props (do not regress H2)

**Acceptance target:** DocumentSceneEditor.tsx ≤ 350 LOC AND `lib/document-scene-persistence.ts` exists with `saveDocumentSceneToRecord` exported

### M2: Replace remaining hardcoded `rgba()` in 2 files

**Reported:** 11 rgba() uses across 6 files
**Current state:** 6 fixed (ReaderControls 4, BlockLibraryPanel 1, MigrationErrorBanner 1); 5 remain in 2 files:
- `components/WebSidebar.tsx:140` — overlay/border color
- `components/WebSidebar.tsx:182` — overlay/border color
- `app/tabs/index.tsx:38` — utility function
- `app/tabs/index.tsx:50` — utility function
- `app/tabs/index.tsx:56` — utility function

**Locked decision:**
- WebSidebar: replace with `colors.border`, `colors.surface-2`, or new `colors.overlay` token if needed
- app/tabs/index.tsx: 3 uses are in a `utility` function (likely for shadows/glows); either move to a hook (`useBrandColor()`) or add the colors to theme tokens
- New theme tokens (if needed): add to `theme.config.js` and `lib/_core/theme.ts` RuntimePalette
- Use `useColors()` hook for component-level access

**Acceptance target:** `grep -c "rgba(" components/WebSidebar.tsx app/tabs/index.tsx` returns `0`

### M3: Phone header overflow protection

**Current state:** 6 Pressables in `flexDirection: 'row'` in `SceneComposerPhone.tsx:172-224`, 5 tabs in horizontal ScrollView at line 227 (overflow handled)
**Problem:** Header row has no overflow protection; on screens < 360px wide, buttons clip

**Locked decision:**
- Wrap header button row in a horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}` (mirror pattern from tabs at line 227)
- Alternative: switch to `flexWrap: 'wrap'` with `justifyContent: 'flex-end'` (better for accessibility)
- Do NOT change button labels or reduce count
- Verify on screen width 320px (iPhone SE 1st gen) that all buttons are reachable via scroll

**Acceptance target:** On viewport width 320px, all 6 header buttons are visible by horizontal scroll (no clipping at default state)

### L1: file:// allow-list — DOCUMENT ONLY

**Current state:** `lib/story-validator.ts:29-32` allows `file://` only when `Platform.OS !== 'web'`
**Decision status:** Intentional and acceptable for Expo FileSystem compatibility (native platforms need `file://` for local file URIs from `expo-file-system`)

**Locked decision:**
- DO NOT change implementation
- ADD inline comment explaining the security trade-off: "file:// allowed on native for Expo FileSystem compatibility — web blocks via Platform.OS check"
- UPDATE `wiki/security-audit-report-2026-05-31-rev2.md` to reflect L1 status as "Resolved with documented platform-gate"

**Acceptance target:** `lib/story-validator.ts:29-32` contains comment explaining the platform gate; wiki updated

### the agent's Discretion

- Specific theme token names (e.g., `colors.overlay` vs `colors.backdrop`) — agent picks based on existing token naming conventions
- Sub-component boundaries when moving `useMemo`s out of DocumentSceneEditor — agent picks based on cohesion
- Whether to add a unit test for the new persistence file `lib/document-scene-persistence.ts`

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source verification
- `code-review-verification-2026-06-02.md` — Verification report with status of all 11 issues (this phase's source of truth)
- `code-analysis-report-2026-06-02.md` — Original analysis report (background)

### Files to be modified
- `components/document-editor/DocumentSceneEditor.tsx` — Finish H1 decomposition
- `components/WebSidebar.tsx` — M2: lines 140, 182
- `app/tabs/index.tsx` — M2: lines 38, 50, 56
- `components/editor/SceneComposerPhone.tsx` — M3: lines 172-253
- `lib/story-validator.ts` — L1: lines 29-32 (add comment only)

### Files to be created
- `lib/document-scene-persistence.ts` — H1: new file for `saveDocumentSceneToRecord`

### Theme system reference
- `theme.config.js` — Token definitions
- `lib/_core/theme.ts` — RuntimePalette type and `useColors()` hook (lines 157, RuntimePalette type)
- `wiki/DESIGN_SYSTEM.md` — Token naming conventions

### Prior phases (patterns to follow)
- `.planning/phases/10-security-hardening/10-PLAN.md` — Pattern for platform-gated security decisions
- `.planning/phases/12-code-analysis-remediation/12-PLAN.md` — Phase 12 plan (this phase is the continuation)
- AGENTS.md — `RuntimePalette` index signature rule (always add `[key: string]: string | undefined`)

</canonical_refs>

<specifics>

## Specific Ideas

**From verification report evidence:**

- **H1 evidence:** `components/document-editor/DocumentSceneEditor.tsx:1-562` — the refactor IS real (hooks went from 34 to 9 in main body) but the file is still 562 LOC. The 14-LOC `saveDocumentSceneToRecord` at lines 548-562 is the easiest extraction. Inline `useMemo`s for sub-components may also need extraction.

- **M2 evidence:** 
  - `components/WebSidebar.tsx:140` and `:182` are the only rgba() in a 200+ LOC file
  - `app/tabs/index.tsx:38,50,56` — three rgba() uses in what the report calls "utility functions"

- **M3 evidence:** `components/editor/SceneComposerPhone.tsx:172-224` shows the 6-button header row. Tabs at line 227 already use horizontal ScrollView — mirror that pattern.

- **L1 evidence:** `lib/story-validator.ts:29-32` shows the platform gate. WebSidebar/MigrationErrorBanner in Phase 10 used a similar pattern.

</specifics>

<deferred>

## Deferred Ideas

- **M2 (full)**: 11 rgba() in audit; 6 already fixed. The 5 remaining in 2 files are the scope. Any new rgba() introduced by this phase (e.g., for new theme tokens) are out of scope and should follow the same audit pattern.
- **H1 (full 250 LOC)**: Original target was aspirational. 350 LOC is realistic given React Native component boilerplate. If further decomposition is wanted, file a follow-up phase.
- **L1 implementation change**: NOT in scope. The current `file://` platform-gate is intentional for Expo FileSystem.

</deferred>

---

*Phase: 13-post-audit-remediation*
*Context gathered: 2026-06-02 via Code Review Verification (post-audit mode)*
*Source: `code-review-verification-2026-06-02.md`*
