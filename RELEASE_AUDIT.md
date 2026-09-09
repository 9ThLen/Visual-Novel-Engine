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
| Studio release UI suite (follow-up) | 2 passed; bundled story creates a release without blockers |
| Android and iOS JavaScript/assets export (follow-up) | Both platforms exported successfully |
| Knowledge graph (follow-up) | Updated successfully: 6,309 nodes and 16,468 edges |
| Windows native shell `cargo check --offline` | Passed, including Tauri/WebView2 integration |
| Windows executable `cargo build --offline` | Built successfully in the dev profile; not a signed release installer |
| Final exported-player and staged-desktop suite | 10 passed, including offline playback |
| TypeScript | Passed |
| Direct ESLint, source/tools/scripts, zero-warning limit | Passed |
| Standard Expo lint wrapper (follow-up) | Passed with access to the local pnpm cache |
| Production Studio export and player shell | Built successfully |
| Legacy strict demo exports | Advanced: 27 assets; basic: 13 assets; passed |
| Editor/reader/audio boundaries, player bundle and Android autolinking | Passed |
| Visual browser inspection | Desktop and 390 × 844 preview; single transparent character, readable navigation; responsive editor inspected |
| Final demo diagnostics | Health 0, no broken-asset warning, 7 characters; no browser console errors on inspected page |

The full coverage run preceded the last graph/asset-report fixes; the follow-up regressions cover those changes. The final preview-only styling change was rebuilt and inspected in the browser.

## Remaining release verification

- Android/iOS native packages and real-device behavior have not been verified. Both platforms' Hermes JavaScript/assets exports pass. The Windows native executable builds, but installed application behavior and a signed release installer remain unverified. iOS native compilation and device testing require a macOS/Xcode environment.
- The follow-up Studio suite confirms the current bundled demo has sufficient publication metadata and creates a release in isolated test storage. The earlier missing-metadata observation is superseded by this result.
- The initial Expo lint wrapper failure (pnpm SQLite access) was resolved by running with access to the local cache; the standard wrapper and direct ESLint both pass. Browser tests also required execution outside the filesystem sandbox.
- No release was published and no commit was created by this audit.
- `graphify update .` completed in the follow-up when run with access to its local cache. `.graphifyignore` excludes generated E2E bundles.
- Android `:app:assembleRelease` reached project configuration but failed with `SDK location not found`; neither `ANDROID_HOME` nor `android/local.properties` supplies an SDK path. The generated local Android project currently uses the debug signing configuration for its release variant and must not be treated as a distributable signed release.

Local evidence: `.release-coverage-final.log`, `.release-ai-final.log`, `.release-player-recheck.log`, `.release-focused-recheck.log`, `.release-lint-recheck.log`, `.release-preview-build.log`; coverage output is under `test-results/release-coverage`.

Follow-up evidence: `.release-studio-final.log`, `.release-native-export.log`, `.release-expo-lint-native.log`, `.release-graphify-native.log`, `.release-android-build.log`, `.release-desktop-check.log`, `.release-desktop-build.log`. Native JavaScript exports are under `test-results/native-export`.
