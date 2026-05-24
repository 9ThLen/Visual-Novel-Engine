# VNE Editor Redesign — Implementation Plan

## Overview

This document describes the complete redesign of the Visual Novel Engine editor.
The current editor (scene-editor.tsx + LegoFlowWorkspace + LegoCanvas) works poorly
in practice. We replace it with a new architecture built around:

1. **Event System** — the core data model for everything that happens in a scene
2. **Timeline System** — step-by-step event execution with rollback/replay/preview
3. **Scene Runtime Engine** — renders scenes during editing and playback
4. **Asset System** — centralized resource library
5. **Scene Composer UI** — vertical block-based editor (the "Lego" metaphor)
6. **Story Flow System** — node-graph scene map
7. **Variables & Logic System** — visual condition builder
8. **Audio System** — music, SFX, voice
9. **Animation & Effects System** — cinematic presentation
10. **Optimization** — lazy loading, virtualization, memory cleanup
11. **Export System** — desktop, mobile, web

---

## Architecture Principles

### Data Model

```
Project
 ├── metadata: ProjectMeta
 ├── scenes: Scene[]
 ├── characters: Character[]
 ├── assets: AssetDatabase
 ├── variables: Variable[]
 └── settings: ProjectSettings

Scene
 ├── metadata: SceneMeta
 ├── timeline: TimelineStep[]
 ├── state: SceneState
 └── graphNode: SceneGraphNode  (position in story flow)

TimelineStep
 ├── index: number
 ├── event: Event              (union of all event types)
 ├── conditions: Condition[]   (optional)
 └── duration: number          (ms, for rendering)

Event (union type)
 ├── BackgroundEvent
 ├── CharacterSpawnEvent
 ├── CharacterModifyEvent
 ├── DialogueEvent
 ├── NarrationEvent
 ├── ChoiceEvent
 ├── VariableEvent
 ├── MusicEvent
 ├── SoundEvent
 ├── TransitionEvent
 ├── CameraEvent
 ├── InteractiveObjectEvent
 └── EffectEvent
```

### Key Design Decisions

1. **Events are the single source of truth.** Every block in the UI produces events.
   The timeline is just an ordered list of events. The runtime executes events
   sequentially.

2. **Blocks are a UI convenience.** Under the hood, each block serializes to
   one or more timeline events. When a user drags a "Dialogue" block, it creates
   a `DialogueEvent` on the timeline.

3. **The old Atom/Molecule system is replaced.** Atoms and Molecules were an
   intermediate abstraction that added complexity without benefit. The new
   system goes: UI Block → Event → Runtime. No intermediate layer.

4. **Backward compatibility.** Existing `Story` / `StoryScene` types are kept
   as a legacy import/export format. A migration function converts old format
   to the new event-based format.

---

## Stage 1: Core Data Model & Event System

### 1.1 — New Type Definitions

**File: `lib/engine/types.ts`** (NEW — replaces atom-types, molecule-types, lego-types)

Contains:
- `Project`, `ProjectMeta`, `ProjectSettings`
- `Scene`, `SceneMeta`, `SceneState`
- `TimelineStep`
- All event types as a discriminated union `EngineEvent`
- `Character`, `Sprite`, `Asset`, `Variable`
- `Condition` (for conditional logic)

**File: `lib/engine/event-types.ts`** (NEW)

Each event type as its own interface with full payload:
- `BackgroundEvent` — uri, transition, duration
- `CharacterSpawnEvent` — characterId, spriteId, position, transition, delay
- `CharacterModifyEvent` — characterId, spriteId/position/scale/opacity changes
- `DialogueEvent` — characterId, text, spriteId (emotion), speed
- `NarrationEvent` — text, speed
- `ChoiceEvent` — options: Array<{text, targetSceneId, condition}>
- `VariableEvent` — name, operation (set/add/multiply), value
- `MusicEvent` — assetId, action (play/stop/fade), volume, loop, fadeDuration
- `SoundEvent` — assetId, action, volume, loop
- `TransitionEvent` — type (fade/dissolve/wipe), duration, targetSceneId
- `CameraEvent` — action (zoom/pan/focus), target, duration
- `InteractiveObjectEvent` — objectId, action (show/hide/trigger)
- `EffectEvent` — type (shake/glitch/flash/blur/rain/snow), params

### 1.2 — Event Factory

**File: `lib/engine/event-factory.ts`** (NEW)

Factory functions for each event type with sensible defaults:
```ts
function createDialogueEvent(overrides?: Partial<DialogueEvent>): TimelineStep
function createBackgroundEvent(overrides?: Partial<BackgroundEvent>): TimelineStep
// ... one per event type
```

Each factory:
1. Generates a unique ID
2. Applies defaults
3. Merges overrides
4. Returns a `TimelineStep` (wraps event + index + conditions)

### 1.3 — Event Validation

**File: `lib/engine/event-validator.ts`** (NEW)

Zod schemas for each event type. Validates:
- Required fields present
- Values in valid ranges
- References (characterId, assetId) can be checked optionally

### 1.4 — Project Store

**File: `stores/use-project-store.ts`** (NEW — replaces use-lego-store)

Zustand store with:
- `project: Project | null`
- `activeSceneId: string | null`
- `activeStepIndex: number` (for timeline playback)
- CRUD for scenes, characters, assets, variables
- `addTimelineStep(sceneId, event)` — adds event to scene timeline
- `removeTimelineStep(sceneId, stepId)`
- `reorderTimelineSteps(sceneId, from, to)` — drag-and-drop reorder
- `updateTimelineStep(sceneId, stepId, updates)`
- `undo()` / `redo()` — action history stack
- `previewScene(sceneId)` — enters preview mode
- `saveProject()` / `loadProject(id)`

---

## Stage 2: Timeline System

### 2.1 — Timeline State

**File: `lib/engine/timeline.ts`** (NEW)

```ts
interface TimelineState {
  steps: TimelineStep[]
  currentIndex: number
  isPlaying: boolean
  isPaused: boolean
  playbackSpeed: number
}
```

### 2.2 — Event Dispatcher

**File: `lib/engine/event-dispatcher.ts`** (NEW)

Processes events sequentially:
- `dispatch(event)` — sends event to the appropriate runtime handler
- `stepForward()` — advance to next event
- `stepBackward()` — go back (rollback)
- `jumpTo(index)` — jump to specific step
- `reset()` — go back to start

Each event type maps to a handler function that mutates `SceneState`.

### 2.3 — State Restoration

**File: `lib/engine/state-restoration.ts`** (NEW)

Implements rollback by keeping a history of `SceneState` snapshots:
- `saveSnapshot()` — saves current state before executing an event
- `restoreSnapshot(index)` — restores state at given index
- `getSnapshot(index)` — returns state at index

For memory efficiency, stores deltas instead of full snapshots.

### 2.4 — Preview Controller

**File: `lib/engine/preview-controller.ts`** (NEW)

Controls scene preview:
- `start(sceneId)` — begins playback from step 0
- `pause()` / `resume()`
- `stop()` — exits preview
- `setSpeed(speed)` — playback speed multiplier
- Emits events for UI to react to state changes

---

## Stage 3: Scene Runtime Engine

### 3.1 — Render Pipeline

**File: `lib/engine/render-pipeline.ts`** (NEW)

Defines rendering order:
1. Background layer
2. Effects layer (particles, weather)
3. Characters layer (sorted by zIndex)
4. Objects layer (interactive objects)
5. UI layer (dialogue box, choices, menus)
6. Overlay layer (transitions, screen effects)

### 3.2 — Layer System

**File: `lib/engine/layer-system.ts`** (NEW)

Manages layers:
- Each layer is an ordered list of renderable items
- Layers have z-order: Background < Effects < Characters < Objects < UI < Overlay
- Items within a layer are sorted by zIndex

### 3.3 — Character State System

**File: `lib/engine/character-runtime.ts`** (NEW)

Runtime character state:
```ts
interface CharacterRuntimeState {
  characterId: string
  spriteId: string
  position: CharacterPosition
  scale: number
  opacity: number
  zIndex: number
  currentAnimation: AnimationState | null
  isVisible: boolean
}
```

Handles:
- Show/hide with transitions
- Sprite changes
- Position changes with animation
- Scale/opacity animations

### 3.4 — Dialogue Runtime

**File: `lib/engine/dialogue-runtime.ts`** (NEW)

Handles dialogue display:
- Typewriter effect (character-by-character)
- Skip (show all text immediately)
- Auto mode (auto-advance after delay)
- Rollback (show previous dialogue)
- History log (all dialogue shown so far)

### 3.5 — Music Runtime

**File: `lib/engine/music-runtime.ts`** (NEW)

Audio playback:
- Scene music (changes with scene)
- Persistent music (crosses scene boundaries)
- Fade in/out system
- Layered audio (music + ambient + SFX simultaneously)

### 3.6 — Save/Load System

**File: `lib/engine/save-load.ts`** (NEW)

Saves:
- Current scene ID
- Timeline index (which step we're on)
- All variables
- Active music state
- Active character states
- Active effects state

---

## Stage 4: Asset System

### 4.1 — Asset Database

**File: `lib/engine/asset-database.ts`** (NEW)

Centralized asset management:
```ts
interface AssetDatabase {
  backgrounds: Asset[]
  sprites: Asset[]
  cg: Asset[]
  music: Asset[]
  sfx: Asset[]
  voice: Asset[]
  ui: Asset[]
}
```

### 4.2 — Asset Metadata

**File: `lib/engine/asset-metadata.ts`** (NEW)

Each asset has:
- id, name, uri, category
- tags: string[]
- resolution: { width, height }
- size: number (bytes)
- usageCount: number
- thumbnailUri?: string

### 4.3 — Asset Import

**File: `lib/engine/asset-import.ts`** (NEW)

Import flow:
1. User picks file from device
2. File is copied to app storage
3. Metadata is extracted (dimensions, duration for audio)
4. Thumbnail is generated
5. Asset is added to database

### 4.4 — Asset Picker UI

**File: `components/editor/AssetPicker.tsx`** (NEW)

Modal/grid picker:
- Category tabs
- Search by name/tag
- Preview on tap
- "Import new" button
- Multi-select support

---

## Stage 5: Scene Composer UI (The Editor)

This is the main screen users interact with. It replaces the current
`scene-editor.tsx` + `LegoFlowWorkspace` + `LegoCanvas` + `LegoBlockLibrary`.

### 5.1 — Scene Composer Layout

**File: `components/editor/SceneComposer.tsx`** (NEW)

Layout:
```
┌─────────────────────────────────────────────────────┐
│ Header: Scene Name | Undo Redo | Preview | Save    │
├──────────┬────────────────────────┬─────────────────┤
│ Block    │ Timeline (vertical     │ Properties      │
│ Library  │ block chain)           │ Panel           │
│          │                        │                 │
│ [+Back]  │ ┌──────────────────┐   │ Selected block  │
│ [+Char]  │ │ Background Block │   │ properties      │
│ [+Text]  │ └──────────────────┘   │                 │
│ [+Dial]  │ ┌──────────────────┐   │                 │
│ [+Choice]│ │ Character Block  │   │                 │
│ [+Effect]│ └──────────────────┘   │                 │
│ [+Music] │ ┌──────────────────┐   │                 │
│ [+Obj]   │ │ Dialogue Block   │   │                 │
│          │ └──────────────────┘   │                 │
│          │ ┌──────────────────┐   │                 │
│          │ │ Choice Block     │   │                 │
│          │ └──────────────────┘   │                 │
│          │ [+ Add Block]          │                 │
├──────────┴────────────────────────┴─────────────────┤
│ Mini Preview: live render of current scene state     │
└─────────────────────────────────────────────────────┘
```

On mobile (phone), the Block Library becomes a bottom sheet modal,
and the Properties Panel slides in from the right when a block is selected.

### 5.2 — Block Components

Each block type gets its own component. All blocks share a common structure:

**File: `components/editor/blocks/BaseBlock.tsx`** (NEW)

Common block UI:
- Colored left border (unique color per block type)
- Header with icon, type label, drag handle
- Collapse/expand toggle
- Delete button
- Duplicate button
- Content area (specific to each block type)
- Semi-transparent background color

Block colors (OKLCH, matching design system):
- Background: `oklch(0.65 0.15 145)` — green
- Character: `oklch(0.75 0.15 80)` — orange
- Text/Narration: `oklch(0.65 0.2 280)` — purple
- Dialogue: `oklch(0.65 0.2 280)` — purple (same family)
- Choice: `oklch(0.65 0.2 350)` — pink
- Effect: `oklch(0.75 0.15 60)` — yellow
- Music: `oklch(0.65 0.2 10)` — red
- Interactive Object: `oklch(0.65 0.2 200)` — cyan
- Camera: `oklch(0.65 0.1 180)` — teal
- Variable: `oklch(0.65 0.1 120)` — lime

**File: `components/editor/blocks/BackgroundBlock.tsx`** (NEW)
- Asset picker for background image
- Transition selector (fade/dissolve/instant/wipe)
- Duration slider
- Mini preview thumbnail

**File: `components/editor/blocks/CharacterBlock.tsx`** (NEW)
- Character selector (pick from library or create new)
- If "create new": name input → sprite picker → sprite name input
- If existing: pick character → pick sprite (with labels)
- Position on screen (drag on mini-preview or preset buttons: left/center/right/far-left/far-right)
- Entrance transition selector
- Appearance delay (seconds)
- Disappearance timer (seconds)
- Effect sub-blocks (move, shake, hide, show, scale) — see 5.3

**File: `components/editor/blocks/TextBlock.tsx`** (NEW)
- Text input area
- Typewriter speed slider
- Anchor selector: to background (narration) or to character (dialogue)
- If anchored to character: character selector + sprite selector

**File: `components/editor/blocks/DialogueBlock.tsx`** (NEW)
- Repeated dialogue entries:
  - Character selector → sprite selector → text input
  - "Add next speaker" button (appears after text is entered)
  - Each entry shows character avatar + text preview
- Can have unlimited entries
- Last entry can be left without a character (narrator text)

**File: `components/editor/blocks/ChoiceBlock.tsx`** (NEW)
- 2 or 3 choice text fields
- Each field has: text input + target scene selector
- Target scene selector: dropdown of existing scenes + "create new"
- Optional condition per choice (variable check)
- Add/remove choice buttons (min 2, max 3)

**File: `components/editor/blocks/EffectBlock.tsx`** (NEW)
- Effect type selector with visual icons:
  - Move: drag start/end positions on mini-preview, speed slider
  - Shake: duration slider, intensity slider
  - Hide: direction selector (slide left/right/fade out)
  - Show: direction selector (slide from left/right/fade in)
  - Scale: target scale value, duration slider
- Target: character selector or "background"

**File: `components/editor/blocks/MusicBlock.tsx`** (NEW)
- Asset picker for music
- Action: play / stop / fade
- Volume slider
- Loop toggle
- Fade duration slider

**File: `components/editor/blocks/InteractiveObjectBlock.tsx`** (NEW)
- Object name input
- Sprite/asset picker
- Position on screen (drag on mini-preview)
- Size (width/height percentage)
- Actions on click:
  - Show text → attaches a TextBlock
  - End scene → transition to next scene
  - Show character → attaches a CharacterBlock
  - Start dialogue → attaches a DialogueBlock
  - Play sound → sound picker
  - Set variable → variable selector + value

**File: `components/editor/blocks/CameraBlock.tsx`** (NEW)
- Action: zoom / pan / focus
- Target (for focus: character selector)
- Duration slider
- Easing selector

**File: `components/editor/blocks/VariableBlock.tsx`** (NEW)
- Variable selector (or create new)
- Operation: set / add / subtract / multiply / toggle
- Value input (type depends on variable type)

### 5.3 — Nested/Child Blocks

Some blocks can have child blocks:
- CharacterBlock → EffectBlock (move, shake, etc.)
- InteractiveObjectBlock → TextBlock / CharacterBlock / DialogueBlock
- ChoiceBlock → VariableBlock (conditions)

Children are rendered indented inside the parent block with a connecting line.

### 5.4 — Drag and Drop

**File: `hooks/editor/useBlockDnD.ts`** (NEW)

- Vertical reordering of blocks within a scene
- Drag handle on each block header
- Visual drop indicator (line between blocks)
- Touch-friendly: long-press to start drag on mobile
- Keyboard: move up/down buttons for accessibility

### 5.5 — Undo/Redo

**File: `hooks/editor/useEditorHistory.ts`** (NEW)

- Action history stack (max 100 actions)
- Each action records: type, sceneId, before, after
- Ctrl+Z / Ctrl+Shift+Z (or buttons in header)
- History persists during session (not across app restarts)

### 5.6 — Auto-save

**File: `hooks/editor/useAutoSave.ts`** (NEW)

- Debounced save (2 seconds after last change)
- Saves to project store (which persists via Zustand persist)
- Crash recovery: on app start, check for unsaved changes in temp storage
- Backup snapshots: keep last 5 versions of each scene

### 5.7 — Mini Preview

**File: `components/editor/MiniPreview.tsx`** (NEW)

- Small live render of the scene
- Shows: background, characters at positions, current dialogue
- Updates in real-time as blocks are edited
- Tap to enter full preview mode
- For character blocks: drag character to reposition

### 5.8 — Full Preview

**File: `components/editor/ScenePreview.tsx`** (NEW)

- Full-screen scene playback
- Renders using the Scene Runtime Engine
- Controls: pause, skip, speed, back to step
- Tap to advance dialogue
- Shows choices when ChoiceEvent is reached
- Exit button to return to editor

---

## Stage 6: Story Flow System (Scene Graph)

### 6.1 — Scene Graph Data

**File: `lib/engine/scene-graph.ts`** (NEW)

```ts
interface SceneGraph {
  nodes: SceneNode[]
  connections: SceneConnection[]
}

interface SceneNode {
  sceneId: string
  x: number
  y: number
  width: number
  height: number
}

interface SceneConnection {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string       // choice text
  condition?: Condition
}
```

### 6.2 — Story Flow Editor

**File: `components/editor/StoryFlowEditor.tsx`** (NEW)

Node-graph editor:
- Draggable scene nodes on a 2D canvas
- Connections between nodes (lines with arrows)
- Choice connections: multiple outputs from one node
- Merge paths: multiple inputs to one node
- Auto-layout button
- Zoom in/out
- Mini preview thumbnail on each node

### 6.3 — Scene Card

**File: `components/editor/SceneCard.tsx`** (NEW)

Each node shows:
- Scene name
- Thumbnail preview (background image)
- Emotion indicator (based on music/mood)
- Variables used in scene
- Connection points (input at top, output at bottom)

### 6.4 — Flow Analysis

**File: `lib/engine/flow-analysis.ts`** (NEW)

Analyzes the scene graph for:
- Dead ends (scenes with no exit)
- Unreachable scenes (no path from start)
- Infinite loops (cycles without exit condition)
- Broken routes (choice pointing to deleted scene)

Shows warnings in the UI with suggestions to fix.

---

## Stage 7: Variables & Logic System

### 7.1 — Variable Types

```ts
type VariableType = 'string' | 'number' | 'boolean' | 'array'

interface Variable {
  id: string
  name: string
  type: VariableType
  value: string | number | boolean | string[]
  category: string    // for grouping in UI
}
```

### 7.2 — Condition Builder

**File: `components/editor/ConditionBuilder.tsx`** (NEW)

Visual condition builder:
- IF variable [name] [operator] [value]
- AND / OR combinators
- ELSE branch
- Nested conditions supported
- Operators: ==, !=, >, <, >=, <=, contains, isEmpty

### 7.3 — Debug Mode

**File: `components/editor/DebugPanel.tsx`** (NEW)

- Live variable viewer (table of all variables with current values)
- Condition debugger (shows which conditions pass/fail)
- Event debugger (log of events as they fire)
- Step-through mode (advance one event at a time)

---

## Stage 8: Audio System

### 8.1 — Music Engine

**File: `lib/engine/music-engine.ts`** (NEW)

- Looping with seamless loop points
- Crossfade between tracks
- Persistent music (continues across scenes)
- Layered music (base + intensity layer)

### 8.2 — SFX Engine

**File: `lib/engine/sfx-engine.ts`** (NEW)

- Positional audio (stereo pan based on screen position)
- Random pitch variation
- Audio queues (play multiple SFX in sequence)
- Priority system (important SFX can interrupt others)

### 8.3 — Voice System

**File: `lib/engine/voice-system.ts`** (NEW)

- Synced with dialogue (auto-advance timing)
- Subtitles (always shown with voice)
- Voice timing marks (for lip sync if needed later)

---

## Stage 9: Animation & Effects System

### 9.1 — Character Animation

**File: `lib/engine/character-animation.ts`** (NEW)

- Move (with easing curves)
- Fade (in/out)
- Shake (with intensity/duration)
- Scale (grow/shrink)
- Slide (from/to offscreen)
- All animations use Reanimated for 60fps

### 9.2 — Camera System

**File: `lib/engine/camera-system.ts`** (NEW)

- Zoom (with focal point)
- Pan (smooth movement)
- Focus (on character or position)
- Cinematic movement (combined zoom + pan)

### 9.3 — Screen Effects

**File: `lib/engine/screen-effects.ts`** (NEW)

- Glitch (RGB split + noise)
- Flash (white/color flash)
- Blur (gaussian blur overlay)
- Distortion (wave/chromatic aberration)
- Overlays (vignette, film grain, color grading)
- Weather (rain, snow, fog — particle systems)

---

## Stage 10: Optimization

### 10.1 — Lazy Loading

**File: `lib/engine/lazy-loading.ts`** (NEW)

- Images: load on demand, unload when not visible
- Music: stream from disk, don't load entire file
- Previews: generate thumbnails, not full resolution

### 10.2 — Virtualized Lists

- Block list uses virtual scrolling for scenes with 50+ blocks
- Asset picker uses virtualized grid

### 10.3 — Memory Cleanup

- Asset unloading when scene changes
- Cache cleanup (LRU cache for thumbnails)
- Snapshot pruning (keep only last 10 snapshots per scene)

---

## Stage 11: Export System

### 11.1 — Export Formats

- **Desktop**: Windows (exe), Linux (AppImage), Mac (dmg)
- **Mobile**: Android (apk/aab)
- **Web**: Browser-playable (HTML5)

### 11.2 — Export Pipeline

**File: `lib/engine/export.ts`** (NEW)

1. Validate project (check for errors, missing assets)
2. Bundle assets (copy all used assets)
3. Generate runtime (minimal reader app)
4. Package for target platform

---

## Migration Strategy

### From Old to New

1. **Keep existing types** (`Story`, `StoryScene`, etc.) as `LegacyStory`, `LegacyScene`
2. **Migration function**: `migrateLegacyProject(legacy: LegacyProject): Project`
   - Converts each `StoryScene` blocks to timeline events
   - Preserves all data (text, characters, choices, etc.)
3. **Import**: On app start, check for legacy format → auto-migrate
4. **Export**: Can still export to legacy format for backward compatibility

### File Cleanup

Remove (after migration is tested):
- `lib/atom-types.ts`
- `lib/molecule-types.ts`
- `lib/lego-types.ts`
- `stores/use-lego-store.ts`
- `components/lego-editor/` (all files)
- Old `app/scene-editor.tsx` (replaced by new SceneComposer)

Keep (still used):
- `lib/types.ts` (as legacy format)
- `lib/character-types.ts` (extended, not replaced)
- `lib/audio-types.ts` (extended, not replaced)
- `lib/interactive-types.ts` (extended, not replaced)
- `stores/use-app-store.ts` (extended with new features)

---

## Implementation Order

The stages are designed to be implemented sequentially, with each stage
providing the foundation for the next.

| Stage | Est. Time | Dependencies |
|-------|-----------|-------------|
| 1. Core Data Model & Event System | 3-4 days | None |
| 2. Timeline System | 2-3 days | Stage 1 |
| 3. Scene Runtime Engine | 4-5 days | Stage 1, 2 |
| 4. Asset System | 2-3 days | Stage 1 |
| 5. Scene Composer UI | 5-7 days | Stage 1, 2, 3 |
| 6. Story Flow System | 3-4 days | Stage 1, 5 |
| 7. Variables & Logic | 2-3 days | Stage 1, 5 |
| 8. Audio System | 2-3 days | Stage 3 |
| 9. Animation & Effects | 3-4 days | Stage 3 |
| 10. Optimization | 2-3 days | All above |
| 11. Export System | 3-4 days | All above |

**Total estimate: 31-42 working days**

### Parallel Work Opportunities

- Stage 4 (Asset System) can start alongside Stage 2
- Stage 6 (Story Flow) and Stage 7 (Variables) can be developed in parallel
- Stage 8 (Audio) and Stage 9 (Animation) can be developed in parallel
- Stage 10 (Optimization) is ongoing throughout

### Recommended Team Split (if multiple developers)

- **Developer A**: Stages 1, 2, 3 (core engine)
- **Developer B**: Stage 4, 8, 9 (assets, audio, effects)
- **Developer C**: Stage 5, 6, 7 (UI, story flow, variables)
- **Developer A+C**: Stage 10, 11 (optimization, export)

---

## File Structure (New)

```
lib/engine/
  types.ts              # Core types
  event-types.ts        # Event type definitions
  event-factory.ts      # Event creation helpers
  event-validator.ts    # Zod validation schemas
  timeline.ts           # Timeline state management
  event-dispatcher.ts   # Event processing
  state-restoration.ts  # Snapshot/rollback
  preview-controller.ts # Preview mode control
  render-pipeline.ts    # Rendering order
  layer-system.ts       # Layer management
  character-runtime.ts  # Character state
  dialogue-runtime.ts   # Dialogue display
  music-runtime.ts      # Audio playback
  save-load.ts          # Save/load
  asset-database.ts     # Asset management
  asset-metadata.ts     # Asset metadata
  asset-import.ts       # Import logic
  scene-graph.ts        # Story flow data
  flow-analysis.ts      # Graph analysis
  music-engine.ts       # Music system
  sfx-engine.ts         # SFX system
  voice-system.ts       # Voice system
  character-animation.ts # Character animations
  camera-system.ts      # Camera system
  screen-effects.ts     # Screen effects
  lazy-loading.ts       # Lazy loading
  export.ts             # Export pipeline
  migration.ts          # Legacy format migration

components/editor/
  SceneComposer.tsx     # Main editor screen
  MiniPreview.tsx       # Live mini preview
  ScenePreview.tsx      # Full preview mode
  AssetPicker.tsx       # Asset selection modal
  ConditionBuilder.tsx  # Visual condition builder
  DebugPanel.tsx        # Debug tools
  StoryFlowEditor.tsx   # Node graph editor
  SceneCard.tsx         # Scene node card
  blocks/
    BaseBlock.tsx       # Common block UI
    BackgroundBlock.tsx
    CharacterBlock.tsx
    TextBlock.tsx
    DialogueBlock.tsx
    ChoiceBlock.tsx
    EffectBlock.tsx
    MusicBlock.tsx
    InteractiveObjectBlock.tsx
    CameraBlock.tsx
    VariableBlock.tsx

hooks/editor/
  useBlockDnD.ts        # Drag and drop
  useEditorHistory.ts   # Undo/redo
  useAutoSave.ts        # Auto-save

stores/
  use-project-store.ts  # New project store (replaces use-lego-store)
```

---

## Risks & Mitigations

1. **Performance with many blocks**: Virtualized rendering + lazy evaluation
2. **Complex nested blocks**: Limit nesting depth to 3 levels
3. **Large asset library**: Thumbnail caching + pagination in picker
4. **Cross-platform audio**: Use expo-av with platform-specific configs
5. **Migration data loss**: Extensive testing with real projects before removing old code
6. **Reanimated compatibility**: Wrap in try/catch for web, test on all platforms
