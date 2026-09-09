# Release audit — 2026-09-09

The tested web build and exported player pass the checks below. This is not a certification that every platform or every possible story is free of defects.

## Fixes

- Fixed production Plate iframe startup under the exported page's CSP and host-origin messaging.
- Corrected responsive editor toolbar wrapping and preview navigation contrast over scene images.
- Extracted individual guide, librarian and reflection sprites from the original sheets, retaining transparency. Originals are preserved in `assets/source-art`; `scripts/prepare-demo-sprites.py` reproduces the crops using Pillow without redrawing.
- Restored bundled character libraries and prevented stale scene backgrounds during asynchronous loading.
- Included bundled media in legacy web exports, with path-containment checks.
- Corrected false missing-asset reports and graph reachability for interactive-object and explicit scene transitions.
- Unified editor-boundary checks in a portable Node CLI and resolved source lint warnings.

## Validation

| Check | Result |
| --- | --- |
| Full Vitest coverage run | 266 files, 2,502 tests passed |
| Coverage: statements / branches / functions / lines | 61.39% / 76.66% / 73.04% / 61.39%; configured thresholds passed |
| Follow-up diagnostics tests after final graph/asset fixes | 43 passed |
| Final focused frame, background, graph and asset regressions | 16 passed |
| AI browser workflow suite | 7 passed |
| Final exported-player and staged-desktop suite | 10 passed, including offline playback |
| TypeScript | Passed |
| Direct ESLint, source/tools/scripts, zero-warning limit | Passed |
| Production Studio export and player shell | Built successfully |
| Legacy strict demo exports | Advanced: 27 assets; basic: 13 assets; passed |
| Editor/reader/audio boundaries, player bundle and Android autolinking | Passed |
| Visual browser inspection | Desktop and 390 × 844 preview; single transparent character, readable navigation; responsive editor inspected |
| Final demo diagnostics | Health 0, no broken-asset warning, 7 characters; no browser console errors on inspected page |

The full coverage run preceded the last graph/asset-report fixes; the follow-up regressions cover those changes. The final preview-only styling change was rebuilt and inspected in the browser.

## Remaining release verification

- Native Android/iOS builds and real-device behavior have not been verified. Desktop tests validate the staged application and its offline frontend, not an installed native binary.
- Demo publication still requires cover, content rating and language metadata; the demo remains a draft.
- The local Expo lint wrapper failed while invoking the machine's pnpm installation (SQLite access error). Direct execution of the installed ESLint completed successfully. Browser tests required execution outside the filesystem sandbox.
- No release was published and no commit was created by this audit.
- `graphify update .` was rerun after the final edits, but did not finish AST extraction during this verification and was stopped. The existing graph is therefore not fully current. `.graphifyignore` now excludes generated E2E bundles; rerun the update before relying on the graph for subsequent code navigation.

Local evidence: `.release-coverage-final.log`, `.release-ai-final.log`, `.release-player-recheck.log`, `.release-focused-recheck.log`, `.release-lint-recheck.log`, `.release-preview-build.log`; coverage output is under `test-results/release-coverage`.
