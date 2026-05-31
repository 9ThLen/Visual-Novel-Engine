# Phase 11 - Runtime Quality Gates

**Status:** Planned
**Created:** 2026-05-31
**Priority:** P0

## Objective

Restore the project quality gates and fix the reader/runtime regressions found by the audit:

- `corepack pnpm run lint` fails with 20 errors
- web export fails on Windows/Node 24 with Metro config loading error
- reader can stall when a scene ends without an explicit transition
- reader records choice navigation as `choiceId: "transition"` instead of the selected option id
- `useSceneExecutor` can reuse stale state because `timelineKey` ignores block data changes
- reader tap flow requires extra taps because UI typewriter state and executor typing state are not synchronized

## Scope

### In Scope

1. Fix reader navigation correctness.
2. Fix executor reset/stale-state behavior.
3. Fix reader tap/typewriter synchronization.
4. Make lint pass without weakening lint rules.
5. Make web export runnable under the supported local Node setup, or document/enforce the required Node version.
6. Add targeted regression tests for the runtime issues.

### Out of Scope

- Full redesign of `StoryReaderResponsive`.
- Implementing sound/camera/interactive_object executor behavior.
- Large UI polish unrelated to lint/runtime failures.
- Re-opening closed Phase 07/09/10 plan docs.

## Execution Plan

### Wave 1 - Reader Runtime Correctness

**Files:**

- `components/story-reader-responsive.tsx`
- `app/reader.tsx`
- `lib/engine/useSceneExecutor.ts`
- `__tests__/unit/lib/useSceneExecutor.test.ts`
- new or existing reader component tests

**Tasks:**

1. Add a choice callback path from `StoryReaderResponsive` to `ReaderScreen`.
   - When executor `selectChoice(optionId)` is called, also notify parent with `{ sceneId, choiceId, targetSceneId }`.
   - `ReaderScreen` must append the real selected `choiceId`, not `"transition"`.

2. Handle executor completion in the reader.
   - Pass `routeOnExecutorComplete={true}` from `app/reader.tsx`, or replace the prop with a clearer reader-specific completion handler.
   - If no next scene exists, end reader playback and navigate back/home consistently.

3. Synchronize typewriter and executor advance.
   - One tap while UI text is typing should complete UI text and mark executor typing complete in the same interaction.
   - Next tap should advance to the next yielding block.
   - Avoid the current three-tap flow.

4. Strengthen `timelineKey`.
   - Include stable step identity plus `enabled`, `conditions`, `blockType`, and `data` fingerprints.
   - Keep it deterministic and cheap enough for normal scene timelines.

**Acceptance Criteria:**

- Choosing an option records that option id in `choicesMade`.
- A terminal scene without a transition no longer leaves the reader stuck.
- Text/dialogue advance requires no redundant executor-only tap.
- Editing middle timeline block data causes executor state to reset/recompute.

### Wave 2 - Lint Gate Recovery

**Files:**

- `components/editor/TimelinePanel.tsx`
- `components/story-reader-responsive.tsx`
- `components/editor/MiniPreview.tsx`
- `components/editor/BlockLibraryPanel.tsx`
- `components/editor/modals/CharacterCreator.tsx`
- secondary warning files if cheap and local

**Tasks:**

1. Replace `any` casts with discriminated `TimelineStep` helpers.
   - Use `switch (step.blockType)` and typed block data aliases from `lib/engine/types.ts`.
   - Add narrow local helper types only when the existing union is insufficient.

2. Remove unescaped JSX quotes in `TimelinePanel`.

3. Remove unused imports/variables where local and obvious.

4. Fix duplicate imports in `app/reader.tsx` and `PropertiesPanel`.

5. Keep existing lint strictness.
   - Do not disable `@typescript-eslint/no-explicit-any`.
   - Do not add broad eslint ignores for app code.

**Acceptance Criteria:**

- `corepack pnpm run lint` exits 0.
- No new lint disable comments unless narrowly justified.

### Wave 3 - Web Export Gate

**Files:**

- `package.json`
- `metro.config.js`
- `app.config.js`
- optional `.nvmrc` / `.node-version`
- docs if needed

**Tasks:**

1. Confirm expected Node version for Expo SDK 54.
   - SDK 54 requires Node >= 20.19.4.
   - Current local Node 24.14.1 triggers `ERR_UNSUPPORTED_ESM_URL_SCHEME` while loading `metro.config.js` on Windows.

2. Prefer enforcing a known-good Node 20 LTS path.
   - Add `.nvmrc` / `.node-version` with Node 20 LTS if project conventions allow.
   - Add a preflight script or README note for Windows export.

3. Re-test export with the supported Node version.
   - If export still fails on Node 20, investigate Metro/NativeWind config.
   - Keep `metro.config.js` CommonJS unless a verified Expo/Metro fix requires otherwise.

**Acceptance Criteria:**

- Web export command is documented and reproducible.
- On supported Node, `node node_modules/expo/bin/cli export --platform web` exits 0.
- If Node 24 remains unsupported, failure is caught before the export with a clear message.

## Tests

Add or update tests for:

1. `useSceneExecutor` resets when a middle step's data changes.
2. `useSceneExecutor` exposes completion after final yielding step advance.
3. Reader choice selection passes the selected option id to parent.
4. Reader completion handler fires for a timeline without transition.
5. Existing audio/runtime tests still pass.

## Verification

Run in this order:

1. `corepack pnpm run check`
2. `corepack pnpm run test`
3. `corepack pnpm run lint`
4. `node node_modules/expo/bin/cli export --platform web`

If web export fails twice with the same Metro/Windows path error:

1. Stop and verify Node 20 LTS.
2. Check Expo SDK 54 Metro/NativeWind compatibility.
3. Apply the smallest config/runtime-version fix.

## Risk Notes

- `StoryReaderResponsive` still supports legacy `scene` mode. Keep changes guarded by `usingExecutor` unless deliberately touching both paths.
- `useSceneExecutor` state changes can affect PreviewScreen and PlayMode. Run targeted editor preview tests after changing executor behavior.
- The repo currently has many unrelated dirty files. Keep implementation diffs scoped to the files above.

## Done Criteria

- Reader runtime issues fixed and covered by tests.
- `check`, `test`, and `lint` all pass.
- Web export has either a passing run or an enforced/documented supported Node path.
- ROADMAP marks Phase 11 as the follow-up quality gate phase.
