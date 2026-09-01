# Release & Publishing Plan

How a finished novel leaves the editor and reaches a reader.

Status: in progress. **R0–R7 are implemented; R8 and R9 are implemented up to
the point where each needs a toolchain nobody here has** — R0–R3 complete
Channel A, R4 is the build profile every native channel stands on, R5 is the
first shippable artifact of Channel B, R6 puts it behind a button, R7 is the
build kernel every native channel submits through, R8 stages a desktop
application from the same bundle R5 publishes, and R9 stages an Android project
and proves the native cut R4 could only specify. R10 is still a proposal,
alongside the parts marked **exists** in [Current state](#1-current-state).

Neither `tauri build` nor `eas build` has ever run. Each stage says so in its own
section rather than in a footnote.

Corrections to earlier steps are recorded inline rather than edited away: R2's
object store and R4's autolinking exclusions were both marked done before they
worked, and R6's offline claim rested on a test that never left HTTP. In the same
spirit, R7, R8 and R9 each say which of their steps has never been executed, and
R9 replaces this plan's version-code design with a simpler one and says why.

---

## 0. Goal

Today the app can *author* and *play* a story, but it cannot **release** one.
"Release" means three things the engine currently has no concept of:

1. **Freezing** — a reader must play a fixed version, not the author's live
   working copy that changes mid-playthrough.
2. **Packaging** — everything the story needs (scenes, characters, audio,
   images, video, theme) must travel as one verifiable artifact, including
   media that lives in IndexedDB and is invisible to any Node script.
3. **Delivering** — through two channels the author chooses between:
   - **Channel A — the project page**: the novel appears on the engine's own
     showcase / story page, playable in place.
   - **Channel B — a standalone app**: the novel ships as its own application
     built on the engine — a web bundle, a desktop installer, or an Android app —
     containing only the reader. The engine appears once, as the launch splash.

The central design decision of this plan: **one build pipeline, two delivery
channels.** Channel A and Channel B consume the *same* release artifact. We do
not build two publishing paths that can disagree about what "the story" is.

---

## 1. Current state

### Exists

| Capability | Where |
| --- | --- |
| Single-story web bundle (CLI only) | `scripts/export-story-web.ts`, `pnpm export:story` |
| Player-mode boot flag + editor lockout | `lib/player-mode.ts`, `lib/player-mode-boot.ts`, `components/PlayerModeRouteGuard.tsx`, `app/index.tsx` |
| Production hardening of web output (CSP, frame guard, `404.html`) | `scripts/lib/harden-web-output.mjs` |
| Story graph validation for export | `scripts/lib/validate-story-graph.mjs`, `lib/document-editor/scene-graph-validator.ts` |
| Health report with severities and deep links | `lib/story-doctor.ts`, `components/story-home/StoryHealthCard.tsx` |
| Full-fidelity archive with media (`.vnebackup`) | `lib/story-backup/*` — zip via `fflate`, `manifest.json` + `story.json` + content-addressed `objects/<sha256>` |
| Consumer-facing showcase + story page + reviews | `lib/showcase/*`, `app/tabs/index.tsx`, `app/story-page.tsx`, `lib/reviews/*` |
| Per-story reader theme and layout preset | `lib/story-theme.ts`, `app/theme-studio.tsx` |
| Sub-path web hosting hook | `VNE_WEB_BASE_URL` to `experiments.baseUrl` in `app.config.js`, `lib/web-base-url.ts` |
| Native build config | `eas.json`, `android/`, `app.config.js` — present but generic: one app, no per-story identity |
| Env-driven build configuration seam | `VNE_WEB_BASE_URL` in `app.config.js` — the pattern the native identity vars extend |
| Splash screen plumbing | `expo-splash-screen` plugin, `lib/splash-types.ts` |

### Missing — the actual gap list

| Gap | Consequence |
| --- | --- |
| No release entity: no version, no notes, no immutability | The showcase renders the working copy; an edit mid-playthrough changes what the reader is reading |
| No `draft` / `published` distinction | Every local story shows up on the consumer showcase, finished or not |
| Media in IndexedDB (`idb-media://…`) cannot be packaged by the Node exporter | Any story with author-uploaded art **cannot be published today** — the exporter fails it as a device-local reference |
| Publishing requires Node + the repo | A writer using the web app cannot produce anything shippable |
| No credits / licence / content-rating / language metadata | Nothing to show on a store page; no attribution for third-party assets |
| Saves are not version-stamped | A republished story silently invalidates a reader's save |
| Bundle needs `fetch` for `player-config.json` | The exported folder cannot be opened as a plain `file://` page |
| The editor is *guarded*, not *excluded*, in player mode | Every published artifact carries an editor the reader cannot use but does download; one routing hole exposes authoring UI inside someone's novel |
| No per-story native identity, no signing keys, no build backend | There is no path from "author presses Release" to "reader installs an app" |

The IndexedDB media gap is the single hard blocker. Everything else is
additive; this one makes the existing exporter unusable for real stories.

---

## 2. Concept

### 2.1 The release artifact

A **release** is an immutable, content-addressed snapshot of one story at one
version. It is produced once, verified once, and then consumed by both channels.

Format: `.vnerelease` — the **same container as `.vnebackup`**, extended, not
reinvented. `lib/story-backup/archive.ts` already writes and reads a streaming
zip with a manifest, a JSON payload and `objects/<sha256>` blobs, with size
caps, ratio caps and hash verification. A release adds a `release` block to the
manifest and a stricter payload contract.

```
release.vnerelease
├── manifest.json      format: "vne-release", + release block (see 2.2)
├── story.json         frozen scenes, characters, audio library, theme, layout
└── objects/<sha256>   every image / audio / video byte the story references
```

Why reuse the backup container:

- content addressing means a release snapshot **shares blobs** with the working
  copy and with older releases — publishing v1.1 after v1.0 costs the changed
  media only, not a second copy of everything;
- hashing, size limits, zip-bomb guards and streaming extraction are already
  written and tested;
- `.vnebackup` import already knows how to promote `objects/` into IndexedDB,
  which is exactly what "install a release locally" needs.

Difference from a backup: a backup is *author state, restorable*; a release is
*reader state, playable and frozen*. The release payload drops snapshots,
coverage data, disabled timeline steps, editor drafts and AI metadata.

### 2.2 Release manifest (new fields over the backup manifest)

```ts
interface ReleaseBlock {
  releaseId: string;          // stable id of this exact build
  storyId: string;
  version: string;            // author-facing, semver-ish: "1.0.0"
  channel: 'page' | 'app' | 'both';
  releasedAt: string;
  notes?: string;             // changelog entry for this version
  engineVersion: string;      // built by
  minEngineVersion: string;   // refuses to play below this
  payloadHash: string;        // integrity of story.json
  presentation: {
    coverAssetId?: string;
    bannerEffect?: 'rain' | 'snow' | 'fog';
    theme?: StoryReaderTheme;
    readerLayoutPreset?: StoryReaderLayoutPreset;
  };
  publication: {
    author: string;
    languages: string[];      // e.g. ['uk', 'en']
    contentRating: 'everyone' | 'teen' | 'mature';
    contentWarnings?: string[];
    licence?: string;         // story licence, free text or SPDX
    credits?: { role: string; name: string; source?: string; licence?: string }[];
    aiAssisted?: boolean;     // disclosure, author-controlled
  };
  stats: { scenes: number; words: number; readMinutes: number; endings: number; branches: number };
}
```

`stats` is computed, never typed by hand — `lib/story-stats.ts` and
`lib/showcase/story-showcase.ts` already produce every number in it.

### 2.3 Pipeline

```
working copy  ->  preflight  ->  compile  ->  package  ->  Channel A: publish to project page
(store + IDB)     gate           freeze       .vnerelease  Channel B: build standalone app
```

Four stages, each independently testable:

1. **Preflight** (`lib/release/preflight.ts`) — the gate. Blockers stop the
   release; warnings are shown and can be accepted.
2. **Compile** (`lib/release/compile.ts`) — freeze the story into the release
   payload, resolve and hash every asset.
3. **Package** (`lib/release/package.ts`) — write/read `.vnerelease`.
4. **Publish** — a channel-specific consumer. Never re-derives story data.

### 2.4 Preflight gate

| Check | Source | Severity |
| --- | --- | --- |
| Scene graph: unreachable scenes, dangling `goto`, missing start scene | `validateSceneGraph` | blocker |
| Story doctor errors | `runStoryDoctor` | blocker |
| Story doctor warnings | `runStoryDoctor` | warning |
| Every referenced asset resolves and is portable | `lib/asset-usage.ts`, `isPortableAssetUri` | blocker |
| Title, author, description, cover present | `StoryMetadata` | blocker for a store page, warning for a bundle |
| At least one ending reachable | `lib/showcase/story-showcase.ts` | blocker |
| Theme contrast is legible | `evaluateThemeContrast` | warning |
| Content rating + languages chosen | new metadata | blocker (Channel A) |
| Total release size within limits | `STORY_BACKUP_LIMITS` | blocker |
| Version is greater than the last published version | release history | blocker |

Every finding carries `sceneId` / `stepId` so it can deep-link into the editor,
the way `StoryHealthCard` already does.

---

## 3. Channel A — publication on the project page

**Reading of the requirement.** "The project page" has two possible meanings and
they are very different in cost:

- **A1 — in-app showcase (local).** The novel is published into the engine's own
  consumer surface: `app/tabs/index.tsx` (showcase home) → `app/story-page.tsx`
  (story page) → reader. No server, no accounts. This is what the code already
  reaches for and it is the default in this plan.
- **A2 — the project's public web catalog (hosted).** A real catalog other people
  browse over the internet, backed by Supabase. This needs accounts, storage
  quotas, moderation, abuse reporting and a legal surface. It is a separate,
  much larger project — see [R10](#r10--remote-catalog-a2-separate-decision).

A1 is a complete, shippable product on its own, and A2 is strictly built on top
of it (the same release artifact gets uploaded).

**Decided:** build A1 in full now; A2 becomes a separate decision with its own
plan once A1 is shipped (stage [R10](#r10--remote-catalog-a2-separate-decision)).

### A1 behaviour

- Studio (`app/editor.tsx`, `app/story-home.tsx`) shows **all** stories, drafts
  included. The showcase (`app/tabs/index.tsx`, `app/story-page.tsx`) shows
  **only published releases**. A draft is invisible to the reader-facing surface.
- Publishing writes an immutable snapshot; the author keeps editing the working
  copy freely. The showcase does not change until the next release.
- The story page gains: version and release date, changelog (all versions),
  credits, content rating and warnings, languages, licence, and a
  **"Get as app"** action that hands over to Channel B.
- The reader launches the **release snapshot**, not the working copy
  (`lib/reader-launch.ts` gains a `releaseId`).
- Save slots are stamped with `releaseId` + `version`. Opening a save from an
  older release offers *continue anyway* / *restart* with an honest explanation,
  rather than crashing on a scene id that no longer exists.
- `Unpublish` removes it from the showcase and keeps the artifact. `Republish`
  restores it. Nothing is silently destroyed.

### A1 storage

Releases persist through `createPersistentStorage`, which matters for a
non-obvious reason: `lib/web-media-cleanup.ts` finds live media by scanning
persisted values (`collectReferencedMediaKeys`). A release snapshot stored that
way keeps its media alive automatically. A release stored anywhere else would
have its art garbage-collected out from under it after the 7-day grace window.
This is a hard requirement, not a convenience.

---

## 4. Channel B — standalone application

Four tiers, increasing in cost. **All four are in scope**: B1 portable web
bundle, B2 export from inside the app, B3 desktop installer (Tauri), B4 Android
player app.

Everything below shares one prerequisite — B0.

### B0 — the player build profile

The release target is *the engine with nothing but the reader in it*. Today
`components/PlayerModeRouteGuard.tsx` **guards** the editor at runtime: the
editor code still ships, it is merely unreachable. For a downloadable app that is
the wrong shape twice over — it inflates every artifact with an editor nobody can
open, and it leaves a class of bug where a routing hole exposes authoring UI
inside someone's published novel.

So the player is a real build profile, not a runtime flag. Removing *routes* is
only the first of four cuts, and it is the least important one:

**1. A committed `app-player/` root, not a generated copy of `app/`.**
Thin route wrappers over the reader screens the two roots share. Generating the
root at build time looks cheaper and is worse: a generated tree is invisible to
type-checking, to review and to the boundary tests, and it silently inherits
whatever `app/` grows next. Selected through the `expo-router` config plugin's
`root` option (verified present in the installed `expo-router@6`: `withRouter`
forwards it to `extra.router`), not through the `EXPO_ROUTER_APP_ROOT`
environment variable, which is an implementation detail.

The cost is honest duplication: `app-player/` drifts from `app/` unless someone
notices. The wrappers keep the duplicated part to a few lines per route, and the
bundle test below is what actually catches drift.

**2. Its own minimal `_layout`.** The current one mounts `StoryAutoSave`, the
migration banner and the cross-tab machinery. A published novel has no second tab
to conflict with, no legacy store to migrate and nothing to auto-save on the
author's behalf. None of that ships.

**3. A store cut, and it needs a named mechanism.** `stores/use-app-store.ts`
composes seven slices and the reader pulls all of them. Listing the slices the
player keeps is not enough, because the player still needs story and scene data —
just **read-only**. "Drop the story slice" would break the reader.

The mechanism, chosen rather than left open: **a store facade with two
implementations.** Reader screens import `stores/player-store` (or the shared
selector module), which resolves to the full authoring store in the editor build
and to a read-only composition — playback, saves, preferences, libraries, plus
scene and metadata *readers* with no mutators — in the player build. A Metro
alias in the player profile performs the swap. The alternative, threading a flag
through the existing store, keeps the authoring code in the graph and defeats the
point.

**4. A native-module and permission cut — a dependency problem, not a config
one.** `metro-blocklist.js` only blocks *JavaScript* resolution, and removing a
plugin from `app.config.js` does not unlink anything: Expo autolinks from what is
**installed**, so `expo-image-picker`, `expo-document-picker` and
`expo-notifications` follow the player into the APK straight out of
`package.json`. What actually removes them:

- `expo.autolinking.android.exclude` in the staged project, or a reduced
  dependency manifest for that project;
- `android.blockedPermissions` for anything a transitive dependency still
  declares;
- a test asserting the output of `expo-modules-autolinking resolve`, because this
  is exactly the kind of exclusion that silently stops working.

A novel that asks to read your storage is a novel nobody installs.

Blocklist patterns for editor-only trees (`components/editor/`,
`components/document-editor/`, `components/vn-plate-editor/`,
`components/ai-chat/`, `components/media-library/`, `lib/ai/`) still apply —
`metro-blocklist.js` already exists and already documents the anchoring trap that
once broke CI, so extend it rather than inventing a second mechanism.

**Verification is measured, not asserted.** A boundary test in the spirit of
`tools/check-editor-boundaries.sh` proves no editor entry point is reachable from
the player root; and the reported numbers are the **JS bundle, the APK and the
AAB**, not the Metro bundle alone. `platejs`, the AI bridge client and the media
library UI are a large share of the current build and none of them belong in a
novel — but the size claim only counts once it is measured on a release
artifact.

The runtime guard stays as defence in depth for the web bundle, which is built
from the same profile but can still be served by a misconfigured host.

### B1 — self-contained web bundle (upgrade of what exists)

The current exporter is 80% of this. What it needs:

1. **Accept a release.** `--release <file.vnerelease>` alongside today's
   `--story <id|path>`.
2. **Emit media as files.** Write `objects/` out as `media/<sha256>.<ext>` and
   generate an asset map `{ "idb-media://<id>": "media/<sha>.png" }`. This is
   what unblocks author-uploaded art. Data URIs stay supported but stop being
   the only option — a 40 MB inline JSON is not a viable delivery format.
3. **Runtime resolution.** `lib/asset-resolver.ts` consults the release asset
   map when player mode is active, before it tries IndexedDB.
4. **Inline the boot config.** Emit `window.__VNE_PLAYER_CONFIG__` into
   `index.html` and have `lib/player-mode.ts` read the global first, falling
   back to today's `fetch`. Consequence: the exported folder plays by
   double-clicking `index.html` from `file://`, where `fetch` is blocked. Media
   loads as relative paths, which `file://` allows.
5. **Sub-path hosting.** Already possible via `VNE_WEB_BASE_URL`; document it and
   add `--base-url` to the exporter so GitHub Pages project sites work.

Output: a folder that runs on any static host, in itch.io's zip upload, or from
a USB stick.

### B2 — "Export as app" from inside the app, without Node

A writer in the browser must be able to produce B1's output. The browser cannot
run `expo export`, so the build is split:

- The engine's own web build (`scripts/build-web.mjs`) also emits a versioned
  **player shell**: `player-shell-<engineVersion>.zip` — the compiled player
  with no story in it.
- In the app: fetch the shell → unzip with `fflate` (already a dependency) →
  inject the boot config and `media/` → re-zip → download.

The app already zips and unzips this exact way for `.vnebackup`, so this is
assembly, not new machinery. The shell must be version-matched to the running
engine, and the export refuses to proceed on mismatch rather than shipping a
player that cannot read its own payload.

### B3 — desktop application (Tauri, in scope)

The B1 output is already a working offline app via `file://`; a desktop build
turns it into something a reader installs, with a real window title, icon and
Start-menu entry.

**Tauri v2** wraps the B1 folder as-is — it serves the bundle from an embedded
asset protocol, so nothing in the engine changes. Installers land around 5 MB
against Electron's ~80 MB, which matters when a novel's own media is already the
bulk of the download.

What it costs:

- a Rust toolchain on the build machine and in CI (`tools/desktop-shell/`
  holding a template `tauri.conf.json` + `src-tauri/`);
- Windows and Linux artifacts build on their own runners; macOS additionally
  needs an Apple Developer ID to avoid Gatekeeper warnings, so an unsigned
  `.app` is the honest default until someone buys one;
- per-story identity (`productName`, `identifier`, `version`, icon) generated
  from the release manifest — the same generation step B4 needs, written
  once here.

Explicit non-goals for B3: auto-update, code signing, store submission.
A downloadable installer per release is the deliverable.

`window.__VNE_PLAYER_CONFIG__` from B1 is what makes this cheap: the Tauri
webview has no HTTP origin to `fetch` from, exactly like `file://`.

### B4 — Android player app (in scope)

**The target.** The author starts a release inside the app, picks Android, and
gets an installable application that does one thing: play their novel. No
library, no editor, no other story. The engine appears exactly once, as the
launch splash.

#### The constraint that shapes everything

An APK cannot be produced by the app itself. Building one needs Gradle, the
Android SDK and a JDK, and the result must be **signed** — none of which exists
in a browser, and none of which a writer should have to install. The trick that
works for the desktop and web tiers (fetch a prebuilt shell, inject the story,
re-zip) does not carry over: an APK's package id, app name and icon live in
compiled binary resources (`AndroidManifest.xml`, `resources.arsc`), and any
edit invalidates the signature.

There is a second constraint underneath it. EAS Build is not an API the browser
can call: `eas build` first assembles the project locally, uploads it as a
tarball, and only then creates the job. A browser-side "EAS adapter" cannot do
that, and it should not try — an Expo personal access token is a password that
acts on everything the account can reach, and it has no business being pasted
into a web page.

So the honest shape is: **the app authors the build; a local helper stages and
submits it; EAS executes it.**

```
editor (browser)
  └─ .vnerelease + build request
       └─ local helper: verify payloadHash → stage player project →
          generate static asset requires → write icons/splash → eas build
               └─ EAS: compile + sign
                    └─ helper: verify artifact → hand back APK/AAB
```

**The helper is not a new burden.** This project already ships `tools/ai-bridge`:
a local Node process the web app pairs with over an authenticated WebSocket. The
build helper reuses that *process and pairing model* — though not its protocol,
which cannot carry a release archive (see [R7](#r7--build-service-eas-only)). And
the author already runs Node: the README's entire quick start is
`corepack pnpm dev:web`.

**"One button" is true from the second build onward, not the first.** EAS-managed
credentials may require an interactive setup the first time, so the honest v1
onboarding is:

1. check for a compatible EAS CLI;
2. `eas login`;
3. `eas init` for this novel's project;
4. a one-time interactive `eas credentials` / `configure-build`;
5. every later build: `eas build --freeze-credentials --json --no-wait`, driven by
   the helper.

Steps 1–4 happen once per novel, in the author's own terminal, where the
credentials belong. Only step 5 is the button. Claiming otherwise would mean the
first release fails in a way the UI cannot explain.

**One builder for v1.** EAS only. GitHub Actions and local Gradle stay behind the
interface as later implementations, because each is a separate credential model
with its own failure modes, and three half-proven paths are worth less than one
that demonstrably produces an installable, updatable app.

| Builder | Author needs | Status |
| --- | --- | --- |
| **EAS Build**, via the local helper | Node (already required) + `eas login` once | **v1** |
| **GitHub Actions** | A repo + a token held by the helper | Later — same interface |
| **Local Gradle** | Android SDK + JDK 17 | Later — no account, no queue, offline |
| **Hosted broker** | Nothing | Only if the studio ever ships to users who don't run Node; it means the project pays for and controls every build |

#### EAS project ownership

`app.config.js` hardcodes one `extra.eas.projectId` — the engine's own. An
author's EAS account has no access to it, so builds must not run against it.

**One EAS project per novel, in the author's own account.** The helper runs
`eas init` in the staged project on the first Android release and stores the
resulting `easProjectId` in that story's native identity. The engine's
`projectId` becomes overridable (`VNE_EAS_PROJECT_ID`) so the staged project
never inherits it.

The alternative — an engine-owned broker that pays for and owns every build —
concentrates cost, credentials and legal responsibility for other people's
content in this project. That is an A2-scale decision, and it is not the default.

#### Native identity — created once, then immutable

Not re-derived per build. Derived values drift: an author renames themselves or
retitles the novel, the sanitizer produces a different string, and Android sees a
different application.

But "immutable" cannot cover the whole record — an earlier draft put a
per-release counter and two values that do not exist until the first build into
one read-only object. Three records, by lifetime:

```ts
interface NativeAppIdentity {     // minted once, then immutable
  packageId: string;              // from storyId — never from author or title
  easOwner: string;
  easSlug: string;                // story-derived, not the engine's constant slug
  easProjectId?: string;          // unknown until `eas init`
  sideloadCertSha256?: string;    // unknown until credentials exist
}

interface AndroidBuildState {     // mutable, per story
  nextVersionCode: number;
  lastBuildId?: string;
}

interface BuildRequest {          // per build
  target: 'apk' | 'aab';
  versionCode: number;
}
```

`distributionMode` belongs to the request, not the identity: one novel can ship
both a sideload APK and a Play AAB. And the three Android certificates are
distinct things that must not share a field — the sideload signing certificate,
the Play upload certificate, and the Play app-signing certificate.

**`versionCode` is reserved atomically before submit and never returned on
failure.** Reusing a code after a failed build produces two different artifacts
claiming the same version. Two concurrent requests for one novel must receive
different codes — an acceptance test, not an assumption.

`app.config.js` currently carries one constant `slug`; the staged project needs a
story-derived one alongside its own `projectId`.

Renaming the story changes the visible app name and nothing else — also an
explicit acceptance test.

The staged build reads it as env, the way `app.config.js` already reads
`VNE_WEB_BASE_URL`: `VNE_PLAYER_APP_ID`, `VNE_PLAYER_APP_NAME`,
`VNE_PLAYER_VERSION`, `VNE_PLAYER_VERSION_CODE`, `VNE_PLAYER_ICON`,
`VNE_EAS_PROJECT_ID`.

**`versionCode` needs the repo's own EAS config to stay out of the way.**
`eas.json` sets `cli.appVersionSource: "remote"`, which makes EAS's server state
authoritative and would silently ignore anything derived from the release
manifest. The staged player project therefore carries **its own `eas.json`** with
`appVersionSource: "local"`, leaving the engine app's config untouched.

**Two build profiles, not one** — a single profile cannot emit both formats:

- `player-apk` — `android.buildType: "apk"`, for sideloading;
- `player-aab` — `android.buildType: "app-bundle"`, for a Play listing.

#### Getting the release inside the APK

`VNE_PLAYER_RELEASE` as a path is not enough: Metro bundles assets it can see
through a **static** `require`, and an arbitrary environment path is invisible to
it. The release would simply not be in the APK.

The helper therefore stages before it builds:

1. verify the `.vnerelease` against its `payloadHash` — a corrupt archive must
   fail here, not after twenty minutes of cloud build;
2. extract `story.json` and the media objects to the staged project's disk,
   **streamed, never held in memory**;
3. generate `generated/player-assets.ts` — a real module of static `require`
   calls, one per media object, plus the release payload;
4. write the icon, adaptive icon and splash PNGs from the story cover and the
   engine splash source;
5. write the staged `app.json` / `eas.json` from the native identity, with
   `expo.autolinking.android.exclude` and `android.blockedPermissions` doing the
   native cut that dropping plugins alone does not;
6. hand EAS CLI a **deterministic staged directory** — the CLI creates and
   uploads the build archive itself, so the helper must not build its own
   tarball.

`eas build:inspect --stage archive` is the test that no editor code reached the
upload: it materializes exactly what would be sent.

The same rule applies upward: a 150 MB release must never be unzipped in a
browser tab or on a phone through `fflate`. In-memory unpacking holds several
copies of every asset at once. Staging happens on disk, at build time — which
also bounds what [B2](#b2-export-as-app-from-inside-the-app-without-node) can
honestly offer for large novels.

At runtime `lib/player-mode.ts` reads the release from the generated module
through `expo-asset`, and the media map resolves to bundled assets. Media travels
**inside** the APK — a novel that needs the network to show its own art is not an
app.

#### Signing keys — the part that bites later

Android refuses to install an update signed with a different key than the
installed version. A per-story keystore therefore has to survive for the life of
the story, across machines and browser profiles.

Two keys that get confused, and the difference decides how bad a loss is:

- the **app signing key**, which signs what the device installs;
- the **upload key**, which only authenticates uploads to Play.

Under Play App Signing, Google holds the app signing key and a lost *upload* key
can be reset. **For a sideloaded APK there is no such escape hatch:** lose that
key and every already-installed copy is stranded — the reader must uninstall
(losing their saves) before they can take an update. Since sideloading is our
default distribution, the keystore is the most fragile artifact in the whole
pipeline.

- **EAS path (v1):** EAS holds the credentials per project and reuses them. The
  author's own Expo account owns them, which is also who should own them.
- **Local / CI path (later):** generate the keystore on the first Android
  release, hand the author the `.jks` and its password, and say plainly what
  losing it costs.

**Correction to an earlier draft:** it claimed a mismatched fingerprint would be
refused *before* submission. With EAS-managed credentials there is no stable
non-interactive way to read the fingerprint ahead of a build, so that promise
cannot be kept. The check runs **after the artifact comes back** — the engine
compares the signing certificate of the produced APK/AAB against the stored
`sideloadCertSha256` and refuses to hand over a mismatched artifact. A genuine
pre-submit check is possible only by managing the keystore locally, which is the
trade-off that would come with the local path.

Never store a private key in IndexedDB.

#### Distribution

- **Default: sideload APK.** The author gets a file to hand out, host, or put on
  itch.io. No account, no review, no fee. Android's "install unknown apps" prompt
  is the cost, and the docs say so plainly.
- **Play Store: the author's own listing, on their own account.** We generate the
  AAB and the metadata checklist; they own the Play Console ($25 once), the
  privacy policy, the content-rating questionnaire and the target-API deadlines.

Publishing readers' novels under the engine's own Play account would make this
project the publisher of other people's content, with the moderation and legal
exposure that implies. That is an A2-scale decision, not a side effect of a
build button.

#### Size

The artifact carries the engine plus all the story's media. The limits differ by
route, and they are often quoted wrongly — including once in an earlier draft of
this document:

| Route | Ceiling |
| --- | --- |
| **Sideloaded APK** | No platform limit at all |
| **Play, legacy APK** | 100 MB |
| **Play, AAB — one device's download** | 200 MB compressed (base + config APKs) |
| **Play, AAB — base module upload** | 500 MB |
| **Play + asset packs — one pack** | 1.5 GB |
| **Play + asset packs — modules + install-time packs** | 4 GB cumulative |
| **Play + asset packs — on-demand / fast-follow** | 30 GB combined (34 GB overall) |

Two things worth separating. The **200 MB** figure is the per-device download for
an AAB, not the base module's limit — the base module's own ceiling is 500 MB.
And 200 MB is *both* things at once, which is a common source of confusion in
either direction: it is a real ceiling — an app above it must use Play Asset
Delivery or Play Feature Delivery — **and** the threshold past which Play warns
anyone installing over mobile data.

**Measuring an AAB is not `ls -l`.** Play's limits are on the compressed download
size it generates, not on the `.aab` file. The post-build gate uses
`bundletool get-size total` (or the build's own size report); comparing raw file
bytes against a download limit would be measuring the wrong number.

The B0 player profile removes the editor's share; preflight estimates the
artifact size from the release manifest and **warns**. It does not block: an
estimate made before compilation cannot be trusted to refuse a build. The hard
gate is after the build, against the actual APK/AAB, where the number is real.

#### When the novel is genuinely bigger than 200 MB

In order of what to reach for first:

**1. Compress the media (usually the whole answer).** A visual novel that
overruns 200 MB is nearly always carrying unoptimised PNG and WAV. WebP or AVIF
for stills, Opus or AAC for audio, and sanely-encoded H.264 for video routinely
cut a novel three to five times over with no visible loss.

The engine's part in this is **measurement, not re-encoding**: preflight names
the largest assets and the totals, and the author re-exports them from whatever
tool made them. Building a transcoder into the release pipeline was considered
and rejected — [VIDEO-PLAN.md](VIDEO-PLAN.md) already decided against shipping
ffmpeg, and a codec pipeline needs a specification of its own.

**2. Sideload, and stop worrying.** There is no ceiling. This is already the
default distribution, and for a large art-heavy novel it is the honest choice:
the reader downloads a file and installs it. What they give up is Play discovery
and automatic updates, not capability.

**3. Remote media with a first-run download and cache — the chosen direction.**
Ship the story and light assets inside the app; fetch the heavy media once and
cache it to the filesystem. Far cheaper than asset packs, works for sideload and
Play alike, and `lib/asset-resolver.ts` already resolves remote URLs. The costs
are real: the novel needs hosting, and the first launch needs a connection —
after which it is offline like any other.

**Deferred, because there is no hosting at this stage.** Not abandoned: this is
what oversized novels are expected to use once hosting exists, so the design
below keeps the door open at near-zero cost today.

*What has to stay true now so this stays cheap later:*

- **Objects are addressed by hash, and nothing may assume they are local.** A
  remote store is then `<baseUrl>/objects/<sha256>` — the same names the
  `.vnerelease` manifest already carries, with size and MIME type per asset. The
  manifest is already the index a CDN needs; it just has to not grow an
  assumption that every object ships inside the artifact.
- **One resolution seam.** R5 introduces the release asset map and its hook in
  `lib/asset-resolver.ts`. A remote object store must be able to arrive as one
  more source behind that seam, not as a second resolution path threaded through
  the reader. This is the part that is genuinely expensive to retrofit, and the
  only thing worth being careful about today.
- **No speculative manifest fields.** The container is already versioned
  (`containerVersion`, `schemaVersion`) and validated in one place, so an
  `assetDelivery` discriminator can be added when it is actually implemented.
  Adding it now would be a field nothing reads.

*Infrastructure note:* this needs exactly what [R10](#r10--remote-catalog-a2-separate-decision)
needs — an object store with a CDN in front. If the hosted catalog is ever built,
remote media comes along at a fraction of its own cost. Sequencing them together
is worth more than doing either alone.

**4. Play Asset Delivery**, if a Play listing is genuinely required at a size the
route above cannot serve. This is the official way past 200 MB and it goes a long
way — 4 GB with install-time packs, far more on demand. It is also a real piece
of engineering, not a build flag:

- media must be restructured into asset packs rather than bundled assets, so the
  generated static-`require` module from the staging step **does not apply** —
  packs live outside the bundle;
- assets are located at runtime through the Play Asset Delivery API, which is a
  native module Expo does not ship: a custom module plus a config plugin, plus a
  third resolution path;
- install-time packs need roughly twice their size free on the device to install;
- it only works through Play, so it buys nothing for sideloading.

Given options 1–3, this is unlikely ever to be needed. Left here so the decision
is on record rather than rediscovered.

#### Branding

`expo-splash-screen` is already configured. The engine splash is the fixed first
frame of every native player build — this is the attribution, and it replaces the
removable "Made with" mark proposed earlier for web. The author's own title card,
if they want one, plays after it through the existing `SplashScreen` type in
`lib/splash-types.ts`.

Two practical notes: the native splash needs its **own engine PNG** staged into
the player project, separate from the story cover that becomes the icon; and it
must be verified on a **release APK**, because a development build does not
reproduce splash behaviour faithfully.

---

## 5. Implementation plan

Stages are ordered so that each one is independently useful and independently
verifiable. R0–R3 deliver a complete Channel A (A1). R4 strips the engine down to
a player. R5–R6 deliver the web tiers, R7–R9 the native ones. R10 is the only
deferred stage.

Two ordering rules that matter:

**R4 lands before any native build.** Sizing an APK that still contains the
editor measures the wrong thing, and every size budget downstream would be built
on that number.

**No stage's acceptance criteria may depend on a later stage.** An earlier draft
violated this twice — R4 required APK/AAB measurements and R7 required a real EAS
build, but the staged Android project that both need only appears in R9, so
neither could be accepted until R9 shipped. The boundaries are now: R4 proves the
JS and autolinking cut, R7 proves the job kernel against a fake builder, R9 is
the first stage that touches EAS and a device.

### R0 — Release domain core ✅

*No UI. Pure modules, unit-tested in isolation.*

- `lib/release/types.ts` — `ReleaseBlock`, `ReleaseManifestV1`, `ReleasePayloadV1`, limits.
- `lib/release/manifest.ts` — parse/serialize/validate, mirroring `lib/story-backup/manifest.ts`.
- `lib/release/version.ts` — version parsing, ordering, next-version suggestion, release id generation (`lib/id-utils.ts`).
- Tests: `__tests__/release/manifest.test.ts`, `version.test.ts`.

**Done when:** a hand-written manifest round-trips and every malformed field is rejected with a specific error.

### R1 — Preflight gate ✅

- `lib/release/preflight.ts` — aggregates `runStoryDoctor`, `validateSceneGraph`,
  `computeStoryStats`, `evaluateThemeContrast`, asset portability, metadata
  completeness, size estimate. Returns `{ blockers, warnings, stats, estimatedBytes }`.
- `components/story-home/ReleaseChecklistCard.tsx` — rendered on `app/story-home.tsx`
  next to `StoryHealthCard`, reusing its finding rows and deep links.
- New metadata fields on `StoryMetadata`: `contentRating`, `languages`,
  `contentWarnings`, `licence`, `credits`, `aiAssisted` — all optional, all
  normalized in `normalizeStoryMetadata` so old stories stay valid.
- i18n keys in `lib/translations.ts` (en + uk).

**Done when:** a deliberately broken demo story lists its blockers, and a good
one reports "ready to release".

### R2 — Build and store a release ✅

- `lib/release/compile.ts` — freeze the payload; reuse `lib/story-backup/capture.ts`
  for asset collection and `lib/story-backup/hash.ts` for hashing; strip
  editor-only data and disabled steps.
- **Packaging is pass-through. No transcoding.** An earlier draft of this plan
  put a release-time media pass here; that was wrong. [VIDEO-PLAN.md](VIDEO-PLAN.md)
  has already decided against bundling ffmpeg — playback is `expo-video`, the
  author imports a finished MP4, and re-encoding, if it is ever needed, belongs
  on a backend in a separate project. A codec pipeline also needs its own
  quality, capability and format specification, which is a project rather than a
  bullet.
- What R2 does instead: **report**. Per-asset and total size in the preflight
  result, with the largest offenders named, so an author can see that four
  hundred megabytes of WAV is why their novel will not fit. Automated
  optimization is worth revisiting only after R9 produces real APK/AAB
  measurements to justify it.
- `lib/release/release-storage.ts` — persist the release index and snapshots via
  `createPersistentStorage` (see [A1 storage](#a1-storage)). **One object store
  keyed by SHA-256, plus one manifest per release.** Content addressing describes
  the naming; it does not by itself deduplicate — the shared store is what makes
  v1.1 cost only its changed media, and a per-release copy of the objects would
  quietly undo it.
- Store: `releasesByStory` in `stores/use-app-store.ts` + `publishRelease`,
  `unpublishRelease`, `deleteRelease` actions.
- UI: publish sheet on `app/story-home.tsx` — version, notes, channel, preflight
  result, confirm.

**Done when:** publishing twice produces two immutable versions that both still
play, and clearing the editor's working copy does not damage either.

> **Corrected 2026-08-30.** R2 was marked done without the object store above.
> Publishing hashed the media and kept only the manifest, on the reasoning that
> the media library still held the bytes. It does — until the author replaces a
> picture, and then a release that is supposed to be immutable can no longer be
> exported at all. The store now exists (`lib/release/object-store.ts`), keyed by
> SHA-256 and reference-counted so two versions share every unchanged file and
> deleting one takes only what nothing else needs. Publishing on a device that
> will not store blobs still succeeds and falls back to the library, which is
> what every release did before.

### R3 — Channel A: the showcase publishes releases ✅

- `lib/showcase/showcase-adapter.ts`: source becomes published releases, not
  `storiesMetadata`.
- `app/tabs/index.tsx`, `app/story-page.tsx`: version, changelog, credits,
  rating, languages, "Get as app".
- `lib/reader-launch.ts` + `app/reader.tsx`: launch by `releaseId`.
- `SaveSlot` gains `releaseId` + `version`; mismatch dialog on load.
- Studio surfaces publication state per story: *draft* / *published v1.2* /
  *unpublished changes*.

**Done when:** editing a published story changes nothing on the showcase until
the author publishes again, and an in-flight save survives a republish or
explains itself.

### R4 — Player build profile — **implemented**

- `app-player/` — committed, thin route wrappers over the shared reader screens,
  with its own minimal `_layout`. Selected via the `expo-router` plugin's `root`
  option (`extra.router.root`), so Expo Router crawls only this directory and the
  studio's routes are never required into the bundle.
- Store cut: `stores/use-app-store.player.ts` composes playback, preferences,
  saves and a new **scene *read*** slice. The story, snapshots, libraries,
  releases and scene-*write* slices are out of the graph. Metro substitutes it
  for `@/stores/use-app-store` — substituted rather than blocked, because every
  reader screen imports that path and blocking it would only break the build.
- `metro-blocklist.js` — `createPlayerBlockList()` refuses the authoring trees
  outright in the player profile.
- `tools/check-player-bundle.mjs` — walks the module graph from `app-player/`,
  applying the same store substitution, and fails on any authoring module,
  reporting the **import chain** rather than the filename.
- `player-profile.js` — one description of the profile, shared by `app.config.js`,
  `metro.config.js` and the checker. Earlier drafts kept three copies and they
  drifted.
- Native audit: the player config drops the `expo-document-picker` and
  `expo-image-picker` plugins and sets `blockedPermissions`, so the merged
  manifest loses camera, microphone, storage, media and notification permissions
  even when a transitive dependency declares them. `expo config` confirms
  `expo-audio` still requests `RECORD_AUDIO` and that the block list strips it.

> **Corrected 2026-08-30.** This step also claimed to exclude those modules from
> Android autolinking, and it did not. `expo-modules-autolinking` reads its
> options from `package.json` under `expo.autolinking` and from CLI flags; it
> never looks at the Expo app config. The exclusions sat in `app.config.js`,
> `expo config` echoed them back, and `expo-modules-autolinking resolve -p
> android` returned the same **31 modules** with and without the player profile.
> Checking that the value was written was mistaken for checking that it had an
> effect.
>
> They cannot move to this repo's `package.json` either — the studio build shares
> it and needs the pickers. So the list is a specification
> (`playerAutolinkingPackageJson()` in `player-profile.js`) applied by the staged
> project R9 produces, and `pnpm check:player-autolinking` runs real autolinking
> to prove every name is a module this project links and that excluding them
> removes those four and nothing else. **The native module cut is specified and
> verified, not yet applied.**

**Measured** (`expo export --platform web`, same machine, same commit):

| | entry bundle | total JS | chunks |
|---|---|---|---|
| studio | 5 030 584 B | 6 098 425 B | 7 |
| player | 2 879 117 B | 3 931 453 B | 4 |
| | **−42.8 %** | **−35.5 %** | |

Reachability from the router root: **406 → 209 modules, 42 → 28 packages**. The
packages the player no longer contains include `expo-image-picker`,
`expo-document-picker`, `expo-secure-store`, `expo-crypto`, `expo-sharing`,
`expo-linking`, `@imgly/background-removal`, `@supabase/supabase-js`,
`tus-js-client`, `react-native-svg`, `fflate`, `fast-sha256` and `zod`. Grepping
the built player bundle for `document-editor`, `createStorySnapshot`,
`saveSceneRecord`, `commitAiChangeSet`, `story-home` and `theme-studio` returns
nothing; the studio bundle contains all of them.

**Verified live**: the player bundle plus a `player-config.json` boots straight
into the reader, the menu offers only save/load, settings and restart — no route
back into the studio — and a quick save survives a reload. The studio profile
still builds and runs its shelf unchanged.

**Corrections to the earlier draft of this step:**

- `StoryAutoSave` **stays** in the player layout. The draft listed it among the
  things to drop, which was wrong: it autosaves *reader progress* into a save
  slot, so it is what makes "continue where you left off" work. It belongs to the
  player more than to the studio. `AppStateConflictBanner` stays for the same
  kind of reason — when a write is refused, a reader needs to know their progress
  stopped being saved. What actually goes is `PlayerModeRouteGuard` (nothing to
  guard against), `MigrationErrorBanner` (no studio history to migrate) and the
  proactive cross-tab warning (readers do not edit).
- Blocking whole directories is not enough on its own. `lib/document-editor/scene-graph-*`
  is graph traversal the reader's own coverage code walks, and `lib/ai/permissions.ts`
  is read by `lib/user-settings.ts`. Blocking those directories breaks the player
  build, so the bundler handles the unambiguous trees and the checker names
  individual files.

**Found while building this**, both in the cross-tab write guard and both fixed
here rather than left for later:

1. The write revision lived in the storage factory's closure, so it was
   per-wrapper rather than per-tab — and `persistAppStoreStateNow()` builds a
   fresh wrapper every call. That wrapper skipped the check, wrote, and bumped
   the counter; the persist middleware's wrapper then saw a revision it had not
   written and reported a collision **with its own tab**. Autosaving was enough
   to trigger it. This is almost certainly what produced the error report that
   prompted the warning work in the first place.
2. `getItem` only recorded a revision when it found a value, so a tab that read a
   cleared store kept its old number and refused its next write as another tab's.

**Deliberately not here:** APK and AAB measurements, and the installed
permission list. Those need a staged Android project, which does not exist until
R9 — an earlier draft put them in R4's acceptance criteria and made R4
unacceptable until R9 shipped. R4 proves the *JS and autolinking* boundary; R9
proves it on a real artifact.

**Known and not addressed here:** the full translation table for both languages
ships in the player bundle, because `lib/translations.ts` is one module. Worth
splitting before R9 measures an APK, but it is not a boundary problem.

### R5 — Channel B1: portable web bundle — **implemented**

- `lib/release/package.ts` — writes and reads `.vnerelease` on top of the backup
  container. The zip streaming, the hash verification, the entry-order safety and
  the zip-bomb limits are the *same code*: `lib/story-backup/archive.ts` grew a
  container writer and byte readers, and `extract.ts` became generic over the
  manifest inside it. A second copy of the extractor is where a malformed archive
  would eventually do damage.
- `lib/release/asset-map.ts` — every string the story uses for a picture →
  `media/<sha256>.<ext>`. Built from the manifest's `sourceReferences`, because
  only the manifest knows that a media-library id, the library asset's own uri
  and the `idb-media://` string a scene stored are all the same bytes.
- `lib/asset-resolver.ts` — `setPackagedMediaMap()`, consulted **first**. In a
  bundle the packaged file is the only copy that exists, so every other branch
  would be looking for something that was never shipped. Deliberately a plain
  string map set from outside rather than an import of the release code: the
  resolver sits in the reader's core, and a player should not gain the release
  machinery to look up a filename.
- `lib/player-mode.ts` — reads `window.__VNE_PLAYER_CONFIG__` before falling back
  to the fetch, and carries the asset map and the release stamp.
- `scripts/export-story-web.ts` — `--release`, `media/` emission, inlined boot
  config, `--base-url`, `--profile`. Converted from `.mjs` to TypeScript run
  under `tsx` so it uses the app's own container reader, manifest parser and
  asset-map rules rather than a second implementation of each.
- `scripts/make-demo-release.ts` — produces a real `.vnerelease` from a story
  JSON. Exists because the in-app producer is R6, and R5 could not otherwise be
  exercised at all; it uses the same writer and parser, so a fixture cannot be
  something the app could never have produced.
- `wiki/publish-web.md` → `wiki/releases.md`, rewritten.
- `pnpm test:player-e2e` — builds a release, exports it, serves the folder, and
  asserts the bundle boots from the inlined config, fetches the packaged art with
  a 200, serves **every** file the asset map names with a real content type, and
  answers no editor route.

**Done when:** a story whose art was uploaded through the media library exports
and plays — the case that was impossible before. **It does.** Verified end to
end: `make-demo-release` packaged a PNG behind an `idb-media://` reference,
`export-story-web --release` unpacked it to `media/<sha>.png`, and the served
bundle rendered that background and played on into the story. The network log
shows `GET /media/<sha>.png → 200` and no request for `player-config.json`.

**Where the boot config went.** Into `index.html`. A fetched
`player-config.json` has three ways to fail on a folder that looks perfectly
fine: wrong content type, an SPA fallback answering a missing file with
`index.html`, or a sub-path the relative url does not survive. This is *not* a
claim that `file://` works — the production CSP is `default-src 'self'`, which a
file origin satisfies nowhere. The legacy `--story` path still writes the JSON
file as well, so an existing bundle's config stays inspectable by hand.

**Verified less than claimed, and said so:**

- `--base-url` is confirmed by the emitted HTML (`src="/novel/_expo/…"`) and by
  a unit test on the resolution rule, not by a served sub-path: the preview
  browser available here would not follow a link into a sub-directory.
- The e2e does **not** walk the story to an ending. Scripting a path through a
  branching demo breaks whenever the demo is edited and proves less than asking
  whether every packaged file is served — which is what it asserts instead. The
  click-through was verified by hand in the browser.

**Found while building this:** the player root had no seeding on any route but
`index`, so a reader who reloaded while on `/reader` — or opened a link straight
to it — would have found a store with no story. R4 dropped
`PlayerModeRouteGuard`, which had been doing that job in the studio root, and
nothing took it over. Seeding now happens in `app-player/_layout.tsx`, which
mounts on every route.

**Also:** `parseReleaseManifest` now names the format it found. A release and a
backup are the same zip, so "Not a VNE release" on its own left an author staring
at a file that opens fine everywhere else with no idea which of the two they had
picked.

### R6 — Channel B2: export from inside the app — **implemented**

- `scripts/build-web.mjs` builds twice: `dist/` (studio) with
  `player-shell-<version>.zip` and `player-shell.json` inside it.
- `lib/release/shell.ts` — descriptor, version guard, download.
- `lib/release/asset-sources.ts` — a stored release's media, resolved back out of
  the library and **verified against the manifest's hashes**. An author who
  replaced a picture after publishing is refused by name rather than shipping a
  bundle that does not match its own manifest.
- `lib/release/player-bundle.ts` — the parts that decide what a bundle *is*,
  shared with `scripts/export-story-web.ts` so the two cannot drift.
- `lib/release/shell-build.ts` — fetch, unzip, inject, re-zip.
- `lib/release/bundle-file.ts` — save picker on web, `expo-sharing` on native.
- UI: «Export as a playable folder» on the release card, with progress states
  mirroring `StoryBackupProgress`.

**Done when:** a writer with only a browser produces a zip a stranger can unzip
and play offline. **They can.** Verified by clicking it: the studio built
`Export_Trial-v1.0.0.zip` whose `index.html` carries the story, the release stamp
and the scene's first line — and, separately, by opening an exported bundle from
the filesystem with no server anywhere
(`e2e/player/bundle.spec.ts`, "plays from a double-clicked index.html").

> **Corrected 2026-08-30.** The first version of this claimed offline on the
> strength of an HTTP-served folder, which hid two things. Expo emitted absolute
> `/_expo/…` paths, so the bundle needed to sit at a host's root; and the
> studio's `default-src 'self'` is unsatisfiable from a file page, so every
> subresource was refused. Both are fixed — the player profile builds with a
> relative base url and carries the frame guard without the CSP — and two more
> problems surfaced only once a file page actually ran:
>
> - **The router died on boot.** Expo Router calls `history.replaceState` while
>   resolving the initial route, and a `file://` document's opaque origin refuses
>   it. The exception escaped before React mounted, leaving the "You need to
>   enable JavaScript" fallback. A guard in the hardening step swallows it for
>   the file protocol only.
> - **Every route is the story now.** A file page's path is
>   `/C:/Users/…/index.html`, which matches nothing, so the player's `+not-found`
>   renders the boot gate. For a bundle with one story in it that is the only
>   sensible answer anyway.
> - **Fonts are CORS-restricted even from the same directory.** The icon font was
>   the one resource a file page could not load, leaving the reader's menu button
>   an empty box. `scripts/lib/inline-bundle-fonts.mjs` puts it in the code as a
>   `data:` URI.
>
> Also learned: `app/+html.tsx` is dead for `web.output: 'single'` — Expo uses its
> own template — which is why the CSP has always been written by
> `scripts/lib/harden-web-output.mjs` and why the file guard is written there too.

**The shell is 3.6 MB, not 116 MB.** The first build zipped all of
`dist-player/`, which carries `assets/assets/` — every demo background and sample
track, 110 MB. A release packages the media its own story uses, bundled art
included, so a player built for one novel has no use for another's. Excluding it
is what makes the feature usable at all. `assets/node_modules/` stays: 400 kB of
icon fonts the app draws its own menu with, and an earlier cut that dropped all
of `assets/` rendered a reader whose menu button was an empty square.

**Three defects this found, all in code written earlier:**

1. **Character sprites never reached the packaged map.** `useSceneImages` and
   `InteractiveObjectsLayer` call `getBundledAsset` and *only* that, so R5's hook
   — which lives in `resolveAssetUri` — never saw them. A published bundle
   rendered its backgrounds and none of its people. `getBundledAsset` now stands
   aside when the bundle carries its own copy, which sends every such caller down
   the resolving path; `getPackagedMediaUri` serves the one caller that cannot
   await.
2. **The async zip hung.** fflate's `zip`/`unzip` build a worker from a `blob:`
   URL, and the production CSP refuses blob workers — fflate then hangs rather
   than failing, so the export sat forever on «Assembling the folder…».
   Synchronous now: widening the policy for one operation is the wrong trade, and
   a tab that pauses during an export the author asked for is understandable
   where one that never finishes is not.
3. **A closed save dialog was reported as an error.** The browser raises
   `AbortError` for "I changed my mind"; the card answered it with a red line.

**Deliberately not done:** the app writes no `.vnerelease` file. It goes from
stored release straight to folder, because that is what an author wants. R7 needs
a file to upload, and that is where writing one belongs — now possible, because
a release keeps its own bytes (see the R2 correction).

**Not verified:** publishing through the release gate. No bundled demo passes it
— their own asset references are broken, which is a content problem older than
this work — so the release under test was written into storage directly and
everything downstream of it exercised for real. `scripts/make-demo-release.ts`
now packages bundled `assets/…` too, the way `captureStoryBackup` does, so the
fixture is a faithful stand-in rather than a thinner one.

### R7 — Build service (EAS only) — **implemented**, against a fake builder

The seam behind every native build — a real service with state, not a client
adapter. The app never runs a toolchain and never holds a build credential; it
submits a request and follows it.

**Transport — a new contract, not the AI bridge's.** An earlier draft called the
helper "another tool on the same transport". That was wrong on four counts, all
checkable in the code: `lib/bridge-protocol.ts` caps messages at 1 MB (8 MB for
images); `tools/ai-bridge/src/server.ts` closes the socket on any binary frame
and rejects unknown client message types; and `tool_call` runs
helper → browser, the opposite direction from a build RPC. A release archive is
none of those shapes.

What is reused is the **process and pairing model** — a local Node process the
browser pairs with over an authenticated local socket — not the protocol. Build
RPC must not be exposed as an AI tool.

```
POST /build-inputs/:requestId        upload the .vnerelease
  → stream to <requestId>.part
  → SHA-256 computed while writing
  → atomic rename on completion

WebSocket (its own message set)
  client → helper:  submit | status | cancel | retry
  helper → client:  progress | completed | failed
```

Rules the contract must state, not leave implied: a maximum upload size; cleanup
of abandoned `.part` files; origin and token checks matching the bridge's
existing pairing; and a hard refusal when a `requestId` is reused with a
different `payloadHash` — the idempotency key must never silently address two
different payloads.

**Request**

- `lib/release/build-request.ts` — `{ requestId, releaseId, target: 'apk' | 'aab',
  versionCode, payloadHash }`; `requestId` is the **idempotency key**, so a
  reconnect or a double click resumes the existing job instead of starting a
  second paid build.

**Job state machine.** `queued → staging → submitted → building → verifying →
succeeded | failed | cancelled | expired`, persisted by the helper so a browser
reload rejoins a running job. Explicit `retry` and `cancel`; artifacts expire on
a TTL and the expiry is visible in the UI rather than a dead download link.

**Verification at both ends.** The helper checks `payloadHash` before staging and
re-checks the produced artifact before handing it back. Build logs are
**sanitized** before they reach the browser: EAS output can carry account
identifiers, credential paths and signing details.

**Later implementations** — `github-actions.ts`, `local.ts` — plug into the same
interface. Not built now; the interface exists so they can be.

**Done when:** the transport, the upload endpoint and the durable job state
machine survive abuse against a **fake builder** — reload mid-build, cancel,
retry, a resubmit with the same idempotency key, a resubmit with the same key and
a different payload, an abandoned upload. **They do.** Every case in that list is
a test in `__tests__/unit/tools/build-helper.test.ts`, driven over real sockets
and real HTTP rather than by calling methods, plus: an upload for a request
nobody submitted, an upload without the token, an upload from an unpaired origin,
an oversized upload, a binary frame, a socket without the token, a retry of a
running build, and an artifact past its expiry.

**What was built**

- `lib/release/build-request.ts` — the request and what makes two of them the
  same job. The id is validated here because it becomes a filename in two
  places, and sanitising it in each would be two chances to disagree.
- `lib/release/build-job.ts` — the state machine, pure. An event that does not
  belong in the current state returns the job unchanged rather than throwing: a
  cancel landing just after a build finished is a race, not a fault.
- `lib/release/build-protocol.ts` — its own message set, with the four reasons it
  is not the AI bridge's written down beside it.
- `lib/release/build-client.ts` — the app's half. No credential, no toolchain, no
  decision about the build.
- `tools/build-helper/` — the service: upload endpoint, socket, durable job store
  (atomic writes), log sanitizer, `Builder` seam, `FakeBuilder`, `EasBuilder`,
  CLI. `pnpm build-helper`.

**Honest about what is not proved.** No build has ever run. `EasBuilder` refuses
with a reason rather than pretending, because a build command that has never met
a real project would be a guess in the shape of working code. R7 delivers the
kernel; R9 plugs in the builder and is where "a real APK exists" becomes
checkable.

**One rule the plan named that turned out to matter more than expected:** the
upload endpoint must know the expected hash *before* it accepts bytes. Taking the
upload first and being told afterwards what it should have hashed to would mean
trusting the uploader to grade its own work — so an upload for a request nobody
submitted is a 404, not a staging area.

**Deliberately not here:** a real EAS build. That needs the staged Android
project from R9, and requiring it here would make R7 unacceptable until R9
shipped. R7 delivers the kernel and proves it without a cloud account; R9 plugs
the real builder into it. If that separation ever feels artificial in practice,
the honest alternative is to merge R7 and R9 into one vertical Android stage
rather than to blur their acceptance criteria.

### R8 — Channel B3: desktop installer (Tauri) — **implemented up to `tauri build`**

- `tools/desktop-shell/` — Tauri v2 template: `src-tauri/` with
  `tauri.conf.json`, `Cargo.toml`, `build.rs`, `src/main.rs` and
  `capabilities/default.json`. No icon set: `tauri icon` generates one at stage
  time, and it ships with the same CLI as `tauri build`, so an author who can
  build can always produce icons.
- `lib/release/native-identity.ts` — moved up from R9, because R8 needs it
  first. The application id is derived from the **story id alone** and always
  carries a hash of it. That id decides the WebView2 data directory on Windows,
  which is where the reader's saves live: derived from the title it would orphan
  every save on the first rename, and without the hash two stories whose ids
  slugify alike would install over each other and share saved games. Also the
  product-name and version rules — a novel title carries colons far more often
  than a software name does, and an out-of-range version is refused rather than
  clamped, since clamping makes two releases install as one.
- `scripts/lib/stage-desktop.ts` — the staging library, and the whole of this
  stage that needs no Rust: copy the template, put the bundle in `frontend/`,
  write the identity into parsed JSON rather than substituting placeholders,
  then read it all back and verify. A substitution that silently missed produces
  a perfectly good installer for the wrong application.
- `scripts/build-desktop.ts` (`pnpm build:desktop`) — takes a **B1 bundle**, not
  a `.vnerelease`. The desktop channel consumes exactly what the web channel
  publishes, so there is one reader of the container and the two channels cannot
  drift into being different novels. `--stage-only` needs no toolchain.
- `tools/lib/out-path.ts` — one physical-path guard and atomic output transaction
  shared by web, desktop and Android staging. It rejects files, reparse points,
  forged markers and input overlap, and keeps the last complete output on failure.
- `.github/workflows/desktop.yml` — Windows, Linux and macOS, macOS
  `continue-on-error` until there is a Developer ID.
- `wiki/releases-desktop.md`, `tools/desktop-shell/README.md`.

**Verified:** 32 unit tests (identity, staging, verification, icon choice, and
the shell's boundary: no commands, no plugins, `core:default` only), plus five
e2e cases that stage the project from the real exported bundle and play it **from
the staged copy, offline, with zero network requests** — Tauri serves the
frontend from the root of its own origin, which is strictly easier than the
`file://` page those tests use.

**Not verified — no machine involved had a Rust toolchain, so `tauri build` has
never run and neither has the CI workflow.** Everything the script decides before
that line is tested; the line itself is not. Recorded rather than smoothed over:
the "Done when" below is not yet met.

**Done when:** the same release that plays on the project page also installs and
runs offline from a Windows installer, with no browser involved.

### R9 — Channel B4: Android player app — **staged and checked; never built**

Everything up to `eas build` is implemented and verified. `eas build` itself has
never run: no machine involved had an Android SDK, and a cloud build spends money
on an account and signs with credentials that outlive it.

- `lib/release/native-identity.ts` — the Android half: `androidVersionCode`,
  distribution mode, and one normalizer for signing-certificate fingerprints so
  nothing compares them as raw strings. The package id was already derived here
  in R8, from `storyId` and never from author or title.
  - **Correction.** This stage was specified with a version code reserved
    atomically from a counter, never returned on failure, with an acceptance test
    that two concurrent requests get different codes. It is derived instead:
    `major * 1e6 + minor * 1e3 + patch`. Monotonic by construction, because a
    release version is already refused unless it is strictly newer — so there is
    no counter to reserve, nothing to race for, and nothing a crashed helper can
    strand. It also gets the concurrency case right the *other* way: two requests
    for the same release must produce the *same* code, since an APK and an AAB of
    one release are one version of the app.
- `tools/vne-build/stage-android.ts` + `pnpm stage:android` — verify the manifest
  against its payload hash before writing anything, copy an allowlisted project,
  stream the media out of the archive, generate `lib/generated/player-release.ts`
  as one static `require` per object, write the staged `package.json` (with the
  autolinking exclusions), `eas.json` and `.easignore`, and stage the icon and the
  engine splash.
- `lib/release/packaged-release.ts` + `lib/generated/player-release.ts` (a
  committed stub) — the runtime end: module references become uris through
  `expo-asset` and join the *existing* asset seam rather than adding a second
  resolution path. Registered into `lib/player-mode.ts` rather than imported by
  it, so that file stays loadable by the Node scripts that use it.
- `app.config.js` — `VNE_PLAYER_APP_ID` / `_APP_NAME` / `_VERSION` /
  `_VERSION_CODE` / `_SLUG` / `_ICON` / `_SPLASH`, read **only** under the player
  profile, and `VNE_EAS_PROJECT_ID` as a default rather than a constant. The
  gating is a test: a stray export must not be able to repackage the studio.
- The identity travels in `eas.json`'s per-profile `env` rather than in a
  generated `app.json`, so there is one config with one set of rules and the
  values it reads sit in a file anyone can open.

**The asset cut, which was not in the plan and turned out to matter more than
anything else here.** `lib/asset-resolver.ts` held the bundled-art map inline, so
its static `require`s put every demo background, sample track and sprite inside
every artifact. It is now `lib/bundled-assets.ts`, and the player profile
substitutes an empty one the way it already substitutes the store
(`PLAYER_MODULE_SUBSTITUTIONS`). Measured, not asserted:

| | before | after |
| --- | --- | --- |
| player web build (`dist-player`) | 117 MB | **7.7 MB** |
| exported bundle for the demo release | 212.6 MB | **104.1 MB** |
| staged Android project | 219 MB | **106 MB** (96 MB of it the release's own media) |
| player module graph | 209 | **181** |

A release already carries its own bytes — `lib/story-backup/capture.ts` resolves
bundled references and packs them — so the player answers from the packaged map,
which `getBundledAsset` was already written to defer to. Staging then deletes the
art nothing imports, driven by the graph rather than by a list of directories.

**Verified** (`pnpm test`, `pnpm stage:android`, `pnpm test:player-e2e`): the
identity rules; the staged `package.json`, `eas.json` and generated module; that
a media file the asset map names but the project lacks is caught, as is a
`.bin` Metro would not bundle, the committed stub, authoring code that came
along, and a profile that would build the studio. Then, against a real release:
the player's whole module graph resolves inside the staged copy; `expo config`
there reports the right name, version, package, version code, router root and
blocked permissions; and **`expo-modules-autolinking resolve -p android` reports
27 linked modules against this repository's 31** — the check R4 wrote and had
nowhere to apply.

**Not verified, and not pretended:** the APK, its size and its permission list on
a device; the launch splash, which only behaves faithfully in a release build;
v2 installing over v1 with saves intact; and the post-build certificate check,
which needs an artifact to check. `EasBuilder` refuses at submit, before a job or
upload exists; staging is `pnpm stage:android`.

**Five things a review found afterwards, all real, all fixed:**

1. **The output guard only caught `--out .`** — `--out ./assets` would have been
   emptied. Naming a path is not consenting to lose what is in it, so the rule is
   now about contents: absent or empty is fair game, a directory carrying the
   marker these commands write is fair game, anything else is refused. Shared by
   all three writers (`tools/lib/out-path.ts`) rather than copied a third time.
2. **`.weba` was accepted by the verifier and dropped by Metro** — it is what a
   release names an `audio/webm` object, so the sound would simply not be in the
   app. Added to `metro.config.js`, and the verifier's list is now checked
   against Metro's own `assetExts` by a test that asks Metro in a real process.
3. **Android staging never checked for unpackaged bundled references.** The web
   exporter warns; here it must be fatal, because the asset cut above deletes the
   very files a warning would have been survivable against.
4. **The claim that `EasBuilder` stages through the helper was false.** The
   server asks `readiness()` before staging, and it answers no, so `build()` was
   unreachable. The staging in it has been removed rather than left to read like
   a working path.
5. **`--eas-project-id` was optional**, so a build would have gone to the
   engine's own EAS project and been signed with credentials that are not the
   author's. Now required, with `--allow-engine-project` to opt in deliberately.

Also fixed after a second pass: **every novel registered the engine's own URL
scheme**, so two installed on one phone fought over the same links — and a
player could sit in front of the studio's OAuth redirect. It is derived from the
application id now, checked through the resolved config. And the desktop CI job
named `libappindicator3-dev` where the wiki said `libayatana-appindicator3-dev`;
the second is the one that exists on the runner.

Also fixed: the config and autolinking checks failed *open* when the
`node_modules` junction could not be created, printing a green tick for checks
that never ran; the verifier now parses the staged release the way the runtime
will, rather than looking for the fields it happened to think mattered (a story
with no `startSceneId` passed, and would have installed and sat on its boot
screen); the two build profiles are checked to describe the same application; and
staging is deterministic, stamped from the release rather than from the clock.

- `wiki/releases-android.md` — sideload instructions, the Play checklist, and
  what losing a signing key costs.

Still to do for the **Done when** below: EAS onboarding (CLI check → login →
`eas init` → interactive credentials), submit-and-poll, artifact download,
certificate verification against the stored fingerprint, and `bundletool
get-size total` for the AAB.

**Done when:** an author who has completed the one-time onboarding presses
Release → Android and receives an APK that installs on a phone, opens on the
engine splash, plays the novel offline, exposes nothing else — and a v2 release
installs over it without an uninstall.

### R10 — Remote catalog (A2, separate decision)

Deferred by decision: build only after A1 ships, with its own plan.

- Supabase: `releases` and `release_assets` tables, storage bucket, RLS,
  resumable upload (`tus-js-client` is already a dependency,
  `lib/supabase-backup.ts` is the pattern).
- Accounts, ownership, unpublish, takedown, abuse reports, moderation queue.
- Reviews move from local storage to shared storage — `lib/reviews/*` is
  currently device-local and would need identity and anti-spam.
- Legal surface: terms, DMCA process, age-rating policy, storage cost model.

This stage is roughly the size of R0–R9 combined.

---

## 6. Acceptance tests

Beyond each stage's own unit tests, these gate R4 and R9. They exist because
every one of them corresponds to a way this can ship broken and look fine.

**Config contract** (cheap; all of these run today in `pnpm test` and
`pnpm stage:android`):

- `packageId` is stable across a title rename and an author rename;
- `androidVersionCode` increases monotonically — by construction now, not by
  reservation; see R9's correction, which also replaces "two concurrent requests
  get different codes" with its opposite: two requests for the *same* release
  must get the *same* code;
- router root resolves to `app-player/` in the staged project's resolved config;
- both `player-apk` and `player-aab` profiles exist and emit the formats they
  claim;
- icon and engine splash are present in the staged project. The **adaptive**
  icon stays the engine's: a foreground layer needs a safe zone a cover does not
  have, and generating one needs a rasterizer this pipeline does not carry.

**Bundle contract:**

- **R4:** no editor route, authoring store slice, or AI/media-library module is
  reachable from the player root ✅; JS bundle size recorded ✅.
  `expo-modules-autolinking resolve` reporting the reduced native set could not
  be done here — the exclusions live in `package.json`, which the studio shares —
  and is done by R9 instead.
- **R9, done:** the staged project links 27 native modules against this
  repository's 31; the authoring trees and every unreferenced studio route are
  absent from the staged tree, which is stronger than inspecting the archive for
  them; the staged project's whole module graph resolves.
- **R9, still open:** the installed APK's permission list on a device; APK size
  and `bundletool get-size total` for the AAB. Both need a build.

**Install lifecycle** (a real device or emulator):

- v1 APK installs; v2 installs **over** it with no uninstall, same key;
- an artifact whose signing certificate does not match the stored fingerprint is
  refused **on return**, before it is handed to the author (a pre-submit refusal
  is not achievable with EAS-managed credentials);
- cold launch in airplane mode renders image, audio and video from inside the
  APK;
- a corrupted or missing release fails with a visible, human error rather than a
  blank screen.

**Desktop contract** (R8; everything above the toolchain line runs in `pnpm test`
and `pnpm test:player-e2e`):

- the application id is stable across a title rename, and two story ids that
  slugify alike still get different ids;
- an out-of-range version is refused rather than clamped;
- no template value survives staging — identifier, product name, version, window
  title;
- the staged directory is atomically replaced after verification, so nothing
  from the previous story ships and a failed run keeps the last good output;
- the staged copy carries every media file the bundle had, byte for byte;
- the staged frontend plays offline from a `file://` page with zero network
  requests, which is strictly harder than Tauri's own origin;
- the shell registers no commands and grants `core:default` only.

Not covered until the CI workflow runs: `tauri build` itself, and therefore the
installer, the icons and the "installs over v1" lifecycle.

**Build service** (against a fake builder in R7, against EAS in R9):

- retry, cancel, expired token;
- a resubmit with the same idempotency key rejoins the job instead of paying for
  a second one;
- a resubmit with the same key but a different `payloadHash` is refused;
- an abandoned upload leaves no orphaned `.part` file;
- artifact expiry is surfaced, not a dead link;
- build logs handed to the browser contain no account or credential detail.

The existing Vitest suite passes today, and the player-mode and Metro-blocklist
tests are the right base to extend.

---

## 7. Decisions

### Settled

1. **"The project page" means the in-app showcase (A1) first.** A hosted public
   catalog (A2) is deferred to R10 as a separate decision with its own plan.
2. **Channel B covers all four tiers.** Web bundle (B1), in-app export (B2),
   desktop installer (B3, Tauri) and an Android player app (B4). This supersedes
   the README's "Android is a future distribution target" framing; the README
   needs updating when R9 lands.
3. **A released novel is the engine with only the reader in it.** Not a runtime
   guard over a full build — a real player build profile (B0/R4) from which the
   editor is absent.
4. **The engine is visible exactly once, as the launch splash.** That splash is
   the attribution on native builds and is not author-removable there; the
   author's own title card plays after it.
5. **The app authors native builds; a local helper stages and submits them; EAS
   executes them.** An APK cannot be produced or signed in a browser, and `eas
   build` needs a local staging and upload step that no browser adapter can
   replace. The helper rides the existing `tools/ai-bridge` transport, so an
   Expo token never enters a web page.
6. **One builder for v1: EAS.** GitHub Actions and local Gradle stay behind the
   same interface as later implementations. Three credential models and three
   failure surfaces are worth less than one proven end-to-end path.
   Consequences accepted with it: the build helper needs **its own contract**,
   not the AI bridge's protocol; and the *first* build per novel is a one-time
   terminal onboarding, not a button.
7. **One EAS project per novel, in the author's own account.** The engine's
   hardcoded `projectId` becomes a default that the staged project overrides. An
   engine-owned build broker would concentrate cost, credentials and legal
   responsibility for other people's content here; that is an A2-scale decision.
8. **Native identity is minted once and then immutable.** `packageId` comes from
   `storyId`, never from a renameable author or title.
9. **Play Store listings belong to the author, not to this project.** The engine
   generates the AAB and the checklist; sideloadable APK is the default output.

### Still open — defaults apply unless overridden

10. **Is a published release immutable?** Default: yes. The alternative — the
    showcase always showing the live working copy — is simpler to build and worse
    for every reader.
11. **Copy protection.** A web bundle is fully readable by whoever downloads it,
    and an APK can be unzipped just as easily; story text and art can be
    extracted from either. There is no honest DRM here. Default: don't pretend
    otherwise — state it in the docs and put licence and credits in the manifest
    instead.
12. **Release size ceiling.** `STORY_BACKUP_LIMITS` currently allows a 512 MB
    uncompressed web archive. That is fine for a `.vnerelease` file on disk, too
    large for a web page opened on mobile data, and over Play's per-device
    download. Suggest a soft warning around 150 MB for Channel A, and a separate,
    lower cap for the in-browser
    [B2](#b2-export-as-app-from-inside-the-app-without-node) path, which has to
    hold what it zips in memory. **Sideloading has no ceiling at all**, so the
    engine should warn about size, never refuse it.
13. **Does the engine ever re-encode media?** Default: no — settled against by
    [VIDEO-PLAN.md](VIDEO-PLAN.md), and re-opened here only if R9's real
    measurements show that size is blocking actual novels. Preflight reports
    sizes; the author owns the encoding.
14. **Do desktop and Android builds share the web release's version line?**
    Default: yes — one release version, several artifacts. Separate per-platform
    versioning would double the changelog for no reader benefit. Note that
    `androidVersionCode` is a separate monotonic integer regardless; it is
    Android's counter, not the author's.
15. **Does the studio ever ship to users who don't run Node?** If yes, the local
    helper stops being sufficient and a hosted broker becomes necessary — with
    the cost and responsibility that implies. Today's README assumes Node, so
    this stays deferred.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Two publish paths drift apart | Single artifact; both channels read `.vnerelease` and never re-derive story data |
| Release media garbage-collected by `web-media-cleanup` | Snapshots persist via `createPersistentStorage` so `collectReferencedMediaKeys` sees them; covered by a regression test |
| IndexedDB quota exhausted by release history | Content-addressed blobs are shared across versions; keep N releases, prune payloads (not objects) beyond that |
| Player shell drifts from the engine | Shell zip is version-stamped; export refuses on mismatch |
| A republish breaks readers' saves | `releaseId` + version on every save slot, explicit continue/restart choice |
| Sub-path hosting silently 404s | `--base-url` plumbed to `experiments.baseUrl`; smoke test serves the bundle from a sub-path |
| `file://` delivery breaks on `fetch` | Boot config inlined into `index.html`; media referenced by relative path |
| A lost signing key strands every installed copy | Sideload updates have no recovery path, unlike a Play upload key — EAS holds credentials in v1, and a mismatched signing certificate is caught when the artifact returns, before it reaches the author |
| A failed build burns a `versionCode`, or two builds share one | Codes are reserved atomically before submit and never returned on failure; concurrent reservation is an acceptance test |
| Native modules survive the JS cut because they are installed, not configured | `expo.autolinking.android.exclude` plus `android.blockedPermissions`, asserted through `expo-modules-autolinking resolve` |
| AAB measured as a file instead of as a download | `bundletool get-size total`, not the `.aab` byte count |
| A story exceeds a Play cap only after a long cloud build | Preflight warns from the manifest estimate; the hard gate runs post-build on the real artifact, because a pre-compilation estimate cannot be trusted to refuse |
| The player build accidentally ships editor code | Committed `app-player/` via the router plugin's `root` option + store-slice cut + metro blocklist + a CI bundle check (R4), with the runtime guard as defence in depth |
| Native modules and permissions survive the JS cut | Autolinking ignores the Metro blocklist — the staged player config drops the picker plugins and storage permissions, and the permission list is asserted in CI |
| The release is not actually inside the APK | Metro only bundles assets reachable through a static `require`; the staging step generates that module and the airplane-mode launch test proves it |
| `versionCode` from the manifest is silently ignored | The repo's `appVersionSource: "remote"` would override it — the staged project carries its own `eas.json` with `local` |
| Package id changes between versions | Minted once from `storyId`, stored in native identity, never recomputed from renameable fields |
| Large releases exhaust memory during packing | Staging streams to disk on the helper; nothing unzips a 150 MB release inside a browser tab or on a phone |
| A double click or a reload pays for two cloud builds | `requestId` is an idempotency key; the helper's job state machine rejoins rather than resubmits |
| Build logs leak account or credential detail | Logs are sanitized by the helper before they reach the browser |
| Build service outage or quota exhaustion blocks all releases | Channel A and the web bundle never touch the build service; the builder interface admits GitHub Actions and local Gradle later |

---

## 9. Out of scope

Monetization and payments; multiplayer or social features beyond the existing
local reviews; automatic translation of story content; an in-engine asset store;
console platforms.
