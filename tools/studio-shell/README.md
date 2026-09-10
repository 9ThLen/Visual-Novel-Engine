# Studio shell

The Tauri v2 project the **studio** is poured into — the editor an author opens,
not a published novel. `tools/desktop-shell` is the other one, and it is for a
single story; the two must stay apart.

```
src-tauri/
  tauri.conf.json      identity is FIXED; only the version is written by staging
  Cargo.toml           tauri, and nothing else
  build.rs
  src/main.rs          a window, no commands
  capabilities/        core:default, nothing more
```

Staged and built by `scripts/build-studio-desktop.ts`; the rules live in
`scripts/lib/stage-studio.ts` so they can be tested on a machine with no Rust.

## Why this is not the player shell with different text

The player shell is *parameterised*: every story overwrites `productName`,
`version` and `identifier`, and `verifyStagedProject` fails the build if any of
the template's own values survive — a story that installed under the template
identity would install over every other story.

The studio inverts that. There is one studio, so its identity is a constant, and
the failure to guard against is the opposite one: an identifier that **changed**
between two releases. See below.

Reusing the player shell for this would also mean loosening it. It grants
`core:default` and registers no commands *on purpose*, asserted by
`tests/unit/scripts/stage-desktop.test.ts`, because a story is data a
stranger runs. The studio will eventually need to spawn a process. Those two
requirements do not belong in one file.

## The identity is permanent

`identifier` is `com.vne.studio` and must never change. Windows keys the
WebView2 user-data folder by it, so it is the address of every project an author
has written. A release that changes it does not migrate anything and does not
delete anything either: the old folder stays on disk, unreachable, and the
studio opens empty. That reads as data loss whether or not the bytes survive.

The **origin** inside that folder matters the same way and is not ours to pick:
Tauri serves the window from `http://tauri.localhost` on Windows and
`tauri://localhost` elsewhere. Storage is per-origin, so projects do not travel
between operating systems, and anything that changes how the window is served
(a custom `url`, a dev-server window, `dangerousUseHttpScheme`) moves the origin
and hides the projects behind the old one.

`STUDIO_IDENTIFIER` in `scripts/lib/stage-studio.ts` is the single copy of that
string, pinned by a test that exists only to fail when someone edits it.

Neither fact is a substitute for an export the author can hold. Verify that
before shipping an installer to anyone.

## What must not be added lightly

`main.rs` registers no commands and `capabilities/default.json` grants
`core:default`. Connecting to a bridge the author starts themselves needs
nothing more than that — a WebSocket is not a permission — and works today:
`src/lib/ai/studio-origins.ts` carries this window's origin, and both the
bridge's `origin-policy.ts` and the editor's `platform-support.ts` read it.

*Launching* the bridge is the part that needs more, and needs, at minimum:

- a packaged Node runtime — `pnpm ai-bridge:build` emits `cli.mjs`, which is not
  an executable and does not carry one;
- `tauri-plugin-shell` and a `shell:allow-execute` scoped to that one binary;
- the session token handed to the window without the author copying it. It is no
  longer regenerated per start — see `tools/ai-bridge/src/token-store.ts` — but
  it still has to reach the window.

Add the CSP to that list before starting: `scripts/lib/harden-web-output.mjs`
permits `ws:` but not `http://ipc.localhost`, so Tauri's IPC already falls back
to postMessage. No command is registered today, so nothing breaks yet; a sidecar
would be the first caller to care.

Those are step 2. Nothing above should be half-done to make a demo work.
