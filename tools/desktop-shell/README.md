# Desktop shell

The Tauri v2 project a novel is poured into. It is a template, never built in
place: `scripts/build-desktop.ts` copies it somewhere else, writes the story's
identity into `tauri.conf.json`, puts the exported bundle in `frontend/`, and
runs `tauri build` there.

```
src-tauri/
  tauri.conf.json      productName / version / identifier are overwritten
  Cargo.toml           tauri, and nothing else
  build.rs
  src/main.rs          a window, no commands
  capabilities/        core:default, nothing more
```

## What is a placeholder

`productName`, `version`, `identifier`, the window title and the Cargo package
version carry the template's own values. Staging replaces them on parsed JSON
rather than by text substitution, and `verifyStagedProject` reads the result back
to check none survived — a swap that silently missed produces a perfectly good
installer for the wrong application, and every story built that way would install
over every other one.

## What must not be added lightly

`main.rs` registers no commands and `capabilities/default.json` grants
`core:default`. A story is data a stranger runs, so the shell exposes no way to
reach the machine it plays on. Both facts are asserted by
`__tests__/unit/scripts/stage-desktop.test.ts`; adding a plugin or a command
means changing that test, on purpose, in the open.

`app.security.csp` is `null` so the page keeps the policy it shipped with. The
same folder also has to play double-clicked from a filesystem, where
`default-src 'self'` cannot be satisfied.

The reader's saves live in the webview's own storage, which needs no permission —
and which is keyed by `identifier`. See
[`wiki/releases-desktop.md`](../../wiki/releases-desktop.md).
