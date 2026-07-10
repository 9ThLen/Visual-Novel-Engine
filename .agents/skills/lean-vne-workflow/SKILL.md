---
name: lean-vne-workflow
description: Make focused, token-efficient changes in the Visual Novel Engine. Use for feature work, bug fixes, codebase questions, test failures, and reviews in this repository, especially when locating the canonical scene/editor path or narrowing a broad task to a few files.
---

# Lean VNE Workflow

Follow this workflow without duplicating repository conventions.

1. Decide whether a code change is necessary; reuse a matching implementation when one exists.
2. If `graphify-out/graph.json` exists, run `graphify query "<task>"` first. Then use `rg`, `package.json`, and imports to identify at most three likely files before opening them.
3. Read only targeted ranges and do not reread unchanged files. Use `rg` for symbols, errors, and relevant call sites; inspect full files only when they are short or strictly necessary.
4. Respect the canonical architecture: plate/document editing, `SceneRecord + TimelineStep`, `useSceneExecutor`, `lib/scene-access.ts`, Zustand through `useAppStore()`, and persistent storage through `createPersistentStorage()`.
5. Make the smallest correct localized edit. Do not refactor adjacent code or add a dependency without need. If a failure repeats twice, research several plausible fixes before changing code again.
6. Run the narrowest relevant validation first. After code edits, run `graphify update .`; report only the result, changed files, validation, and any remaining problem.

For long command output, save or filter it and inspect the first meaningful failure rather than loading duplicate logs.
