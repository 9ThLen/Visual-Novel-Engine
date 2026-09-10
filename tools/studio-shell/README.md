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

`capabilities/default.json` grants `core:default` and nothing more, and it still
does now that the studio can start the AI bridge.

`main.rs` registers four commands — start the bridge, ask how it is, stop it, and
save the author's provider and API key. The first three take no argument at all.
The fourth takes two **values** and no path: `src/bridge.rs` resolves
`ai-bridge/node.exe` against this application's own resource directory, where
`scripts/lib/stage-studio.ts` put it, and writes to the settings file *the bridge
itself reported*. Nothing the page sends chooses a path, a binary or a flag.

That the bridge reports its own settings path matters more than it looks.
Deriving it a second time in Rust would be two answers to one question, and it is
printed even on the start the bridge refuses — which is the start where the
author needs it, because that refusal is what the key is being typed to fix.

That is deliberately not `tauri-plugin-shell`. A permission to run programs is a
general one; what is needed is one specific process, so it is spawned with
`std::process::Command` instead. Nor does it need a capability entry: Tauri gates
plugin commands, remote origins and apps that define their own ACL manifest, and
this is none of those — see the invoke path in the `tauri` crate.

The installer carries the bridge when `pnpm build:bridge-package` has been run
and `pnpm build:studio-desktop` finds its output; `--no-bridge` builds without
it. A studio built that way still pairs with a bridge the author starts, and says
so rather than offering a button that cannot work.

## What must not be added lightly

The window still has no filesystem, no dialog and no HTTP plugin, and the three
commands above are the whole of its reach outside the page. Anything wider —
`shell:allow-execute`, a command that takes a path — gives up the argument that
made spawning a process acceptable in the first place.

Those are step 2. Nothing above should be half-done to make a demo work.
