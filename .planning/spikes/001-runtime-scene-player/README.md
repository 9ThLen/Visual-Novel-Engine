---
spike: 001
name: runtime-scene-player
type: standard
validates: "Given a canonical scene with TimelineStep[] blocks, when the reader executes them sequentially, then each block type produces visible output and SceneState tracks mutations correctly"
verdict: VALIDATED
related: []
tags: [runtime, reader, blocks, execution, scene-state]
---

# Spike 001: Runtime Scene Player

## What This Validates

That a block-by-block executor can process all 12 block types from `TimelineStep[]` and produce correct visual/audio/state output. The key question: **can the reader actually play what the editor builds?**

## Research

### Current Architecture (Broken)

The current `StoryReaderResponsive` consumes legacy `StoryScene` — not `TimelineStep[]`. The adapter `sceneRecordToStoryScene` does a **lossy extraction** that preserves only ~4 of 12 block types:

| Block Type | Current Status | Notes |
|---|---|---|
| background | Partial (1 step) | Only first background extracted; transition/duration lost |
| text | Partial (1 step) | Only first text block; typewriterSpeed/anchorTo lost |
| dialogue | Partial (1 entry) | Only first entry of first dialogue block |
| character | **FULLY LOST** | characterId, spriteId, position, transition, effects — all dropped |
| choice | **NOT from timeline** | Choices come from SceneRecord.connections instead of ChoiceBlockData |
| effect | **FULLY LOST** | shake, flash, blur, rain, snow, glitch, vignette — all dropped |
| music | Partial (1 step) | Only last play action; volume/loop/fadeDuration dropped |
| sound | Partial | Only play actions → AudioTrigger |
| camera | **FULLY LOST** | zoom/pan/focus/reset dropped |
| variable | **FULLY LOST** | All variable mutations dropped, conditions ignored |
| transition | **FULLY LOST** | Scene transitions and targetSceneId dropped |
| interactive_object | **FULLY LOST** | Not populated from timeline |
| conditions | **FULLY LOST** | Per-step conditional execution dropped |
| enabled: false | Partial | Not consistently respected |

### Approach

Build a `BlockExecutor` component that:
1. Takes `TimelineStep[]` as input
2. Maintains `SceneState` (background, characters, variables, effects, music, choices)
3. Walks steps sequentially
4. **Yielding blocks** (text/dialogue/choice/transition) halt and wait for user input
5. **Non-yielding blocks** execute immediately and advance
6. Respects `enabled: false` and `conditions[]`

## How to Run

Open `index.html` in a browser. A sample scene with 17 blocks executes sequentially.

## What to Expect

- Blocks execute in order, with visual output for each type
- Background changes, characters appear, text typesets, dialogue shows speaker names
- Effects (flash, shake, vignette) animate
- Variables track state (visible in the 📊 panel)
- Choice halts execution; selecting an option logs the choice and triggers transition
- Disabled blocks are shown as skipped
- Condition-gated blocks only execute when their condition is met

## Investigation Trail

1. **Initial discovery:** The `sceneRecordToStoryScene` adapter strips everything except flat text/background/music. The reader has zero awareness of `TimelineStep[]`.
2. **Built executor concept:** Proved that a simple state-machine loop can handle all 12 block types.
3. **Key findings:**
   - **Yielding vs non-yielding distinction is critical.** text/dialogue/choice/transition must halt and await user input. Everything else runs automatically.
   - **SceneState should be the source of truth for rendering**, not a `StoryScene` struct. The background/characters/effects that the user sees are an accumulated function of all executed steps.
   - **Choice resolution needs careful design.** When a choice is selected, the executor must: (a) record the choice in variables, (b) clear current choices from state, (c) trigger a scene transition with the target scene's timeline.
   - **Variable operations need type-preservation.** The `isNaN(Number(v))` pattern from the editor is also needed in the runtime.
   - **Disabled steps are meaningful.** They represent editorial intent to "keep but not use" — the runtime must skip them silently but the skip should be trackable for debugging.
   - **Conditions require variable evaluation context.** The executor needs access to the accumulated `SceneState.variables` to evaluate `conditions[]`.
4. **Edge cases explored:**
   - Multiple yielding blocks in sequence (text → dialogue → choice)
   - Disabled block in middle of timeline
   - Character with effect (shake) — combines position with visual effect
   - Camera zoom after character placement
   - Variable mutation then condition check on a later block
   - Fade transition overlay between scenes

## Results

**Verdict: VALIDATED** ✓

A block-by-block runtime executor is feasible. The state machine approach works cleanly for all 12 block types. The executor can be built as a standalone hook (`useSceneExecutor`) that replaces `sceneRecordToStoryScene`.

### Key Discoveries

1. **The current reader loses 8/12 block types.** This is the single biggest gap in the architecture. `sceneRecordToStoryScene` must be replaced with a proper executor.
2. **The yielding/non-yielding split is clean.** Only 4 block types (text, dialogue, choice, transition) need user interaction. The other 8 run automatically.
3. **SceneState is already the right shape.** The `SceneState` interface in `types.ts` needs minor additions (variables dict, character runtime states) but the concept is sound.
4. **Conditions are straightforward to implement.** A simple `conditionsMet(step, variables)` function with the 6 operators (==, !=, >, <, >=, <=, contains, isEmpty) is sufficient.
5. **Choice routing maps cleanly to scene transitions.** A choice with a `targetSceneId` is effectively a transition. The executor should treat them identically.
6. **The typewriter effect works naturally with yielding.** Text/dialogue blocks start typewriting, and tapping either completes the typewriter or advances (if already complete).

### What to Avoid

- **Don't try to shoehorn TimelineStep[] into the legacy StoryScene.** The current adapter approach is fundamentally lossy. Build an executor, not a bigger adapter.
- **Don't make the executor a black box.** The hook should expose `sceneState`, `canAdvance`, `isTyping`, `currentStep` so the UI layer can render whatever it wants.
- **Don't ignore disabled steps.** They contain editorial intent that may be toggled back on.

### State Mutation Map

| Block Type | SceneState Changes | Yields? |
|---|---|---|
| background | backgroundAssetId, backgroundTransition | No |
| character | characters[charId] = {spriteId, position, visible, ...} | No |
| text | (triggers dialogue display) | **Yes** |
| dialogue | dialogueHistory push, (triggers display) | **Yes** |
| choice | currentChoices = options | **Yes** |
| effect | activeEffects push (auto-expire) | No |
| music | musicTrackId, musicPlaying, musicVolume | No |
| sound | (ephemeral) | No |
| camera | (transform state — no SceneState change) | No |
| variable | variables[varName] = evaluated | No |
| transition | isTransitioning, transitionTarget | **Yes** |
| interactive_object | (overlay — no SceneState change) | No |
