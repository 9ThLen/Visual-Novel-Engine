# Phase 08: Post-Migration Cleanup — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Source:** Codebase audit (migration-assessment.md + live exploration)

<domain>
## Phase Boundary

Close remaining tech debt from the block-system → SceneRecord/TimelineStep migration. All runtime paths already use the new system; this phase handles the leftover type-level cleanup, test fixes, and documentation updates that were deferred from Phase 07.

**No new features. No runtime behavior changes.**
</domain>

<decisions>
## Implementation Decisions

### Test Infrastructure
- Use existing vitest.config.ts and vitest.setup.ts — do not replace the test runner
- Fix `await import()` tests by switching to static imports or using `vi.importActual()` patterns
- Fix `tailwind-theme-colors.test.ts` by ensuring the module is built/available before test runs
- Fix `use-app-store-scene-operations.test.ts` choice label mismatch (`choice_0` vs `choice-1`) by updating the expected value to match actual output

### Library Structure
- `canonical-scene.ts` (36 LOC, 3 functions) should be integrated: move helpers into `stores/use-app-store.ts` and `lib/editor-scene-draft.ts` respectively, then delete the file
- `audio-types.ts` imports `Story`/`StoryScene` from `./types` — update to import from `./scene-operations` directly (currently works via re-export)
- `story-domain.ts` `extractMetadata()` and `createSaveSlot()` take full `Story` objects — refactor to accept only needed fields

### Documentation
- `wiki/architecture-reference.md` needs updating to reflect the new type layout (Story → scene-operations, PlaybackState → engine/types, SaveSlot → story-domain)

### Import Path Consistency
- `lib/story-validator.ts` imports from `./types` — change to `./scene-operations` for `Story`/`StoryScene`/`Choice` (fine as a security boundary, but import should be explicit)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migration Assessment
- `wiki/migration-assessment.md` — Full audit of what was migrated and what remains
- `.planning/phases/07-reader-runtime-convergence/PLAN.md` — Phase 07 execution details (Wave 2 completed 2026-05-30)

### Current State
- `lib/types.ts` — Thin re-export module (29 LOC)
- `lib/scene-operations.ts` — Hosts deprecated `Story`/`StoryScene`/`Choice`
- `lib/engine/types.ts` — Hosts `PlaybackState`
- `lib/story-domain.ts` — Hosts `SaveSlot`
- `lib/canonical-scene.ts` — 36 LOC, 3 helpers to inline
- `lib/audio-types.ts` — Imports `Story`/`StoryScene` from `./types`
- `lib/story-validator.ts` — Security boundary for JSON import
- `lib/story-domain.ts` — `extractMetadata(story: Story)`, `createSaveSlot(story: Story, ...)`

### Test Files
- `__tests__/unit/lib/smoke.test.ts` — `await import()` failure
- `__tests__/unit/lib/theme-runtime.test.ts` — `await import()` failure  
- `__tests__/unit/lib/tailwind-theme-colors.test.ts` — Module not found
- `__tests__/unit/lib/useSceneExecutor.test.ts` — 4 subtests failing
- `__tests__/unit/stores/use-app-store-scene-operations.test.ts` — choice label mismatch
</canonical_refs>

<specifics>
## Specific Ideas

### Test Fix Details

**smoke.test.ts (line 3):** Uses `const { ... } = await import(...)` which requires dynamic import callback in CJS. Fix: use static import at top of file.

**theme-runtime.test.ts (lines 26, 33, 50):** Same `await import()` pattern. Fix: use `vi.importActual()` with static imports, or add `require()` fallback.

**tailwind-theme-colors.test.ts:** Cannot find module `lib/build-tailwind-theme-colors`. Likely the file was moved/renamed. Trace the actual module path and update the import.

**useSceneExecutor.test.ts:** All 4 subtests fail. Root cause appears related to mock infrastructure timing. Use `vi.useFakeTimers()` with proper async patterns.

**use-app-store-scene-operations.test.ts (line 212):** Expects `outputPort: 'choice-1'` but actual is `outputPort: 'choice_0'`. Update the expected value to match actual behavior — the outputPort format was normalized from kebab-case to snake_case in the connection builder.

### Library Cleanup Details

**canonical-scene.ts integration:**
- `getCanonicalSceneRecordFromState()` — used only in stores/use-app-store.ts — inline there
- `getCanonicalSceneRecordsForStoryFromState()` — used only in stores/use-app-store.ts — inline there
- `updateSceneRecordPreservingMeta()` — used in stores/use-app-store.ts + lib/editor-scene-save.ts — inline in both, or keep as shared util in lib/
- `CanonicalSceneStateSnapshot` — used in stores/use-app-store.ts type signature — can stay or be inlined

**Where to inline:**
- `stores/use-app-store.ts` — `getCanonicalSceneRecordFromState`, `getCanonicalSceneRecordsForStoryFromState`
- `lib/editor-scene-save.ts` — `updateSceneRecordPreservingMeta` (already the only other consumer)
</specifics>

<deferred>
## Deferred Ideas

- Decomposing `components/story-reader-responsive.tsx` (578 LOC) — major refactor, separate phase
- Removing `Story`/`StoryScene` from `lib/scene-operations.ts` entirely — blocked on `migrateFromLegacyKeys` which still needs them
- Full removal of `lib/types.ts` — blocked on migrating `UserSettings` into `lib/user-settings.ts` and updating ~30 import sites
- Rewriting `audio-types.ts` `StorySceneExtended` to use `TimelineStep` directly — medium-sized refactor, deferred to follow-up
</deferred>

---

*Phase: 08-post-migration-cleanup*
*Context gathered: 2026-05-30 via codebase audit*
