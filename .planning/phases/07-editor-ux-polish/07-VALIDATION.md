---
phase: "07"
phase_slug: editor-ux-polish
status: draft
created: 2026-05-25
---

# Phase 7: Editor UX Polish — Validation Strategy

**Status:** Draft

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter dot` |
| Full suite command | `npm test` |

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLISH-01 | Undo/redo buttons render correctly | manual / component test | n/a (UI-only) | ❌ — manual QA |
| POLISH-02 | Keyboard shortcuts trigger correct actions | integration | `npx vitest run .planning/spikes/004-keyboard-shortcuts/test-keyboard-shortcuts.ts` | ❌ Wave 0 |
| POLISH-03 | ConfirmDialog prevents accidental delete | unit | `npx vitest run components/ui/__tests__/ConfirmDialog.test.tsx` | ❌ Wave 0 |
| POLISH-04 | Saving indicator shows feedback | manual | n/a (visual only) | ❌ — manual QA |
| POLISH-05 | ErrorBoundary catches editor errors | integration | `npx vitest run components/editor/__tests__/ErrorBoundary.test.tsx` | ❌ Wave 0 |

## Sampling Rate

- **Per task commit:** `npx vitest run --reporter dot`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm run check` clean + `npm test` green before `/gsd-verify-work`

## Wave 0 Gaps

- [ ] `components/ui/__tests__/ConfirmDialog.test.tsx` — covers POLISH-03: renders modal, confirm/cancel callbacks
- [ ] `components/editor/__tests__/ErrorBoundary-wrapping.test.tsx` — covers POLISH-05: catches errors in child, shows retry
