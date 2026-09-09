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

## Second pass — 2026-09-09

Driving every studio route in a browser, rather than only the pages the first pass
inspected, turned up three defects. All three are fixed here.

### Media library span until React stopped it

`/story-gallery` selected the story's characters with an inline selector that built
its own `[]` fallback, so it returned a new array on every render whenever the story
had no characters. `shown` derives from it, and the effect that unticks files which
leave the view depends on `shown`, so each render scheduled another — "Maximum update
depth exceeded", repeatedly. Stories that already have characters were unaffected,
which is why the bundled demos hid it; every newly created story hit it. Fixed with a
shared empty array, the pattern `EMPTY_RELEASES` in `app/story-home.tsx` already used.
The same defect in `app/story-home.tsx` and `components/story-home/AssetUsageCard.tsx`
is fixed alongside it.

### Scene manager and manuscript opened empty

Scene records load per story on demand. Neither `components/editor/SceneManager.tsx`
nor `app/manuscript-editor.tsx` asked for that load, so both reported "no scenes yet"
for a story with fourteen of them, and only showed scenes when another screen happened
to have loaded them first. Both now hydrate. The scene manager also built its selector
during render, making a new one each pass; it is memoized on the story.

### Scene records lost to a rehydration race

The root cause under the screen above, and the more serious of the three.
`mergePersistedAppState()` replaced `sceneRecordsByStory` with the persisted map
wholesale. Scene records do not live in that blob — they have their own per-story keys,
read on demand — so a screen that finished its read before Zustand's rehydration landed
had those records thrown away. `sceneRecordHydration` is merged the other way round,
current first, so the store went on reporting the story as fully loaded and nothing ever
re-read it: the screen stayed empty until a reload. Observed directly in the browser as
0 → 14 → 0 records, the last transition on the rehydration callback. The persisted
payload still wins wherever it holds a record; records already in memory now only fill
what it does not cover. Two regression tests cover both directions.

### The GitHub Pages release gate was red on every push

`Deploy to GitHub Pages` has failed on all four recent pushes to `main`
(9c5fe69, abccbda, 343272d, 3405674). The deploy itself succeeds every time; the
`Verify deployed web app` step after it is what fails, so the site publishes and
the gate that is supposed to protect it reports failure regardless — it has not
been able to catch a real regression for some time.

The check counted its own SPA fallback as a runtime error. GitHub Pages serves a
deep link from `404.html` **with a 404 status** — that is the pattern the
deployment depends on — and the browser logs that document status as a console
error. The four deep routes the smoke walks produced exactly the four errors the
CI log reported. Reproduced locally against a server that mimics the Pages
fallback, then fixed: document errors for the routes the smoke itself asked for
are expected; a 404 on anything else still fails. Verified in both directions —
the check passes on a good build and still fails when a real subresource (the CSS
bundle) is removed. It also names the failing URL now, which is why the CI log
could only say "Failed to load resource" four times with nothing to identify.

Note: `pnpm lint` — the command CI runs — passes. An earlier note in this pass
claimed otherwise; that came from running `eslint .` directly over the whole
repo, which covers test and mock files the project's own lint script does not.
There is no lint debt to act on.

## Remaining release verification

- Native Android/iOS builds and real-device behavior have not been verified. Desktop tests validate the staged application and its offline frontend, not an installed native binary.
- Demo publication still requires cover, content rating and language metadata; the demo remains a draft.
- The local Expo lint wrapper failed while invoking the machine's pnpm installation (SQLite access error). Direct execution of the installed ESLint completed successfully. Browser tests required execution outside the filesystem sandbox.
- No release was published and no commit was created by this audit.
- `graphify update .` was rerun after the final edits, but did not finish AST extraction during this verification and was stopped. The existing graph is therefore not fully current. `.graphifyignore` now excludes generated E2E bundles; rerun the update before relying on the graph for subsequent code navigation.

Local evidence: `.release-coverage-final.log`, `.release-ai-final.log`, `.release-player-recheck.log`, `.release-focused-recheck.log`, `.release-lint-recheck.log`, `.release-preview-build.log`; coverage output is under `test-results/release-coverage`.
