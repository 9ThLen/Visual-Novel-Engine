# Migration Guide

Last updated: 2026-05-29

## Architecture Migration: Legacy → Canonical

The project is in transition from a legacy `Story/StoryScene` model to a canonical `SceneRecord + TimelineStep` model.

## Data Model Comparison

### Legacy Model (StoryScene)
```typescript
interface StoryScene {
  id: string;
  text: string;
  backgroundImageUri?: string | null;
  characters: CharacterSprite[];
  choices: Choice[];
  musicUri?: string | null;
  audioTriggers?: AudioTrigger[];
  blocks?: unknown[];              // Old block system (removed)
  splashScreen?: SplashScreenConfig;
  interactiveObjects?: InteractiveObject[];
  autoAdvance?: { enabled, delay, nextSceneId };
}
```

### Canonical Model (SceneRecord + TimelineStep)
```typescript
interface SceneRecord extends ProjectScene {
  storyId: string;
  description: string;
  tags: string[];
  connections: SceneConnection[];
  isStart: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ProjectScene {
  id: string;
  name: string;
  timeline: TimelineStep[];
  sceneState: SceneState;
  flowX: number;
  flowY: number;
}

interface TimelineStep {
  id: string;
  blockType: BlockType;            // 12 types
  data: BlockData;                 // Union of 12 data shapes
  collapsed: boolean;
  enabled: boolean;
  conditions?: Condition[];
}
```

## Conversion Functions

All conversions are centralized in `lib/scene-record-adapter.ts`:

| Function | Direction | Purpose |
|---|---|---|
| `sceneRecordToSceneScene()` | Canonical → Legacy | For legacy reader/export compatibility |
| `storySceneToSceneRecordDraft()` | Legacy → Canonical | For migration/import |

**Rule:** Never duplicate conversion logic in components, hooks, or stores.

## Migration Paths

### Path 1: New Scene Creation (Canonical-First)

```
User creates scene → createCanonicalStorySeed() → SceneRecord
                 → saveSceneRecord() → useAppStore
```

No legacy data is created. This is the preferred path.

### Path 2: Legacy Story Import

```
Import JSON → validateImportedStory() → Story
           → addStory() → useAppStore
           → buildCanonicalSceneRecordsFromLegacyScenes() → SceneRecord[]
```

Legacy `Story.scenes` is preserved for backward compatibility. Canonical records are generated automatically.

### Path 3: Runtime Reading (Dual Mode)

```
Reader resolves scene:
  1. Check sceneRecordsByStory[storyId][sceneId] → if exists, use canonical
  2. Check scenesByStory[storyId][sceneId] → if exists, use legacy
  3. Return null (scene not found)
```

Code: `lib/runtime-story.ts` → `buildRuntimeSceneSnapshot()`

### Path 4: Legacy Key Migration

```
App startup → migrateFromLegacyKeys()
           → Read old AsyncStorage keys (STORAGE_KEYS.STORIES, etc.)
           → Parse and normalize
           → Build canonical records via buildCanonicalSceneRecordsFromLegacyScenes()
           → Merge into current Zustand state (don't overwrite existing)
```

## Compatibility Rules

1. **Read canonical first.** Always check `sceneRecordsByStory` before `scenesByStory`.
2. **Convert through adapter.** Use `lib/scene-record-adapter.ts` for all conversions.
3. **No dual writes.** Don't write to both `scenesByStory` and `sceneRecordsByStory` in normal flow.
4. **Migration is one-time.** `migrateFromLegacyKeys()` runs once and merges; legacy keys are not read again.

## Legacy System Status

| Legacy System | Status | Location |
|---|---|---|
| `Story` / `StoryScene` | Compatibility only | `lib/types.ts` |
| `StoryScene.blocks[]` | Removed (was Atom/Molecule/Lego) | Kept as `unknown[]` for import only |
| `LegoScene` / Lego editor | Preserved, not primary | `stores/use-lego-store.ts`, `components/lego-editor/` |
| Atom/Molecule types | Preserved, not used | `lib/atom-types.ts`, `lib/molecule-types.ts` |
| Old Block/Node system | Removed | — |

## Future Removal Plan

When all readers and exports use the canonical model:

1. Remove `scenesByStory` from `useAppStore`.
2. Remove `StoryScene`, `Story` types from `lib/types.ts`.
3. Remove `scene-record-adapter.ts`.
4. Remove legacy selector `selectStoryScenes`.
5. Remove `migrateFromLegacyKeys()` and all `STORAGE_KEYS` legacy reading.
