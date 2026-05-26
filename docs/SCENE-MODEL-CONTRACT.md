# Scene Model Contract

## Canonical Model

`SceneRecord + TimelineStep` is the persisted scene contract.

- `SceneRecord` owns scene metadata, timeline content, graph position, and scene-to-scene connections.
- `TimelineStep` owns executable scene events such as text, dialogue, choice, transition, background, character, audio, variable, effect, camera, and interactive object steps.
- New editor, preview, reader, save/load, and story-flow code should read canonical scene records first.

## Runtime Execution

- `lib/engine/useSceneExecutor.ts` is the runtime hook for timeline playback.
- The executor yields on text, dialogue, choice, and transition steps.
- Non-yielding steps are applied automatically to `sceneState`.
- Choice conditions use `lib/engine/conditionUtils.ts`.

## Compatibility Boundary

`Story` and `StoryScene` remain compatibility types for import/export and migration scenarios.

Allowed conversions:

- `SceneRecord -> StoryScene` only when a legacy reader/export shape is required.
- `StoryScene -> SceneRecord` only for migration or fallback when canonical scene data is missing.

Rules:

- Route conversions through `lib/scene-record-adapter.ts`.
- Do not duplicate conversion logic in components, hooks, or stores.
- Do not rebuild canonical scene metadata from legacy scene shapes during normal saves.
- Do not introduce uncontrolled dual-write behavior between canonical and legacy scene collections.

## State Ownership

- Persisted app state lives in `stores/use-app-store.ts`.
- Editor draft state lives in `stores/use-editor-store.ts`.
- New state should use Zustand directly, not React Context.
