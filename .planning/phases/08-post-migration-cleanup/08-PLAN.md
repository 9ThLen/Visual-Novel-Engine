# Phase 08 — Post-Migration Cleanup

## Objective

Close remaining tech debt from the block-system → SceneRecord/TimelineStep migration. No new features, no runtime behavior changes.

## Source Findings

- `migration-assessment.md` identifies 7 remaining items after Phase 07
- 6 pre-existing test failures across 5 test files
- `lib/canonical-scene.ts` (36 LOC, 3 functions) has only 2 consumers — can inline
- `lib/audio-types.ts` imports `Story`/`StoryScene` from `./types` via re-export (works but inconsistent)
- `lib/story-domain.ts` `extractMetadata()` and `createSaveSlot()` take full `Story` objects where only 3-4 fields are needed
- `lib/story-validator.ts` imports from `./types` — should import from `./scene-operations` for clarity
- `wiki/architecture-reference.md` still documents old type layout

## Scope

### In Scope

- Fix pre-existing test failures in `__tests__/unit/` (5 files, 6 failures)
- Integrate `lib/canonical-scene.ts` into its consumers
- Update `lib/audio-types.ts` import path from `./types` to `./scene-operations`
- Update `lib/story-validator.ts` import path from `./types` to `./scene-operations`
- Refactor `lib/story-domain.ts` `extractMetadata` and `createSaveSlot` to accept fields instead of full `Story`
- Update `wiki/architecture-reference.md` with new type layout

### Out of Scope

- Decomposing `components/story-reader-responsive.tsx` (major refactor)
- Removing `Story`/`StoryScene` from `lib/scene-operations.ts` (blocked on `migrateFromLegacyKeys`)
- Full removal of `lib/types.ts` (blocked on moving `UserSettings` + updating ~30 import sites)
- Rewriting `audio-types.ts` `StorySceneExtended` to use `TimelineStep` directly

## Implementation Plan

### Wave 1 — Test Fixes

| Task | File | Effort |
|------|------|--------|
| 1a | `__tests__/unit/lib/smoke.test.ts` — replace `await import()` with static import | ~5 min |
| 1b | `__tests__/unit/lib/theme-runtime.test.ts` — replace `await import()` with `vi.importActual()` or static imports | ~10 min |
| 1c | `__tests__/unit/lib/tailwind-theme-colors.test.ts` — trace `build-tailwind-theme-colors` module and fix path | ~10 min |
| 1d | `__tests__/unit/lib/useSceneExecutor.test.ts` — fix mock infrastructure timing (4 subtests) | ~30 min |
| 1e | `__tests__/unit/stores/use-app-store-scene-operations.test.ts` — fix `outputPort` expected value (`choice_0` → `choice-1`) | ~5 min |

**Dependencies:** None. All 5 test fixes are independent — run in parallel.

**Verification:** `pnpm vitest run --reporter=tap` — count passed/failed. Target: 36/36 passing (or same pre-existing count if some remain).

### Wave 2 — Library Cleanup

**Depends on:** Wave 1 (test fixes first to establish baseline).

| Task | Description |
|------|-------------|
| 2a | **Inline `canonical-scene.ts`** — move `getCanonicalSceneRecordFromState` + `getCanonicalSceneRecordsForStoryFromState` into `stores/use-app-store.ts`; move `updateSceneRecordPreservingMeta` + type exports into `lib/editor-scene-save.ts`; delete `lib/canonical-scene.ts`; `npm run check` |
| 2b | **Update `audio-types.ts` import** — change `import type { Story, StoryScene } from './types'` → `import type { Story, StoryScene } from './scene-operations'` |
| 2c | **Update `story-validator.ts` import** — change `import { Story, StoryScene, Choice } from './types'` → `import { Story, StoryScene, Choice } from './scene-operations'` |
| 2d | **Refactor `story-domain.ts`** — change `extractMetadata(story: Story)` to accept `extractMetadata(fields: { id, title, ... })`; change `createSaveSlot(slotId, story, ...)` to `createSaveSlot(slotId, storyFields, ...)`; remove `import { Story, StoryScene } from './scene-operations'` if no longer needed |
| 2e | **Update `wiki/architecture-reference.md`** — replace old type layout with current (Story→scene-operations.ts, PlaybackState→engine/types.ts, SaveSlot→story-domain.ts, UserSettings→types.ts) |

**Dependencies:** 2a can run alongside 2b/2c. 2d is independent. 2e runs last.

**Verification:** `npm run check` after each task.

## Acceptance Criteria

- All 6 pre-existing test failures resolved (36/36 passing, excluding known CJS `await import()` infrastructure limitations if they persist)
- `lib/canonical-scene.ts` deleted — its 3 functions live in `use-app-store.ts` and `editor-scene-save.ts`
- `lib/audio-types.ts` imports from `./scene-operations` directly
- `lib/story-validator.ts` imports from `./scene-operations` directly
- `lib/story-domain.ts` `extractMetadata` and `createSaveSlot` accept field objects instead of `Story`
- `wiki/architecture-reference.md` accurately describes the current type layout
- `npm run check` passes

## Verification

- `corepack pnpm run check`
- `corepack pnpm vitest run --reporter=tap`
- `git diff --stat` to review file changes

## Risk Notes

- `useSceneExecutor.test.ts` (4 subtests) may have deeper mock-infrastructure issues — if fixing is non-trivial, document the root cause and defer to a follow-up
- Inlining `canonical-scene.ts` requires updating imports in `use-app-store.ts`, `editor-scene-draft.ts`, and `editor-scene-save.ts` — ensure no circular imports are created
- `story-domain.ts` refactor changes the public API for `extractMetadata` and `createSaveSlot` — all callers (currently only within the same file and `reader-runtime.ts`) must be updated

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-add-tests`
- `gsd-code-review`

---

**must_haves:**
- Pre-existing test failures resolved
- `lib/canonical-scene.ts` removed (functions inlined)
- Import paths in `audio-types.ts` and `story-validator.ts` point to `./scene-operations`
- `story-domain.ts` no longer depends on full `Story` type
- Architecture docs reflect current type layout
- `npm run check` passes
