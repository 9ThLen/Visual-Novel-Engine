# Scene Model Contract

## Canonical Model

`SceneRecord + TimelineStep` is the persisted scene contract.

- `SceneRecord` owns scene metadata, timeline content, graph position, and scene-to-scene connections.
- `TimelineStep` owns executable scene events such as text, dialogue, choice, transition, background, character, audio, variable, effect, camera, and interactive object steps.
- Plate is the only active scene editing system.
- `components/editor/plate/` edits this canonical model; it must not persist a separate Plate JSON document.
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
- Legacy editor draft state lives in `stores/use-editor-store.ts` and must not be imported by active scene editor screens.
- New state should use Zustand directly, not React Context.

## Active Editor Boundary

- Active scene editing enters through `components/editor/plate/PlateSceneEditor.tsx`.
- Legacy Lego UI is isolated under `components/editor-legacy/`.
- Active routes and active `components/editor/**` files must not import `components/editor-legacy`, `SceneComposer`, `TimelinePanel`, `BlockLibraryPanel`, `PropertiesPanel`, or `stores/use-editor-store`.
- The boundary is enforced by `pnpm check:editor-boundaries`.
