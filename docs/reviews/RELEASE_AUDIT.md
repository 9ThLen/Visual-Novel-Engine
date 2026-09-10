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
The same defect in `app/story-home.tsx` and `src/components/story-home/AssetUsageCard.tsx`
is fixed alongside it.

### Scene manager and manuscript opened empty

Scene records load per story on demand. Neither `src/components/editor/SceneManager.tsx`
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

### Bundled audio was silently dropped on web

Driving the reader rather than only loading it surfaced this. The console said
`Could not resolve BGM` and `Could not resolve voice` for files that are sitting
in `assets/sounds-sample/` and are listed in `src/lib/bundled-assets.ts`.

They resolve fine. `getBrowserSafeAudioUri()` then threw the result away.
A bundled asset resolves on web to a root-relative URL —
`/assets/?unstable_path=.%2Fassets%2Fsounds-sample/music-mysterious-adventure.mp3`
— and the filter accepted only `http://`, `https://`, `blob:` and `data:audio/`,
so every same-origin path became `null` and the track never played. The filter
exists to stop a native cache path reaching an `<audio>` element on a served
page; a relative path is not that, and is exactly as playable as an absolute URL.

The same rejection hit the exported player opened from disk: there
`resolveWebUrl()` resolves packaged media against `document.baseURI`, which is
`file://`, and `file://` was rejected too — on a page that is itself on `file:`,
that is its own origin and the only copy of the file that exists.

Relative references are now kept, and `file://` is kept only when the document
is itself on `file:`, so the native-cache case this filter was written for is
still rejected. Protocol-relative `//host/track.mp3` names another origin and is
rejected rather than given the same-origin benefit of the doubt.

Verified in the browser: the demo reader now fetches
`music-mysterious-adventure.mp3` (200) and `voice-guide-welcome.mp3` (206) where
before it fetched neither, and the packaged player serves two mp3s with no
warnings. The offline `file://` player no longer logs a resolution failure;
Chromium does not surface `file://` subresource requests, so that case rests on
the warning being gone and on the code path, not on an observed file read.

No test covered this: the player suite asserts the first scene renders and never
advances the reader or looks at audio.

### A voice warning that fired when nothing was wrong

`useReaderAudio` reported `Could not resolve voice` for a scene generation that
had simply been superseded, conflating a stale read with a missing file — which
is what sent this investigation looking for an absent asset that was present all
along. The BGM path above it already separates the two; voice now does the same.

### Investigated and not defects

- **Scene-graph responder warnings.** The graph view logs
  `Unknown event handler property onStartShouldSetResponder` and three more on
  web. Pan and zoom were measured against the SVG's bounding box and both work
  (drag moved it, wheel scaled it), and tapping a node still selects the scene.
  React-native-gesture-handler and react-native-svg interop noise, not a defect.
- **The reader appears not to advance.** It does. A click in the middle of the
  demo's first scene lands on an interactive-object hotspot, which is a scene
  transition rather than a dialogue advance.
- **`/story-page` says "This story is gone" for a demo story.** Correct: that
  screen renders a published release and the demos are drafts.

### Fixed after merge: the audio rejection that turned the Pages gate red

Left open in the pass above, and no longer a matter of judgement: merging the
audio fix made the deployed site play sound, which surfaced the rejection on the
live smoke and failed `Deploy to GitHub Pages` on `main` (run 34339209476).

The four SPA-fallback 404s that had been failing that gate were gone — that fix
worked. What replaced them was one line:

    The play() request was interrupted by a call to pause().

`expo-audio`'s web player discarded the promise from `HTMLMediaElement.play()`,
so every refusal escaped as an unhandled rejection: `NotAllowedError` when
autoplay is blocked, `AbortError` when a `pause()` lands first, as it does on
every crossfade. It also left `isPlaying` true after playback never started,
which is why `AudioPlayerService.resume()` would skip a track that was silent.

Patched through `patchedDependencies`, which this repository already uses for
`@expo/cli` and `react-native-css-interop`: the promise is now handled and
`isPlaying` reflects what the element actually did. Nothing in the app could
catch this — `play()` returns `undefined` there.

Verified: a cold load straight onto the reader reports zero page errors where it
reported three, advancing through scenes reports zero where it reported the
`AbortError`, audio still loads (206 and 200), and `scripts/check-deployed-web.mjs`
— the failing gate itself — passes against a local server that mimics the Pages
fallback.

### Superseded: the earlier note on this, kept for the record

Now that audio resolves, a reader opened with no prior interaction — a direct
link or a refresh straight onto the route — logs three uncaught
`NotAllowedError: play() failed because the user didn't interact with the
document first`.

The rejection is not the app's to catch. `expo-audio`'s web player is

    play() { this.media.play(); this.isPlaying = true; }

so the media element's promise is discarded, and `isPlaying` is set to `true`
even when the browser refused. `AudioPlayerService.resume()` skips a track it
believes is already playing, so a blocked track can stay silent for the rest of
the scene. An attempt to catch this from the call site was written and then
removed: `play()` returns `undefined` there, so nothing at that level can see
the rejection.

Not fixed here because both routes out are decisions rather than repairs: patch
`expo-audio` (this repo does patch dependencies, through `patchedDependencies`
in `pnpm-workspace.yaml`), or add a resume-on-first-gesture path to the audio
manager. Reaching the reader by tapping through the app activates the document
first, so ordinary use is unaffected.

### Functional pass over the core loop — no defects found

Driven through the real UI, not asserted from storage:

| Flow | Result |
| --- | --- |
| Create a story, type into the Plate editor, save, reload | Text persists |
| Reader: advance through dialogue to a choice point | Works |
| Reader: select a choice and branch | Works — the sign branch opens |
| Save a branched state to a manual slot | Records `scene_1_sign · 1 choices` |
| Restart the reader, then load that slot | Restores the branch, via `?resume=1` |
| Media library: every kind, character, folder and state facet; long-press select | Clean |
| Release gate on a brand-new story | Reports "Fix 6 things before releasing", 1 script warning |
| Mobile 390 × 844 over ten routes | Clean, no horizontal overflow |

Three earlier readings of mine were wrong and are corrected here: the reader does
advance (the advance target is the full-area "Continue reading" control, and
clicking by coordinate lands on an interactive-object hotspot instead), choices
do fire, and manual slots do appear on the Load tab.

One thing looks odd and is not a fault: a brand-new story's project page reads
`Assets 10 in the library`. `buildPlaybackAudioLibraryItems()` merges the shared
media library into the story's own for playback, so the ten sample sounds are
counted. The tile says "in the library" rather than "in this story", and the
unused-asset count beside it is filtered to the story's own gallery, so nothing
destructive is offered over another story's files.

### Backup and restore, verified end to end

The path the copy exists for — carry the work to another device — driven through
the UI on the demo story:

| Step | Result |
| --- | --- |
| `Create copy` on the project page | `The_Enchanted_Museum.vnebackup`, 89,939,840 bytes |
| Re-open it through `Import` | Reads it and reports scenes 14, characters 7, media 18 files, matching the story |
| `Import as new story` | Lands on the restored story's own page |
| Library afterwards | 3 stories, 44 scenes; the copy carries all 14 scenes, 636 words, 24 choices |

Two things that look like failures under automation and are not: `Create copy`
does nothing visible when `showSaveFilePicker` is present and rejects, because
the handler deliberately swallows `AbortError` — a cancelled save is not an
error; and `Export` opens a confirmation first rather than downloading. Both
need the fallback path or a real confirmation to exercise.

### A published story's own link reported it gone

Found by publishing a release and then following the path a reader takes, which
nothing had exercised: the demos are drafts, so `/story-page` had never been
seen with a real release behind it.

Published, the page renders correctly when reached from the showcase — and says
`This story is gone` when the same URL is opened directly or reloaded. That is
the shareable link for a published story, so the one visit it was built for was
the one that failed.

`loadPublishedReleases()` walks `storiesMetadata`, which the bootstrap on this
screen fills asynchronously. The load ran once on mount, found an empty list,
and was never re-run; arriving from the showcase worked only because the stories
were already in memory. It now re-runs when they land.

The draft case still answers `This story is gone`, which is correct. A studio
e2e test covers it — publish, then open the page by URL with no showcase visit
first — and was checked in both directions: it fails against the old code.

This also corrects an earlier entry in this file. `/story-page` refusing a demo
was recorded as "investigated and not a defect". That reading was right about
drafts and wrong to stop there: the screen was never tried with a published
story, which is the case it exists for.

## Remaining release verification

- Android/iOS native packages and real-device behavior have not been verified. Both platforms' Hermes JavaScript/assets exports pass. The Windows native executable builds, but installed application behavior and a signed release installer remain unverified. iOS native compilation and device testing require a macOS/Xcode environment.
- The follow-up Studio suite confirms the current bundled demo has sufficient publication metadata and creates a release in isolated test storage. The earlier missing-metadata observation is superseded by this result.
- The initial Expo lint wrapper failure (pnpm SQLite access) was resolved by running with access to the local cache; the standard wrapper and direct ESLint both pass. Browser tests also required execution outside the filesystem sandbox.
- No release was published and no commit was created by this audit.
- `graphify update .` completed in the follow-up when run with access to its local cache. `.graphifyignore` excludes generated E2E bundles.
- Android `:app:assembleRelease` reached project configuration but failed with `SDK location not found`; neither `ANDROID_HOME` nor `android/local.properties` supplies an SDK path. The generated local Android project currently uses the debug signing configuration for its release variant and must not be treated as a distributable signed release.

Local evidence: `.release-coverage-final.log`, `.release-ai-final.log`, `.release-player-recheck.log`, `.release-focused-recheck.log`, `.release-lint-recheck.log`, `.release-preview-build.log`; coverage output is under `test-results/release-coverage`.

Follow-up evidence: `.release-studio-final.log`, `.release-native-export.log`, `.release-expo-lint-native.log`, `.release-graphify-native.log`, `.release-android-build.log`, `.release-desktop-check.log`, `.release-desktop-build.log`. Native JavaScript exports are under `test-results/native-export`.
