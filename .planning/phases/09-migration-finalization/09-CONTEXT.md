# Phase 09: Migration Finalization - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Source:** User-provided migration remainder list + live code scan

<domain>
## Phase Boundary

Finish the remaining post-migration cleanup explicitly deferred from Phase 08.
This phase is focused on maintainability and type convergence:

- Decompose `components/story-reader-responsive.tsx`
- Move remaining audio story types from legacy `StoryScene` shape toward `TimelineStep`
- Normalize story import return type
- Reduce public legacy type usage
- Add explicit deprecation docs where legacy APIs remain

No story data schema changes unless they are backward-compatible and covered by existing import/migration paths.
</domain>

<decisions>
## Implementation Decisions

### Reader Decomposition
- Split `components/story-reader-responsive.tsx` into focused components:
  - `ReaderDisplay` for background, character rendering, and dialogue/text display
  - `ReaderControls` for top controls, skip/turbo controls, tap-to-continue UI, and history trigger
  - `ReaderTransitions` for scene fade/scale transition state and one-shot route notifications
  - `ReaderChoices` for choice rendering and selection
- Keep `StoryReaderResponsive` as the public orchestrator component.
- Do not change reader behavior: typewriter, autoplay, turbo skip, history drawer, choices, and transition routing must remain equivalent.
- Avoid React Context. Use props and existing hooks directly.

### Audio Type Refactor
- Replace `StorySceneExtended extends Omit<StoryScene, ...>` with a canonical type based on `TimelineStep[]`.
- Preserve `AudioTrigger`, `AudioTriggerType`, `AudioLibraryItem`, and playback manager interfaces.
- Keep legacy compatibility only as deprecated aliases/helpers where current code still needs it.

### Import Story Return Type
- `importStory()` should return one canonical shape, not `Story | CanonicalStory`.
- Canonical imported stories should use `StoryMetadata` + `SceneRecord` data.
- Legacy JSON import should still validate through `StoryValidator`, but convert the result before returning.

### StoryDomain Legacy Imports
- Remove `Story`/`StoryScene` imports from `lib/story-domain.ts`.
- `StoryDomain.extractMetadata()` should accept metadata fields plus scene count/source records, not a full legacy `Story`.
- `StoryDomain.createSaveSlot()` should accept minimal story fields and a minimal scene preview shape, not `StoryScene`.

### Deprecation Documentation
- Add `@deprecated` JSDoc to public APIs that still expose legacy types.
- Do not delete legacy types during this phase unless all current callers are migrated.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reader Runtime
- `components/story-reader-responsive.tsx` - current 500+ LOC reader orchestrator and embedded subcomponents
- `components/CharacterDisplay.tsx` - character rendering contract
- `components/dialogue-history.tsx` - history drawer contract
- `lib/reader-runtime.ts` - typed timeline display and choice helpers
- `lib/engine/useSceneExecutor.ts` - canonical runtime executor
- `lib/engine/types.ts` - `TimelineStep`, block data, `SceneRecord`, `SceneState`
- `hooks/useSceneImages.ts` - background and character image resolution
- `hooks/useTypewriter.ts` - typewriter contract

### Story and Audio Types
- `lib/audio-types.ts` - current `StorySceneExtended` and `StoryWithAudio`
- `lib/audio-interfaces.ts` - audio public interfaces
- `lib/audio-manager-enhanced.ts` - trigger scheduler facade
- `lib/audio-trigger-scheduler.ts` - `AudioTrigger` execution
- `lib/scene-operations.ts` - legacy `Story`, `StoryScene`, `Choice` with existing deprecation notes
- `lib/story-hooks.ts` - `importStory()` and `CanonicalStory`
- `lib/story-domain.ts` - metadata/save-slot helpers still importing legacy story types
- `stores/use-app-store.ts` - `StoryDomain.extractMetadata()` caller and legacy migration path
</canonical_refs>

<specifics>
## Specific Ideas

### Reader Split Suggested Files

- `components/reader/ReaderDisplay.tsx`
- `components/reader/ReaderControls.tsx`
- `components/reader/ReaderTransitions.tsx`
- `components/reader/ReaderChoices.tsx`
- Optional `components/reader/types.ts` only if shared prop types get noisy

`ReaderTransitions` can be implemented as a hook-like renderless component or hook if that matches the local code better. The public requested name should still exist as an exported API.

### importStory Canonicalization

Legacy import path can validate raw JSON with `StoryValidator.validateStory(raw)`, assign new ids/timestamps, then use existing canonical scene conversion helpers before writing to store and returning `CanonicalStory`.

### Audio Timeline Shape

Use `TimelineStep[]` as the scene-level audio carrier. Music/sound blocks already exist in `lib/engine/types.ts`; `AudioTrigger[]` can remain as a scene-level auxiliary field only if marked deprecated or explicitly scoped to the trigger scheduler.
</specifics>

<deferred>
## Deferred Ideas

- Removing `Story`, `StoryScene`, and `Choice` entirely from `lib/scene-operations.ts`
- Removing `lib/types.ts` entirely
- Implementing runtime behavior for deferred `sound`, `camera`, or `interactive_object` executor handlers
- Any visual redesign of the reader UI
</deferred>

---

*Phase: 09-migration-finalization*
*Context gathered: 2026-05-31 via user request and code scan*
