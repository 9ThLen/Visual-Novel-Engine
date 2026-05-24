# 05 Verification

## Purpose

Фінальний verification pack для stabilization milestone після Phases 1-5.

## Automated Regression Suite

### Wave 1 boundary suite

```bash
pnpm test -- __tests__/unit/lib/runtime-story.test.ts __tests__/unit/stores/use-app-store-canonical.test.ts __tests__/unit/stores/use-app-store-scene-operations.test.ts
```

Expected:
- strict runtime path не використовує implicit legacy fallback
- canonical selectors не synthesize-ять scene records із `scenesByStory`
- canonical story seed і scene cleanup helpers проходять

### Stabilization regression suite

```bash
pnpm test -- __tests__/unit/lib/scene-record-adapter.test.ts __tests__/unit/lib/editor-scene-draft.test.ts __tests__/unit/lib/editor-scene-save.test.ts __tests__/unit/lib/runtime-story.test.ts __tests__/unit/lib/runtime-persistence.test.ts __tests__/unit/hooks/useReaderInitialization-canonical.test.ts __tests__/unit/lib/story-hooks-canonical-scene.test.ts __tests__/unit/stores/use-app-store-canonical.test.ts __tests__/unit/stores/use-app-store-scene-operations.test.ts __tests__/unit/lib/story-flow-graph.test.ts
```

Expected:
- canonical scene/runtime/story-flow contracts лишаються зеленими після Phase 5 cleanup

### Final type baseline

```bash
pnpm check
```

Expected:
- clean baseline without Phase 5-introduced type errors
- if any blocker remains, record exact files and rationale below

## Current Session Result

- Wave 1 boundary suite: Passed
  - `pnpm test -- __tests__/unit/lib/runtime-story.test.ts __tests__/unit/stores/use-app-store-canonical.test.ts __tests__/unit/stores/use-app-store-scene-operations.test.ts`
  - Result: 3 files, 16 tests passed
- Stabilization regression suite: Passed
  - `pnpm test -- __tests__/unit/lib/scene-record-adapter.test.ts __tests__/unit/lib/editor-scene-draft.test.ts __tests__/unit/lib/editor-scene-save.test.ts __tests__/unit/lib/runtime-story.test.ts __tests__/unit/lib/runtime-persistence.test.ts __tests__/unit/hooks/useReaderInitialization-canonical.test.ts __tests__/unit/lib/story-hooks-canonical-scene.test.ts __tests__/unit/stores/use-app-store-canonical.test.ts __tests__/unit/stores/use-app-store-scene-operations.test.ts __tests__/unit/lib/story-flow-graph.test.ts`
  - Result: 10 files, 34 tests passed
- `pnpm check`: Passed
  - `tsc --noEmit` exited with code `0`
- Manual smoke launch attempt: Blocked externally
  - `pnpm dev:web` exited with sandbox restriction when Expo tried to access `C:\Users\sidle\.expo\native-modules-cache\*`
  - Impact: browser-based manual QA was not executable in this session, but no app-level runtime regression was identified by automated verification

## Remaining Blockers

- External environment blocker for manual QA:
  - Expo web preview cannot be launched inside the current sandbox because access to `C:\Users\sidle\.expo\native-modules-cache\*` is restricted
  - Follow-up: rerun `pnpm dev:web` and the smoke scenarios from `05-MANUAL-QA.md` in an unrestricted local environment

## Sign-off Criteria

- All automated commands above have a recorded status
- Any remaining blocker is scoped, reproducible and clearly outside safe Phase 5 work
- Manual QA results are cross-referenced from `05-MANUAL-QA.md`
