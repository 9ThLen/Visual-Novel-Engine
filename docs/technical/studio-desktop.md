# The studio as a desktop application

The studio — the editor an author opens — packaged as a Windows installer, a
Linux `.deb`/AppImage or a macOS `.dmg`. It exists so that using this engine
stops requiring a cloned repository, a terminal and a dev server.

It is a different application from [the desktop
player](releases-desktop.md), which packages one published novel for a reader.
The two share a shape and nothing else: a novel's identity is derived per
release, the studio's is a constant it must never lose.

```bash
pnpm ai-bridge:build        # writes tools/ai-bridge/dist
pnpm build:bridge-package   # wraps it with a Node runtime — needs a network
pnpm build:web              # writes dist/ — the studio's web build
pnpm build:studio-desktop   # wraps both in a native window and an installer
```

Separate commands rather than one, for the reason the player channel gives: each
build consumes exactly what the one before it publishes, so there is one answer
to "what is in this build".

**The first two are easy to skip, and skipping them is quiet.** Without the
package, `build:studio-desktop` still produces a working installer — one whose
AI panel can only pair with a bridge the author starts and finds for themselves.
That is a supported build, and `--no-bridge` is how to ask for it; asking makes
the build say so calmly. Leaving the package out by accident makes it warn
instead, because the difference is "press a button" against "go and find one".

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

Show the page, and run one program: the AI bridge that ships beside it.

`capabilities/default.json` grants `core:default` and nothing more — no
filesystem, no dialog, no HTTP plugin, and in particular no
`tauri-plugin-shell`. A permission to run programs is general; what the window
has instead is four specific commands, defined in
`tools/studio-shell/src-tauri/src/bridge.rs`:

| | |
| --- | --- |
| `ai_bridge_start` | Start it. No arguments. |
| `ai_bridge_status` | Is it up, and where. No arguments. |
| `ai_bridge_stop` | Stop it. No arguments. |
| `ai_bridge_save_settings` | A provider and an API key. Two values, no path. |

Nothing the page sends chooses a path, a program or a flag. The executable is
resolved from this application's own resource directory; the settings are the
bridge's own, in a directory it derives from the account. App commands invoked
from a local origin need no capability entry at all, so the narrow surface is the
whole surface.

### The bridge in the installer

`build:bridge-package` produces a folder with a Node runtime and the bridge
bundle; staging copies it to `src-tauri/resources/ai-bridge/` and names it in
`bundle.resources`. Tauri reproduces the **whole** relative path under the
installed resource directory, so the studio resolves `resources/ai-bridge/…`, not
`ai-bridge/…`. Those two strings live in different languages and once disagreed:
the installer carried the bridge and the studio reported it missing. A test in
`stage-studio.test.ts` reads the Rust constant and compares it.

A studio built without the package is a supported shape. It says so in its status
(`installed: false`), the panel renders nothing, and the manual URL-and-token
form is the way in.

### What an author does

Opens the studio. It starts the bridge as it opens, in the background, so the AI
panel is usually already paired by the time anyone gets there. If the bridge
refuses — most often because no API key has been entered yet — the panel shows
the bridge's own words and a field to type the key into.

The key field is there in **every** state the author can act on, including a
bridge that is running and paired. A wrong key is not a missing key: the bridge
starts, pairs, and the provider rejects every message. Offering the replacement
only after a failed *start* left that author with nowhere to go.

### Where the key goes

Not into `bridge.env`. The studio hands it to the bridge on standard input —
never as an argument, since every process on Windows can read every other
process's command line — and the bridge seals it with DPAPI under the current
user, in `secrets.json` beside its settings. The ciphertext is useless on another
machine and to another account on this one, which is what a file's permissions
cannot offer. A plaintext copy left in `bridge.env` is cleared at the same time,
so there is one answer to "which key is in use".

There is no DPAPI on POSIX without asking for a second password, so there the
stored record says `"protection": "file"` and the `0600` mode is the protection.
The installer is a Windows artefact; this is the honest state elsewhere rather
than an implied seal.

The same command is available from a terminal:

```bash
printf %s "$KEY" | vne-ai-bridge --save-key openai
```

### The folder those files live in

`%LOCALAPPDATA%\VisualNovelEngine\Bridge`, restricted to the owner before
anything secret is written into it, and verified afterwards by SID rather than by
account name. The bridge refuses to start when it cannot do that: it is about to
write an API key and a pairing token, and continuing would be the false assurance
the check exists to remove.

Inheritance is required of the **directory** and of nothing else. The directory
blocks inheritance from `%LOCALAPPDATA%` and grants `(OI)(CI)` to the owner, so a
file inheriting from it is already owner-only — and `icacls /reset`, which is how
an existing secret is handed that ACL, turns inheritance back on. Demanding it of
the files too made the bridge start once and refuse every run after, on the
machine where it had just worked.

### Reachable IPC

The CSP written by `scripts/lib/harden-web-output.mjs` allowed `ws:` — so the
bridge connection always passed — but not `http://ipc.localhost`, so IPC was
refused and fell back to postMessage. Staging relaxes that one directive **in the
studio's copy only**, because `build:web` writes one bundle that the web channel
and the player also use, and neither has a Tauri to talk to.
`verifyStagedStudioProject` fails a build whose page lost it.

### Connecting to a bridge the author started

Still works, verified on a Windows build: the handshake carries
`Origin: http://tauri.localhost`, and the panel reports the connected provider.
Both allowlists that gate it read `src/lib/ai/studio-origins.ts` — the bridge's
`origin-policy.ts` answers the studio's handshake, and the editor's
`platform-support.ts` shows the AI tab. They were separate once and disagreed,
and the editor's check ran first, so the symptom was not a refused connection but
a missing tab. Anything added to that list must be an origin **measured** off a
real handshake, never one read from documentation.
