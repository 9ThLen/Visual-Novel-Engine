# The studio as a desktop application

The studio — the editor an author opens — packaged as a Windows installer, a
Linux `.deb`/AppImage or a macOS `.dmg`. It exists so that using this engine
stops requiring a cloned repository, a terminal and a dev server.

It is a different application from [the desktop
player](releases-desktop.md), which packages one published novel for a reader.
The two share a shape and nothing else: a novel's identity is derived per
release, the studio's is a constant it must never lose.

```bash
pnpm build:web              # writes dist/ — the studio's web build
pnpm build:studio-desktop   # wraps dist/ in a native window and an installer
```

Two commands rather than one, for the reason the player channel gives: the
desktop build consumes exactly what the web build publishes, so there is one
answer to "what is in this build".

## `build:web`, not `expo export`

The studio has no bundler. It exports a playable release by injecting the story
into a prebuilt **player shell** it ships inside itself — `player-shell.json`
and the zip that descriptor names, both written by `build:web` and by nothing
else.

A bundle from a bare `expo export` has neither, and it does not look broken: it
has `index.html`, it has `_expo/`, it installs, it opens, and every story in it
edits normally. It fails at one step — the one the application exists for — with
"This copy of the app was deployed without a player to build from".

That is not hypothetical. It is what the first installer built by this script
shipped, and it was found by releasing a story inside it and getting no file.
`build-studio-desktop` now refuses such a bundle before staging: it parses the
descriptor with the app's own parser, matches its version against the studio's,
and hashes the zip, because a truncated shell is a build that fails on the
author's first export instead of on ours.

## What you need

The same toolchain the player channel needs — Rust, the Tauri CLI, and the
per-platform pieces — listed in [releases-desktop.md](releases-desktop.md#what-you-need).

`pnpm build:studio-desktop --stage-only` needs none of it. It writes the project
and stops, which is how the staging rules are tested on machines with no Rust.

## Options

| | |
| --- | --- |
| `--bundle <dir>` | The studio web build. Default `dist/`. |
| `--out <dir>` | Where the staged project goes. Emptied first. Default `dist-studio-desktop/`. |
| `--targets a,b` | Bundle targets. Default `nsis` on Windows. |
| `--icon <file.png>` | Square PNG, ≥512px. Defaults to the engine icon. |
| `--stage-only` | Write the project and stop. |
| `--debug` | Debug profile: much faster to build, much larger. |

There is no `--version`. The version comes from the app config, the same source
`build:web` reads, because it is what an installer compares to decide whether it
is upgrading or reinstalling — and a version that came from the command line is
one an author can ship twice under the same number.

There is no `--identifier` either. See below.

## Where the author's work lives

`com.vne.studio`. Windows keys the WebView2 user-data folder by that identifier,
so it is the address of every project written in the installed studio.

Changing it does not migrate the old folder and does not delete it either. The
new build simply opens an empty studio, while the previous folder stays on disk
where nothing will look for it. To the person it happens to that is data loss,
whether or not the bytes survive.

The **origin** inside that folder matters the same way, and is not ours to pick:
Tauri serves the window from `http://tauri.localhost` on Windows and
`tauri://localhost` elsewhere. Storage is per-origin, so projects do not travel
between operating systems, and anything that changes how the window is served —
a custom `url`, a dev-server window, `dangerousUseHttpScheme` — moves the origin
and hides the projects behind the old one.

The identifier is stated once, in `scripts/lib/stage-studio.ts`, and pinned by a
test whose only purpose is to fail when someone edits it. Staging refuses to
write a project whose template disagrees, and verification reads the result back
and refuses again.

None of that is a substitute for a backup the author holds. Export a story
archive and restore it before shipping an installer to anyone.

## What the window can do

Nothing but show the page. `main.rs` registers no commands and
`capabilities/default.json` grants `core:default` — no filesystem, no shell, no
dialog, no HTTP plugin. The studio's own storage needs no permission.

The AI bridge is the known exception, and it is not done yet. It is a Node
process on a loopback WebSocket, and an installed studio cannot ask its user to
run `pnpm ai-bridge` by hand. Making it a sidecar needs a packaged Node runtime
(`pnpm ai-bridge:build` emits `cli.mjs`, which is not an executable),
`tauri-plugin-shell` scoped to that one binary, a session token handed to the
window rather than copied by the author, and a change to
`tools/ai-bridge/src/origin-policy.ts`, which today allows `localhost`,
`127.0.0.1` and `[::1]` only and so rejects `http://tauri.localhost` before the
server starts.

Until that lands, AI features in the installed studio work only if the author
starts the bridge from a source checkout — which is most of the reason the
installer exists.
