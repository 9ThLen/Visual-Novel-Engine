# Phase 09 - Migration Finalization

## Objective

Finish the remaining migration cleanup after Phase 08 by decomposing the reader and removing the highest-value legacy type surfaces without changing runtime behavior.

## Source Findings

- `components/story-reader-responsive.tsx` still owns rendering, controls, transition effects, typewriter coordination, history, choices, and executor routing in one component.
- `lib/audio-types.ts` still models `StorySceneExtended` from legacy `StoryScene` instead of canonical `TimelineStep`.
- `lib/story-hooks.ts` returns `Promise<CanonicalStory | Story>` from `importStory()`, forcing callers to handle mixed story shapes.
- `lib/story-domain.ts` imports `Story` and `StoryScene` only to read a small subset of fields.
- Legacy public types already have some `@deprecated` JSDoc in `lib/scene-operations.ts`, but not every public legacy-facing API is documented.

## Scope

### In Scope

- Decompose `components/story-reader-responsive.tsx` into:
  - `ReaderDisplay`
  - `ReaderControls`
  - `ReaderTransitions`
  - `ReaderChoices`
- Refactor `lib/audio-types.ts` so story audio types use `TimelineStep` and canonical scene data instead of `StorySceneExtended extends StoryScene`.
- Change `importStory()` to return one canonical type.
- Remove `Story`/`StoryScene` imports from `lib/story-domain.ts`.
- Add `@deprecated` JSDoc to public APIs that still accept or return legacy types.
- Add focused tests where behavior or type contracts change.

### Out of Scope

- Removing `Story`, `StoryScene`, or `Choice` entirely from `lib/scene-operations.ts`.
- Removing `lib/types.ts`.
- Reader visual redesign.
- Runtime implementation of currently deferred executor block behavior.
- Persistent schema migration beyond existing legacy import conversion.

## Implementation Plan

### Wave 1 - Reader Decomposition

| Task | Description |
|------|-------------|
| 1a | Create `components/reader/ReaderChoices.tsx` for choice list rendering and selection. Props should use `ReaderChoice[]`, `fontSize`, colors, `onSelectChoice`, and i18n label text. |
| 1b | Create `components/reader/ReaderControls.tsx` for auto toggle, log button, tap-to-continue, and skip/turbo control. Preserve current accessibility labels and callbacks. |
| 1c | Create `components/reader/ReaderDisplay.tsx` for background, characters, speaker nameplate, displayed text, cursor, dialogue shell, and embedded `ReaderChoices`. Keep `CharacterDisplay` usage unchanged. |
| 1d | Create `components/reader/ReaderTransitions.tsx` to own fade/scale shared values and one-shot `onTransition()` / completion routing guards. Export animated styles or render via function child, whichever keeps hooks valid and simple. |
| 1e | Rewrite `StoryReaderResponsive` as an orchestrator: executor, typewriter/history/autoplay/turbo state, image resolution, and props into the new reader components. |

**Dependencies:** 1a and 1b can run first. 1c depends on 1a. 1d can run independently but should be integrated in 1e.

**Acceptance for Wave 1:**
- `StoryReaderResponsive` keeps the same public props.
- Reader behavior is unchanged for background, characters, text, choices, autoplay, turbo skip, history drawer, and route transitions.
- No React Context introduced.
- No NativeWind `active:` on `Pressable`.

### Wave 2 - Canonical Story/Audio Types

| Task | Description |
|------|-------------|
| 2a | Refactor `lib/audio-types.ts`: replace `StorySceneExtended` with a canonical scene audio type based on `SceneRecord`/`TimelineStep[]`, e.g. `AudioTimelineScene` or `StorySceneAudioTimeline`. |
| 2b | Keep legacy audio story types only as deprecated aliases if current consumers require them. Add precise `@deprecated` JSDoc and migration target. |
| 2c | Update imports and consumers of `StorySceneExtended` / `StoryWithAudio`. If no external consumer exists, remove those exports or replace with canonical exports. |
| 2d | Change `importStory()` return type to `Promise<CanonicalStory>`. Convert legacy validated `Story` data into canonical scene records before writing to the store and returning. |
| 2e | Add or update tests for canonical import of both canonical JSON and legacy JSON. |

**Dependencies:** 2a-2c are independent from reader work. 2d depends on existing scene conversion helpers in `lib/scene-operations.ts`.

**Acceptance for Wave 2:**
- `importStory()` has no `Story | CanonicalStory` union.
- Legacy JSON import still works.
- Canonical JSON import still works.
- `audio-types.ts` no longer defines `StorySceneExtended extends Omit<StoryScene, ...>`.

### Wave 3 - StoryDomain and Deprecation Cleanup

| Task | Description |
|------|-------------|
| 3a | Refactor `StoryDomain.extractMetadata()` to accept a minimal metadata input plus scene count/source records. Update `stores/use-app-store.ts` caller. |
| 3b | Refactor `StoryDomain.createSaveSlot()` to accept minimal story fields and minimal scene preview fields. Remove `Story`/`StoryScene` imports from `lib/story-domain.ts`. |
| 3c | Audit public exports that still expose legacy `Story`, `StoryScene`, `Choice`, legacy audio story shapes, or legacy import paths. Add `@deprecated` JSDoc with canonical replacement. |
| 3d | Update architecture docs if touched APIs move or change names. |

**Dependencies:** 3a and 3b can run after Wave 2 or in parallel if import call sites are isolated. 3c should run after 2a-2d so deprecation docs match final names.

**Acceptance for Wave 3:**
- `lib/story-domain.ts` does not import `Story` or `StoryScene`.
- Legacy public APIs that remain have `@deprecated` JSDoc and a canonical replacement.
- TypeScript check passes without broad `as any` additions.

## Verification

- `corepack pnpm run check`
- `corepack pnpm vitest run __tests__/unit/lib/useSceneExecutor.test.ts --reporter=tap`
- Targeted import-story tests, existing or new:
  - canonical story JSON import
  - legacy story JSON import
- `corepack pnpm vitest run --reporter=tap` if the local Vitest environment is stable
- `corepack pnpm exec node node_modules/expo/bin/cli export --platform web`
- Manual smoke:
  - reader opens a timeline scene
  - tap completes typing then advances
  - choices render and route
  - transition block routes once
  - log drawer opens/closes
  - skip/turbo still advances

## Risk Notes

- Reader decomposition can cause subtle hook-order or animated-style issues. Keep hooks in stable components and avoid conditional hook calls.
- `ReaderTransitions` must not call `onTransition()` repeatedly while executor state remains transitioning.
- Legacy import conversion can accidentally lose `audioLibrary`, `thumbnailUri`, or start scene selection. Test both canonical and legacy imports.
- Audio type refactor is mostly compile-time, but audio manager interfaces still depend on `AudioTrigger`; do not rename trigger types unless all callers are updated.

## Recommended Follow-Up Skills

- `gsd-execute-phase`
- `gsd-add-tests`
- `gsd-code-review`

---

**must_haves:**
- `StoryReaderResponsive` decomposed into `ReaderDisplay`, `ReaderControls`, `ReaderTransitions`, and `ReaderChoices`
- Reader public props and runtime behavior preserved
- `audio-types.ts` story audio shape based on `TimelineStep`/canonical scene data
- `importStory()` returns one canonical type
- `story-domain.ts` no longer imports `Story`/`StoryScene`
- Remaining public legacy APIs have `@deprecated` JSDoc
- `corepack pnpm run check` passes

## Execution Result

Status: implemented on 2026-05-31.

- Wave 1 complete: reader UI split into `components/reader/*`, with `StoryReaderResponsive` left as orchestrator.
- Wave 2 complete: audio story type surface is canonical/timeline based, and `importStory()` returns `CanonicalStory`.
- Wave 3 complete: `story-domain.ts` no longer imports legacy story types, and touched legacy public APIs are documented with `@deprecated`.

Verification:

- `corepack pnpm run check`: passed.
- Targeted Vitest:
  - `useSceneExecutor.test.ts`: passed.
  - `story-domain.test.ts`: passed.
  - `story-hooks-import.test.ts`: passed.
- `git diff --check` on touched files: passed.
- Web export blocked by Windows Metro/NativeWind ESM loader path issue (`ERR_UNSUPPORTED_ESM_URL_SCHEME`, raw `D:\...` path passed to import).
