# ROADMAP — UI Remediation From Standalone Audit

**Source audit:** `standalone-UI-REVIEW.md`  
**Design contract:** `UI-SPEC.md`  
**Goal:** raise UI quality from 14/24 to at least 20/24 without disrupting current engine/core logic.

## Phase 01 — Icon And Copy Foundation

**Priority:** P0  
**Plan:** `.planning/phases/01-icon-i18n-foundation/PLAN.md`

Replace emoji-as-icons in primary surfaces and move touched visible strings to i18n.

## Phase 02 — Theme Token Hardening

**Priority:** P1  
**Plan:** `.planning/phases/02-theme-token-hardening/PLAN.md`

Remove hardcoded colors/fallback chains in touched UI and guarantee required runtime palette tokens.

## Phase 03 — Document Editor Visual Polish

**Priority:** P1  
**Plan:** `.planning/phases/03-document-editor-polish/PLAN.md`

Bring the Notion/Word-like document editor fully in line with `UI-SPEC.md`.

## Phase 04 — Character Creator And Sprite UX

**Priority:** P1  
**Plan:** `.planning/phases/04-character-creator-sprite-ux/PLAN.md`

Fix non-functional sprite display/picker affordance and tokenized character styling.

## Phase 05 — Feedback, Loading, And Safety UX

**Priority:** P1  
**Plan:** `.planning/phases/05-feedback-loading-safety/PLAN.md`

Add confirmations, non-blocking feedback patterns, skeleton/loading states, and platform guards.

## Phase 06 — Type, Spacing, And Radius Convergence

**Priority:** P2  
**Plan:** `.planning/phases/06-type-spacing-radius-convergence/PLAN.md`

Apply the type, spacing, and radius contract to high-traffic UI without a risky full-app rewrite.

## Phase 07 — Reader Runtime Convergence

**Priority:** P1  
**Status:** Complete (Wave 1 + Wave 2 executed)  
**Plan:** `.planning/phases/07-reader-runtime-convergence/PLAN.md`

Merge PlayMode and PreviewScreen onto the Reader/useSceneExecutor runtime path, removing duplicated step-processing logic and unsafe casts.

## Phase 08 — Post-Migration Cleanup

**Priority:** P2  
**Status:** Complete  
**Plan:** `.planning/phases/08-post-migration-cleanup/PLAN.md`

Close remaining tech debt from the block-system migration: fix pre-existing test failures, inline canonical-scene helpers, update audio-types imports, reduce story-domain dependency on Story, and update architecture docs.

## Phase 09 — Migration Finalization

**Priority:** P2  
**Plan:** `.planning/phases/09-migration-finalization/09-PLAN.md`

Finish the remaining migration cleanup: decompose the responsive reader, move audio story types to TimelineStep/canonical scene shapes, normalize importStory return type, remove Story/StoryScene imports from StoryDomain, and mark remaining legacy public APIs as deprecated.

## Phase 09.1 — Post-Migration Deferred Tech Debt

**Priority:** P3  
**Plan:** `.planning/phases/09.1-post-migration-deferred/09.1-PLAN.md`

Close remaining low-priority tech debt deferred from Phase 08/09: migrate UserSettings from lib/types.ts to user-settings.ts, consolidate audio subsystem files, check expo-localization dependency, and clean up dead code.

## Phase 10 — Security Hardening

**Priority:** P0  
**Status:** Complete (3 Waves executed)  
**Plan:** `.planning/phases/10-security-hardening/10-PLAN.md`

Address all findings from the security audit — fix critical OAuth CSRF, prototype pollution, silent migration failure, URI validation bypass, add CSP headers, rate limiting, and input sanitization improvements.

### Wave 1 — Critical/High (C-2, C-3, H-4, H-5)
- C-2: OAuth state now generated via `crypto.getRandomValues()`, stored in SecureStore/sessionStorage, validated before token exchange
- C-3: `isValidUser()` type guard added, runtime validation in `getUserInfo()` rejects malformed data
- H-4: `RESERVED_KEYS` set guards `__proto__`/`constructor`/`prototype` in `evaluateVariable`
- H-5: `migrationError` field in AppState, `MigrationErrorBanner` component added to root layout

### Wave 2 — Medium (C-1, H-1, M-3, M-6)
- C-1: `isSafeUri()` extracted and used from both `story-validator` and `asset-resolver`
- H-1: Web auth switched from `localStorage` to `sessionStorage` for user info
- M-3: CSP meta tag added to `app/+html.tsx`
- M-6: Canonical import validation — title, scene keys, timeline array, startSceneId checked

### Wave 3 — Medium/Low (H-2, M-1/2, H-3, M-5, L-3)
- H-2: In-memory sliding-window rate limiter added to `apiCall()`
- M-1/2: `sanitizeText` now strips all HTML tags; `sanitizeString` strips control chars, limits length
- H-3: `console.warn` added for no-op `sound`/`camera`/`interactive_object` handlers in executor
- M-5: Set-Cookie header values sanitized in production-aware logging
- L-3: `wiki/sri-strategy.md` documents SRI + CSP strategy for future CDN assets

## Phase 11 — Runtime Quality Gates

**Priority:** P0
**Status:** Planned
**Plan:** `.planning/phases/11-runtime-quality-gates/11-PLAN.md`

Restore project quality gates after the migration/security work: fix reader runtime regressions, make lint pass, and make the web export gate reproducible on the supported Node/Expo setup.

## Phase 12 — Code Analysis Remediation

**Priority:** P0  
**Status:** Planned  
**Plan:** `.planning/phases/12-code-analysis-remediation/12-PLAN.md`

Fix the 2026-06-01 external audit findings, ordered by complexity and user impact: DocumentSceneEditor scroll/decomposition, unsupported block UX, theme hardening, import validation, reader decomposition, and store/runtime cleanup.

## Phase 13 — Post-Audit Remaining Issues

**Priority:** P2  
**Status:** Complete (Wave 1 executed)  
**Plan:** `.planning/phases/13-post-audit-remediation/13-01-PLAN.md`

Close the 4 partially-fixed issues from `code-review-verification-2026-06-02.md` (verification of the 2026-06-01 audit): finish DocumentSceneEditor decomposition (H1), replace remaining hardcoded `rgba()` overlays (M2), add phone header overflow protection (M3), and document the `file://` allow-list decision (L1).

### Wave 1 — All 4 issues fixed
- **H1:** DocumentSceneEditor decomposed from 562 → 238 LOC (`saveDocumentSceneToRecord` extracted to `lib/document-scene-persistence.ts`; sub-components `DocumentPage`, `DocumentBlockDialogue`, `DocumentBlockChoice` extracted to separate files; 7 `accessibilityHint` preserved)
- **M2:** 5 hardcoded `rgba()` removed from `WebSidebar.tsx` (2) and `app/tabs/index.tsx` (3); replaced with `useColors()` theme tokens
- **M3:** `SceneComposerPhone.tsx` header wrapped in horizontal `ScrollView` (mirroring the existing tabs pattern at L227)
- **L1:** `file://` platform-gate documented with inline comment at `lib/story-validator.ts:28-30`; Expo FileSystem compatibility rationale added

## Phase 14 — Audit Hardening

**Priority:** P1  
**Status:** Complete (Wave 1 + Wave 2 executed)  
**Plan:** `.planning/phases/14-audit-hardening/14-PLAN.md`  
**Source audit:** `audit-2026-06-02.md` (21 findings, 7.0/10)

Resolve the 3 CRITICAL and 7 WARNING findings from `audit-2026-06-02.md` (comprehensive project-wide audit of 157 files). Fixes: PII/token logging hygiene, 12 unguarded `console.*` calls, hex-alpha hacks in 7 files, `withAlpha()` helper, decompose the new god component `PropertiesPanel.tsx` (1094 LOC), and refactor `useReaderAudio` to use a singleton.

### Wave 1 — Console hygiene, token sanitization, withAlpha, PropertiesPanel
- **CR-3 + WR-1:** 12 unguarded `console.*` calls wrapped in `if (__DEV__)` across 6 files; 2 `setTimeout` handlers refactored to `useRef`-cleared pattern
- **CR-1 + CR-2:** `app/oauth/callback.tsx:46` logs only `{ id, openId }` (no PII); `lib/_core/api.ts:153,194` logs `hasSessionToken` boolean (no token prefix)
- **WR-4 + WR-5 + C-6:** `withAlpha(color, alpha)` helper added to `lib/_core/theme.ts` (handles hex/rgb/oklch); 9 hex-alpha concatenations + 3 inline `rgba()` sites migrated
- **WR-2 + C-1:** `PropertiesPanel.tsx` decomposed from 1094 → 87 LOC; 12 per-block-type subcomponents + 4 supporting files in `components/editor/properties/`

### Wave 2 — useReaderAudio singleton
- **WR-3:** `useReaderAudio` no longer accepts `audioManager` param; `initPromise: Promise<void> | null` module-level singleton in `lib/audio-player-service.ts:30` guards `initialize()`; L298-312 useEffect deps stable
- **CR-3 (deferred):** `useReaderAudio.ts:194` `console.warn` wrapped in `if (__DEV__)`

**Re-audit expected verdict:** ≥ 8.5/10 (all 3 CRITICAL + 7 WARNING + 5 high-impact INFO findings addressed).

## Execution Order

1. Phase 01
2. Phase 02
3. Phase 03
4. Phase 04
5. Phase 05
6. Phase 06
7. Phase 07
8. Phase 08
9. Phase 09
10. Phase 09.1
11. Phase 10
12. Phase 11
13. Phase 12
14. Phase 13
15. Phase 14

## Global Verification Gate

Every phase must pass:

- `corepack pnpm run check`
- targeted unit tests
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- `gsd-code-review` on changed files

After Phase 06:

- run `gsd-ui-review`
- compare new score against `standalone-UI-REVIEW.md`
- create follow-up gaps only for findings still below 3/4

## Phase 15 — Deep Audit Remediation

**Priority:** P0  
**Status:** Planned  
**Plan:** `.planning/phases/15-deep-audit-remediation/PLAN.md`  
**Source audits:** `DEEP-CODE-REVIEW-2026-06-04.md` (187 files, 2 critical/11 warning/7 info), `DEEP-UI-REVIEW-2026-06-04.md` (47 files, 13/24 score, regressed from 15/24), `AUDIT-FULL-2026-06-04.md`, `PLAN-FIXES-2026-06-04.md`

Resolve the 4 CRITICAL, 17 WARNING, and 10 INFO findings from the 2026-06-04 deep audit. Highest-impact issues: `useTypewriter` textSpeed regression, 8 hex-alpha concat sites in `document-editor/`, hardcoded `#000000`/`#ffffff` in `story-reader-platform.ts`, Unicode glyphs violating UI-SPEC P0, and 21 hardcoded a11y strings. Phased as Critical (Beta-ready), Warnings (Production-ready), Polish (DX-hardened).

### Wave 1 — Critical fixes (~6.5h, 1-2 days) → Beta release
- CR-1: `useTypewriter` textSpeed re-read — user-visible bug
- CR-2: 8 hex-alpha concat sites in `document-editor/` + `manuscript/` — M2 regression
- CR-3: Hardcoded `#000000`/`#ffffff` in `story-reader-platform.ts`
- CR-4: IconSymbol MAPPING + 6 Unicode glyphs in SplashScreenEditor, InteractiveObjectsEditor, PreviewScreen, SceneSelector
- CR-5: 21 hardcoded English a11y strings in 10 files
- CR-6: `app/preview.tsx` dead-end error state
- CR-7: `story-manuscript-save.ts` production dedup silently dropped

### Wave 2 — Warnings (~8-10h, 3-5 days) → Production release
- WR-1: PreviewScreen audio service singleton
- WR-2: Unguarded `console.*` in `app/tabs/index.tsx`
- WR-3: `Language` type add `'pl'`
- WR-5..WR-11: Quality/consistency batch fixes (useSceneExecutor contract, conditionUtils, isValidUser, persistent-storage, etc.)
- UI-W1..W4: Inline `fontSize` → `typeScale` in document-editor
- UI-W5..W8: Magic spacing → `spacing` tokens in document-editor
- UI-W9: `SceneComposerPhone` dedupe `editor.blocks`
- UI-W10: `SplashScreenEditor` undo path

### Wave 3 — Polish + DX (~8-10h, 1 week) → Regression-proof
- ESLint rules preventing hex+alpha, unguarded console, inline fontSize regressions
- Codemod for tokenization
- `translations.ts` split by locale
- `use-app-store.ts` slice decomposition
- 2-locale vs 3-locale spec drift resolution
- Regression check script (`tools/check_regressions.sh`)

## Phase 16 - Plate Editor Migration

**Priority:** P0
**Status:** Planned
**Plan:** `.planning/phases/16-plate-editor-migration/16-00-PLAN.md` through `.planning/phases/16-plate-editor-migration/16-05-PLAN.md`

Replace the active scene editor with Plate while preserving `SceneRecord + TimelineStep` as the only persisted scene contract. The phase starts with a backup branch and an explicit decision for the installed `platejs` runtime, then locks serializer roundtrip tests around the existing Document/Plate bridge before removing remaining `useEditorStore` usage from active paths, splitting active/legacy/manuscript code, evolving the current `/document-editor` bridge into `PlateSceneEditor`, deprecating only superseded bridge modules, and updating README/AGENTS with Plate-only rules.

### Wave 0 - Plate decision and branch safety
- Create/switch to `codex/plate-editor-migration`
- Verify installed `platejs@53.1.2` API/platform support with Context7, local types, or official docs
- Confirm declared/installed Plate versions match before source edits
- Record `16-PLATE-DECISION.md`

### Wave 1 - Serializer contract and data preservation
- Test and harden the current `SceneRecord -> DocumentScene/Plate bridge -> SceneRecord` path first
- First passing test preserves `background(assetId: "bg_forest", transition: "dissolve", duration: 1000)`
- Promote new `components/editor/plate/serializers/*` wrappers only if they clarify the boundary or match the real Plate node shape
- Expand roundtrip coverage for all `BlockType` payloads

### Wave 2 - Remove Lego draft state from active paths
- `PreviewScreen` reads persisted `SceneRecord.timeline` from `useAppStore`
- `SceneManager` navigates to `/document-editor` without `useEditorStore.setScene`
- Preserve the existing `/document-editor` invariant: it already owns initial scene input loading from `useAppStore`

### Wave 3 - Active/legacy/manuscript split
- Move Lego UI to `components/editor-legacy/`
- Keep manuscript editor active and compiling
- Classify `SceneSelector`, `PlayMode`, `AssetPicker`, and `lib/editor-scene-draft.ts` as active/shared unless replacement imports exist
- Add ESLint/script boundary against legacy imports from active screens

### Wave 4 - Production Plate editor module
- Extract/evolve `components/editor/plate/PlateSceneEditor` from the existing `DocumentSceneEditor + PlateWebViewEditor` baseline
- Add Plate elements/plugins/commands/serializers
- Preserve reusable header/sidebar/inspector UI unless explicitly superseded
- Web uses real Plate if viable; native uses the chosen shared-runtime bridge if needed

### Wave 5 - Route switch, deprecation, docs
- `/document-editor` renders `PlateSceneEditor`
- Mark only superseded document-editor/vn-plate bridge files as deprecated compatibility/reference
- Update README/AGENTS to Plate-only active editing rule

Each wave includes an explicit rollback path; route/docs changes are blocked
until serializer and editor smoke checks pass.
