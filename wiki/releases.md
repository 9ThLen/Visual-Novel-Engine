# Releasing a story

A **release** is one frozen, versioned copy of a story: a `.vnerelease` file
carrying the scenes, the cast, and the bytes of every picture and sound they
use. It is what both publishing channels consume — the in-app showcase reads it,
and the web exporter turns it into a folder anyone can host.

Freezing is the point. An author who publishes v1.0 and then rewrites chapter
nine has not changed what readers are reading; they have a draft and a release,
and the release does not move until they publish again.

## Exporting from inside the app

Open a story's project page, publish a release, and use **Export as a playable
folder**. The studio downloads the player it was deployed with, injects the
story, and hands back a zip anyone can unzip and open — no command line, no
account, no app.

This needs a deployment built by `pnpm build:web`, which writes
`player-shell-<version>.zip` and `player-shell.json` beside the studio. A
deployment without them says so rather than producing a folder that would not
play, and so does one whose shell came from a different engine version: the
shell carries the reader, and a story exported into a mismatched one would be
played by code that never saw its schema.

Web only. On a phone or a desktop build there is no shell to download.

## Publishing from the command line

```bash
pnpm export:story --release <file.vnerelease> --out <dir>
```

Then serve the output with any static host:

```bash
npx serve ./story-dist
```

The bundle is the player-profile Expo web build, the release's media unpacked
into `media/`, and a boot config inlined into `index.html`. Opening it launches
straight into the reader; there is no editor to reach, because the player build
does not contain one (see [`app-player/README.md`](../app-player/README.md)).

Every path in it is relative, so the same folder plays from a host's root, from a
sub-directory, and from a double-clicked `index.html` with no server at all.
`--base-url` is only for pinning it to one path on purpose.

### Options

| Flag           | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `--release`    | A `.vnerelease` container. Carries its own media.                        |
| `--story`      | Legacy: story id (matched against `assets/*.json`) or path to a JSON.    |
| `--out`        | Output directory for the published bundle (**required**).                |
| `--dist`       | Existing Expo web build to reuse (default `dist-player`).                |
| `--profile`    | `player` (default) or `studio`.                                          |
| `--base-url`   | Serve from a sub-path, e.g. `/my-novel`.                                 |
| `--build`      | Force a fresh `expo export --platform web`.                              |
| `--skip-build` | Fail instead of building when no web build is present.                   |
| `--strict`     | Treat missing bundled asset references as errors (legacy path only).     |

## Why `--release` and not `--story`

A story JSON names its art with strings that mean something only on the machine
that wrote them: `idb-media://…` for a browser database, `file://…` for a phone.
Nothing outside that device can follow them. The legacy `--story` path can
therefore only publish art that already ships with the app, and reports anything
else as unpublishable.

A `.vnerelease` carries the bytes. Each object is stored under its own SHA-256,
and the manifest records every string the story uses to refer to it. The
exporter unpacks the objects to `media/<sha256>.<ext>` and writes that
correspondence into the boot config, so the reader resolves
`idb-media://something` to a file the folder actually contains.

Content addressing is kept in the filename deliberately: identical art shared
between two releases is one file with one name, so a host caches it once and
republishing does not invalidate it.

## Making a release file

The app is the real producer — publishing a story freezes it
([`lib/release/compile.ts`](../lib/release/compile.ts)) and stores it, and the
in-app export above turns a stored release into a folder without a `.vnerelease`
file ever existing on disk.

A `.vnerelease` file is what the command-line path takes. This script writes one
from a story JSON, using the same writer and the same manifest parser the app
uses:

```bash
pnpm demo:release --story assets/demo-story-advanced.json \
                  --media assets/background/bg-museum-entrance.png \
                  --out demo.vnerelease
```

`--media` packages a file and points the opening scene at it through an
`idb-media://` reference — the shape a real release has, and the case the legacy
exporter could never publish.

## What the shell is

`pnpm build:web` produces two builds. `dist/` is the studio; inside it sits the
player build, zipped, as `player-shell-<version>.zip` — about 3.6 MB.

The shell carries the app and the icon fonts it draws with, and **not**
`assets/assets/`: the project's own art, every demo background and sample track,
110 MB of it. A release packages the media its own story uses, bundled art
included, so a player built for one novel has no use for another's. With it, the
shell was 116 MB and an author downloaded all of it to export a story that
needed six.

## What ends up in the bundle

```
index.html          the app, with the boot config inlined
404.html            the same page, for hosts with no SPA rewrite
_expo/, assets/     the player-profile web build
media/<sha256>.<ext>  every packaged object
```

The boot config lives in `index.html` rather than in a fetched
`player-config.json`. A fetch has three ways to fail on a folder that looks
perfectly fine: the host serves the file with the wrong content type, the host
answers a missing file with `index.html` (every SPA fallback does), or the
bundle is served from a sub-path the relative URL does not survive. Inlined,
the config is simply there before the first paint.

The legacy `--story` path still writes `player-config.json` as well, so an
existing bundle's config can be inspected or replaced by hand.

## Limitations

- **Nothing is re-encoded.** A release weighs what its media weighs; see
  `VIDEO-PLAN.md`. The app reports the size and the author decides.
- **In-app export holds the bundle in memory and zips on the main thread.** A
  browser tab has no filesystem to stream through, and the production CSP
  forbids the blob workers fflate's async API needs. The tab pauses while a
  bundle is assembled; for a very large novel, use the command line.
- **A player bundle carries no Content-Security-Policy.** `default-src 'self'`
  is unsatisfiable from a `file://` page, and a bundle is meant to be opened by
  double-clicking it. The clickjacking guard stays, because bundles get hosted
  and framed. The studio keeps its strict policy.
- The legacy `--story` path keeps its old limits: only bundled `assets/…`,
  `data:` URIs and remote URLs can be published.

## Checking a bundle

```bash
pnpm test:player-e2e
```

Builds a release, exports it, serves the folder, and asserts that it boots into
the reader from the inlined config, that the packaged art is fetched and
returns 200, that every file the asset map names is served with a real content
type, and that no editor route answers. The last case opens the same folder over
`file://` with no server running at all — the only way to catch the absolute
paths, the refused policy and the router's history call that each broke a
double-click while every HTTP test stayed green.

The same suite stages the desktop project from that bundle and plays it from the
staged copy, offline. A copy is where files quietly go missing, and a missing
background three chapters in is invisible to whoever ran the build.

## Shipping it as an application

A release can also become a desktop application — a Windows installer, a `.deb`,
an AppImage, a `.dmg` — wrapping the very same bundle. See
[`releases-desktop.md`](releases-desktop.md).
