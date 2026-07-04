# Block Types Reference

Last updated: 2026-05-29

## Overview

The engine defines **12 block types** organized into **5 categories**. Each block type creates a `TimelineStep` with a specific `BlockData` payload.

Source: `lib/engine/types.ts` (lines 16-111)
Factories: `lib/engine/event-factory.ts`

## Categories

| Category | Icon | Block Types |
|---|---|---|
| Scene | 🎬 | background, character, interactive_object |
| Dialogue | 💬 | text, dialogue, choice |
| Media | 🎵 | music, sound |
| Effects | ✨ | effect, camera, transition |
| Logic | ⚙️ | variable |

## Block Types

### Background
- **Category:** Scene
- **Color:** `#50c878`
- **Purpose:** Change scene background image.
- **Fields:** `assetId`, `transition` (fade/dissolve/instant/wipe), `duration` (ms)
- **Auto-executes:** Yes
- **Validation:** Requires `assetId`

### Character
- **Category:** Scene
- **Color:** `#f5a623`
- **Purpose:** Show/hide character sprite at a position.
- **Fields:** `characterId`, `spriteId`, `position` (far-left/left/center/right/far-right), `transition` (instant/fade/slide-left/slide-right/zoom), `delay`, `duration`, `effect`
- **Auto-executes:** Yes
- **Validation:** Requires `characterId`
- **Runtime:** Updates `sceneState.characters[]`

### Text / Narration
- **Category:** Dialogue
- **Color:** `#7c5bf5`
- **Purpose:** Display narration text with typewriter effect.
- **Fields:** `content`, `typewriterSpeed` (0-1), `anchorTo` (background/character), `characterId?`, `spriteId?`
- **Auto-executes:** No — **yields** for typewriter
- **Validation:** Requires `content`

### Dialogue
- **Category:** Dialogue
- **Color:** `#9b59b6`
- **Purpose:** Runtime representation of character dialogue authored in the Plate text editor through Character lines/speaker tokens.
- **Fields:** `entries[]` (each: `id`, `characterId`, `spriteId`, `text`), `currentEntryIndex`
- **Auto-executes:** No — **yields** for typewriter
- **Validation:** Requires at least one entry with text
- **Runtime:** Appends to `sceneState.dialogueHistory[]`
- **Authoring:** Deprecated as a standalone addable block. New Plate authoring should create one dialogue paragraph per character line, saved as a single-entry runtime `dialogue` step.

### Choice
- **Category:** Dialogue
- **Color:** `#e91e63`
- **Purpose:** Player choice branching.
- **Fields:** `options[]` (each: `id`, `text`, `targetSceneId`, `condition?`)
- **Auto-executes:** No — **yields** for player input
- **Validation:** Requires at least one option with text
- **Runtime:** Sets `sceneState.currentChoices`, `selectChoice()` advances

### Effect
- **Category:** Effects
- **Color:** `#ffd93d`
- **Purpose:** Visual screen effects with optional ambience audio.
- **Fields:** `effectType` (shake/flash/blur/rain/snow/fog/glitch/vignette), `target` (screen/character/background), `intensity` (0-100), `duration` (seconds), `fadeIn`/`fadeOut` (seconds)
- **Rain options** (`rain`): `variant` (drizzle/rain/storm/fallout), `opacity`, `lightning`, `sound` (bundled rain loop + thunder, on by default; `false` disables), `soundVolume`; advanced: `density`, `speed`, `dropWidth`. Legacy fields (`color`, `wind`, `angle`, `dropLength`, `splash`) are preserved on save but no longer editable in the popover.
- **Lightning/thunder:** flashes are driven by the shared scheduler in `lib/engine/lightning-scheduler.ts`; thunder claps follow each strike when `sound` is enabled.
- **Auto-executes:** Yes
- **Runtime:** Appends to `sceneState.activeEffects[]`; rain ambience is played by `useEffectAmbience`

### Music
- **Category:** Media
- **Color:** `#ff6b6b`
- **Purpose:** Play/stop background music.
- **Fields:** `assetId`, `action` (play/stop/pause/fade), `volume` (0-1), `loop`, `fadeDuration` (ms)
- **Auto-executes:** Yes
- **Validation:** Requires `assetId` unless action is `stop`
- **Runtime:** Updates `sceneState.musicTrackId`, `musicPlaying`, `musicVolume`

### Sound
- **Category:** Media
- **Color:** `#ef5350`
- **Purpose:** Play sound effects.
- **Fields:** `assetId`, `action` (play/stop), `volume` (0-1), `loop`, `pitchVariation` (0-1)
- **Auto-executes:** Yes
- **Validation:** Requires `assetId` unless action is `stop`
- **Runtime:** ⚠️ No-op in executor (deferred to future phase)

### Interactive Object
- **Category:** Scene
- **Color:** `#00bcd4`
- **Purpose:** Clickable scene object.
- **Fields:** `objectId`, `name`, `assetId`, `position` (x/y/width/height), `actions[]`, `oneTimeOnly`, `pulseAnimation`
- **Auto-executes:** Yes
- **Validation:** Requires `name`
- **Runtime:** ⚠️ No-op in executor (deferred to future phase)

### Camera
- **Category:** Effects
- **Color:** `#009688`
- **Purpose:** Camera zoom/pan/focus.
- **Fields:** `action` (zoom/pan/focus/reset), `target?`, `zoomLevel` (0.5-3.0), `panX?`, `panY?`, `duration` (seconds), `easing`
- **Auto-executes:** Yes
- **Validation:** None
- **Runtime:** ⚠️ No-op in executor (deferred to future phase)

### Variable
- **Category:** Logic
- **Color:** `#8bc34a`
- **Purpose:** Set/modify a story variable.
- **Fields:** `variableName`, `operation` (set/add/subtract/multiply/toggle`), `value`
- **Auto-executes:** Yes
- **Validation:** Requires `variableName`
- **Runtime:** Updates `sceneState.variables{}`

### Transition
- **Category:** Effects
- **Color:** `#3f51b5`
- **Purpose:** Scene transition effect.
- **Fields:** `targetSceneId` (null = end story), `transitionType` (fade/dissolve/slide-left/slide-right/slide-up/wipe), `duration` (seconds)
- **Auto-executes:** No — **yields** for player confirmation
- **Validation:** None
- **Runtime:** Sets `sceneState.isTransitioning`, `transitionTarget`

## Yielding Behavior

The executor automatically runs non-yielding blocks and pauses on yielding blocks:

| Block Type | Yields? | Player Action |
|---|---|---|
| text | ✅ Yes | Tap to speed up, tap to continue |
| dialogue | ✅ Yes | Tap to speed up, tap to continue |
| choice | ✅ Yes | Tap option to select |
| transition | ✅ Yes | Tap to confirm |
| All others | ❌ No | Auto-executed |

## Condition System

All block types support optional `conditions[]`. A block with conditions is skipped if conditions are not met.

Source: `lib/engine/conditionUtils.ts`

**Operators:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `isEmpty`

**Logic:** AND — all conditions must be true.

## Scene State Shape

The executor maintains a `SceneState` object:

```typescript
interface SceneState {
  backgroundAssetId: string | null;
  backgroundTransition: string;
  characters: CharacterRuntimeState[];
  activeEffects: ActiveEffect[];
  musicTrackId: string | null;
  musicPlaying: boolean;
  musicVolume: number;
  variables: Record<string, string | number | boolean>;
  dialogueHistory: DialogueHistoryEntry[];
  currentChoices: ChoiceOption[] | null;
  isTransitioning: boolean;
  transitionTarget: string | null;
}
```
