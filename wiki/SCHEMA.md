# Wiki Schema

This wiki is intentionally small. It should describe the current project, not preserve every historical work log.

## Active Pages

- `README.md` - wiki entry point and cleanup policy.
- `index.md` - list of active docs.
- `overview.md` - current product and technical summary.
- `architecture-reference.md` - current architecture reference.
- `SCHEMA.md` - this maintenance policy.

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
