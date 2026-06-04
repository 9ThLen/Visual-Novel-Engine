---
phase: 15-deep-audit-remediation
plan: 01
subsystem: beta-critical-remediation
tags:
  - critical
  - typewriter
  - theme
  - i18n
  - accessibility
  - manuscript-save
key-files:
  - hooks/useTypewriter.ts
  - __tests__/unit/hooks/use-typewriter.test.ts
  - lib/story-reader-platform.ts
  - components/ui/icon-symbol.tsx
  - lib/translations.ts
  - app/preview.tsx
  - lib/editor/story-manuscript-save.ts
  - __tests__/unit/lib/story-manuscript-save.test.ts
decisions:
  - Used textSpeedRef to let the active typewriter interval read current speed without restarting.
  - Kept story-reader platform fallbacks as null via cast so consumers must pass themed colors.
  - Used IconSymbol mappings instead of Unicode glyph command controls.
  - Moved sourceStepId deduplication outside __DEV__ and kept the warning dev-only.
metrics:
  tests: "41 files, 244 tests passed via vitest --no-cache"
  typecheck: "pnpm check passed"
  commits: 10
---

# Phase 15 Plan 01: Deep Audit CRITICAL Fixes Summary

Closed the beta-blocking critical audit items by fixing live typewriter speed, theme color contracts, icon controls, i18n/a11y strings, preview recovery UI, and production manuscript deduplication.

## Commits

| Hash | Commit |
| --- | --- |
| f80dcd93 | test(15-01): add failing test for useTypewriter mid-typing speed change |
| 3c420ae0 | fix(15-01): CR-1 useTypewriter reads textSpeed live via ref |
| 5d6b1ddf | fix(15-01): CR-2 replace hex+alpha concat with withAlpha() in 7 files |
| 5c965516 | fix(15-01): CR-3 null contract for story-reader-platform color fallbacks |
| d5b01666 | fix(15-01): CR-4 extend IconSymbol MAPPING and replace 7 Unicode glyph sites |
| 603263ad | fix(15-01): CR-5 add 27 a11y/UI translation keys + replace 21 hardcoded strings |
| 52efda97 | fix(15-01): CR-6 app/preview.tsx loading + recovery back-button |
| 1cf291d3 | test(15-01): add failing test for story-manuscript production dedup |
| 4a1fd381 | fix(15-01): CR-7 move story-manuscript dedup out of __DEV__ guard |

## Verification

| Check | Result |
| --- | --- |
| `.\node_modules\.bin\vitest.cmd run __tests__/unit/hooks/use-typewriter.test.ts --no-cache` | PASS: 3 tests |
| `.\node_modules\.bin\vitest.cmd run __tests__/unit/lib/story-manuscript-save.test.ts --no-cache` | PASS: 4 tests |
| `.\node_modules\.bin\vitest.cmd run --no-cache` | PASS: 41 files, 244 tests |
| `corepack pnpm check` | PASS |
| Hex+alpha concat grep across `components/` and `app/` | PASS: 0 matches |
| `charDelayMs(textSpeed)` grep in `hooks/useTypewriter.ts` | PASS: 0 matches |

## Deviations

- [Rule 1] Used `--no-cache` for Vitest verification because cached result writes to `node_modules/.vite/vitest/results.json` returned EPERM in this sandbox. Test execution itself passed before the cache write; no code change was needed.
- [Rule 2] CR-2 requested a `PreviewScreen.tsx` hex+alpha migration site from an older line reference. The site was already absent; the task commit documents the actual 7-file migration.
- [Rule 3] CR-3 implements the null fallback contract with a typed cast because React Native style types do not expose nullable color fields even though runtime accepts no override.

## Self-Check: PASSED

- Created `15-01-SUMMARY.md`.
- Confirmed working tree was clean before summary creation.
- Confirmed all CR-1 through CR-7 implementation commits exist on `phase-15-fixes`.
- Confirmed no `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md` edits were made.
