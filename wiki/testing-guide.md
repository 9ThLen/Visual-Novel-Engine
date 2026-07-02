# Testing Guide

Last updated: 2026-07-02

## Commands

```bash
corepack pnpm run test
corepack pnpm run check
corepack pnpm run lint
corepack pnpm run check:editor-boundaries
corepack pnpm run check:reader-audio-boundaries
```

## Test Setup

- Runner: Vitest with globals enabled.
- Setup: `vitest.setup.ts`.
- Module aliases and mocks are configured through `vitest.config.ts` and `vitest.setup.ts`.
- Tests live under `__tests__/unit`.

## Current Coverage Areas

| Area | Representative tests |
|---|---|
| Reader UI | `__tests__/unit/components/ReaderDisplay.test.tsx`, `ReaderControls.test.tsx`, `ErrorBoundary.test.tsx` |
| App store slices | `__tests__/unit/stores/app-store-slices.test.ts` |
| Scene persistence | `__tests__/unit/lib/app-store-storage.test.ts`, `scene-record-storage.test.ts` |
| Reader lazy loading | `__tests__/unit/lib/scene-access.test.ts`, `reader-scene-cache.test.ts`, `reader-runtime-snapshot.test.ts` |
| Engine runtime | `__tests__/unit/lib/useSceneExecutor.test.ts`, `conditionUtils` tests |
| Audio runtime | `__tests__/unit/use-reader-audio.test.ts`, audio service tests |
| Import/export | `__tests__/unit/lib/story-hooks-import.test.ts`, manuscript tests |

## Testing Rules

- Prefer behavioral tests over render-only smoke tests.
- Keep mocks centralized in `__mocks__` and `vitest.setup.ts`.
- Store tests should exercise slice behavior directly when possible.
- Reader tests should cover visible state and callbacks, not internal implementation details.
- Add regression tests before changing persistence, migration, reader audio, or scene hydration logic.
- Dev diagnostic logs should use `shouldLogDevDiagnostics()` so Vitest output stays readable.
