# Scene Model Contract

## Canonical model

Canonical model: `SceneRecord`

- The canonical persisted scene contract is `SceneRecord + TimelineStep`.
- All new editor, persistence and story reconstruction logic must read canonical scene data first.
- `SceneRecord` owns timeline content, scene metadata, graph positioning and scene-to-scene connections.

## Compatibility model

Compatibility model: `StoryScene`

- `StoryScene` remains a temporary compatibility representation for legacy reader-facing flows.
- `StoryScene` is not the source of truth for new scene edits.
- Any compatibility conversion must route through `lib/scene-record-adapter.ts`.

## Allowed conversions

- `SceneRecord -> StoryScene` for legacy reader or export paths that still require the old structure.
- `StoryScene -> SceneRecord draft` for transitional migration or compatibility fallback when only legacy scene data exists.
- Canonical selectors may fall back to a compatibility conversion only when no canonical record exists yet.

## Disallowed access patterns

- Do not read from `scenesByStory` first when canonical scene records are available.
- Do not duplicate scene-shape conversion logic across hooks, store selectors and components.
- Do not overwrite canonical scene metadata by rebuilding records from scratch during generic save helpers.
- Do not introduce new uncontrolled dual-write behavior between `sceneRecordsByStory` and `scenesByStory`.

## Phase boundaries

- Phase 1 defines the canonical contract, the adapter boundary and canonical store access helpers.
- Phase 2 repairs editor load/save lifecycle on top of the canonical scene model.
- Phase 3 aligns story reconstruction, preview, reader and persistence around canonical-first access.
- Phase 4 stabilizes SceneManager, StoryFlow and scene-level operations.
- Phase 5 removes or isolates legacy flows and updates public documentation.
