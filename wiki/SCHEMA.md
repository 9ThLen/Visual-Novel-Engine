# Wiki Schema

This wiki is intentionally small. It should describe the current project, not preserve every historical work log.

## Active Pages

| Page | Purpose |
|---|---|
| `README.md` | Wiki entry point and cleanup policy |
| `index.md` | List of active docs |
| `overview.md` | Project summary: features, tech stack, current state |
| `architecture-reference.md` | Architecture layers, flows, directory structure |
| `block-types-reference.md` | All 12 block types, data shapes, categories |
| `components-reference.md` | Editor/reader/UI component catalog |
| `hooks-reference.md` | Custom hooks reference |
| `stores-reference.md` | Zustand stores: state shape, actions, selectors |
| `audio-system.md` | Audio manager architecture, services, triggers |
| `sri-strategy.md` | CSP and Subresource Integrity policy for web bundle |
| `testing-guide.md` | Test structure, patterns, coverage, how to run |
| `final-migration-audit.md` | Current migration status and cleanup boundaries |
| `SCHEMA.md` | This maintenance policy |

## Page Rules

- Keep each page focused on one purpose.
- Prefer current state over historical narrative.
- Link to repository files when a file is the source of truth.
- Avoid dated duplicates such as `plan-YYYY-MM-DD.md`, `fixes-YYYY-MM-DD.md`, and `session-report-YYYY-MM-DD.md`.
- Do not store generated output, build artifacts, virtual environments, package caches, screenshots, or logs in `wiki/`.

## When To Add A Page

Add a page only when the information is expected to stay useful across multiple sessions:

- Architecture decisions that are still active.
- Product behavior that users or maintainers need to understand.
- Cross-cutting development rules.
- Stable setup or deployment instructions.

Use git history for completed plans, old reports, and temporary investigation notes.

## Cleanup Policy

Remove or rewrite a page when it:

- Describes a replaced architecture as if it is current.
- Duplicates another active page.
- Contains corrupted text or stale generated content.
- Is empty or only a placeholder.
- Depends on deleted source files or removed workflows.
