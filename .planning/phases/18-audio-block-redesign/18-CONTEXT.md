# Phase 18 - Audio Block Redesign Context

**Gathered:** 2026-07-04
**Status:** Ready for planning
**Source:** User design request + external model review corrections (both incorporated below)

<domain>
## Phase Boundary

Redesign the Music/Sound timeline block contract so scene authors never pick an
abstract "action" (play/stop/pause/fade). Creating a music or sound block in a
scene already means "there should be sound here" — the UI and data model
should express *how* it plays (fade in/out, bound to this scene vs continuous
across scenes, auto-fade after N seconds, play to completion), not a generic
action verb.

This phase also fixes two pre-existing defects surfaced while validating the
original proposal against the codebase: `AudioPlayerService.crossFade()`
silently ignores its `duration` option (no real fade happens today despite the
name), and legacy scene migration for this block type must happen at the
canonical scene-load boundary, not only inside the Plate editor bridge.
</domain>
</domain>

<decisions>
## Implementation Decisions

### D-01 No Action Field, Explicit Mode
`MusicBlockData`/`SoundBlockData` drop `action` entirely. Replace with
`mode: 'track' | 'silence'`. `mode: 'silence'` is the *only* way a block means
"stop/silence" — an empty `assetId` alone must never be interpreted as stop.
This was a mistake in the first draft of this plan (empty `assetId` implying
stop) that would have made a freshly-inserted, not-yet-configured music block
silently act as a stop instruction. `createMusicStep()`/`createSoundStep()`
must default to `mode: 'track'`.

### D-02 Seconds At The Data Layer, Milliseconds Only At The Runtime Boundary
`fadeIn`, `fadeOut`, and `autoFadeAfter` are always **seconds** on
`MusicBlockData`/`SoundBlockData` and in `DocumentInlinePart`, matching the
existing `EffectBlockData.fadeIn/fadeOut` convention
(`lib/engine/types.ts:206-207`). Conversion to milliseconds happens only at
the two runtime call sites (`hooks/useReaderAudio.ts`,
`components/editor/PreviewScreen.tsx`) immediately before calling
`audioManager`/`audioService`. Do not reintroduce a millisecond field at the
block-data level (the old `fadeDuration` was ms and required an inline
`Math.round(x/100)/10` conversion in the editor popup — do not repeat that
pattern).

### D-03 Scene Binding Replaces Implicit Persistence
Add `boundTo: 'scene' | 'continuous'` to `MusicBlockData` (optional on
`SoundBlockData`, meaningful only when `loop: true`, e.g. ambient rain/thunder
sfx channels).
- `'continuous'` = today's *implicit* behavior: `useReaderAudio.ts` already
  never stops the `bgm` track on scene transition unless a new block says so
  (see `applySceneAudio`, the loop that explicitly skips `track.trackId ===
  'bgm'`). This phase makes that explicit and visible in the editor instead of
  it being an accidental side effect of "just don't add another music block".
- `'scene'` = new behavior: auto-stop with `fadeOut` when the reader leaves
  this scene, unless the next scene's own timeline sets a new track for the
  same channel (in which case that transition's fade wins instead).

### D-04 Play-To-Completion Is Not A Separate Enum
"Program to the end" is expressed as `loop: false` with no `autoFadeAfter` and
`boundTo: 'continuous'` — the track plays through once and stops naturally.
No dedicated `playMode` enum value is needed for this case.

### D-05 SFX Stop Needs An Explicit Target
For `SoundBlockData` with `mode: 'silence'`, `assetId` names the specific
looping sfx channel to stop. This maps directly onto the existing runtime key
`sfx:${assetId}` used for looped sound events in `useReaderAudio.ts` (see the
`soundChannelId = event.loop ? \`sfx:${event.assetId}\` : \`sfx:${event.id}\``
branch). One-shot (non-looping) sfx have no meaningful stop target — the
editor UI must not offer `mode: 'silence'` when authoring a one-shot sfx
block; it only applies to looping ambient sfx.

### D-06 Real Crossfade Is In Scope
`AudioPlayerService.crossFade()` (`lib/audio-player-service.ts:191-212`)
currently destructures `{ volume, loop }` from its options and ignores
`duration` completely — it hard-stops the old track and immediately plays the
new one with no fade at all, despite the name. This phase fixes that:
`crossFade` must fade the outgoing track out over an explicit fade-out
duration and fade the incoming track in over an explicit fade-in duration.
Minimal v1 is **sequential** (old track finishes fading out, then the new one
starts fading in) — true overlapping dual-track crossfade where both play
simultaneously is a larger change and is deferred (see `<deferred>`).
`IAudioPlayerService.crossFade` and `IAudioManager.crossFade`
(`lib/audio-interfaces.ts`) must be updated to accept explicit
`fadeInMs`/`fadeOutMs` instead of the unused `duration`.

### D-07 Canonical Migration, Not Just The Plate Bridge
Legacy `action`/`fadeDuration`/`pitchVariation`-shaped blocks must be
normalized to the new shape at every canonical load boundary, not only inside
`lib/vn-plate-editor/scene-normalizer.ts` (which is Plate/editor-bridge-only
and does not run for reader/preview playback). The canonical boundaries are:
- `lib/app-store-persistence.ts` (`migratePersistedAppState` /
  `mergePersistedAppState`, following the existing `migrateCharacterLibraries`
  pattern from `lib/character-migration.ts`; bump
  `APP_STORE_PERSIST_VERSION`).
- `lib/bundled-story-sync.ts` (stories shipped with the app).
- `lib/story-hooks.ts` import validation (user-imported story files).

Add one shared pure module, `lib/audio-block-migration.ts`, and call it from
all three boundaries plus `scene-normalizer.ts`, so the mapping logic exists
in exactly one place.

### D-08 Legacy Action Mapping
- `action: 'play'` → `mode: 'track', boundTo: 'continuous'`, `fadeIn` from old
  `fadeDuration` (ms → s), `fadeOut` defaulted (e.g. 0.8s, matching today's
  default crossfade duration).
- `action: 'stop'` or `'fade'` → `mode: 'silence'`, `fadeOut` from old
  `fadeDuration` (ms → s).
- `action: 'pause'` → `mode: 'silence'` (see D-09; true pause semantics are
  not preserved).

### D-09 Drop Pause From The Schema, Keep It In The Low-Level API
No `pause` concept exists in the new `MusicBlockData`/`SoundBlockData` shape
or in the editor UI. `IAudioManager.pause()`/`resume()` remain in the
low-level API surface for potential future use but are not reachable from any
music/sound timeline block after this phase. `components/editor/PreviewScreen.tsx:81`
currently branches on `sceneState.musicAction === 'pause'` — this branch is
removed as part of the runtime update, not preserved behind a flag.

### D-10 Two Runtime Consumers Must Stay In Sync
Both `hooks/useReaderAudio.ts` (reader) and
`components/editor/PreviewScreen.tsx` (editor preview) independently read
scene-state music fields and independently drive playback. Both must be
updated together in the same wave so they cannot diverge again the way the
original plan draft almost missed `PreviewScreen.tsx` entirely.

### D-11 Trigger System Is Out Of Scope
`lib/audio-types.ts` `AudioTrigger.fadeIn`/`fadeOut` (already milliseconds)
belongs to the separate `audioTriggers`/`AudioScene` trigger-scheduler system
(`lib/audio-trigger-scheduler.ts`) and is not part of this phase. Do not
rename or reinterpret those fields while working on `MusicBlockData`/
`SoundBlockData`.
</decisions>

<canonical_refs>
## Canonical References

### Data Contract
- `lib/engine/types.ts:213-227` - `MusicBlockData`, `SoundBlockData` (block being redesigned)
- `lib/engine/types.ts:196-211` - `EffectBlockData` (existing `durationMode`/`fadeIn`/`fadeOut` precedent to mirror)
- `lib/engine/event-factory.ts:126-146` - `createMusicStep`/`createSoundStep` defaults
- `lib/document-editor/types.ts:31-68` - `DocumentInlinePart` music/sound variants

### Audio Service Layer
- `lib/audio-interfaces.ts` - `IAudioPlayerService`, `IAudioManager` contracts
- `lib/audio-player-service.ts:56-121,137-212` - `play`/`stop`/`crossFade` implementation (crossFade fade bug lives here)
- `lib/audio-manager-enhanced.ts` - passthrough manager wrapping the player service

### Canonical Migration
- `lib/character-migration.ts` - existing precedent pattern for a persisted-data migration module
- `lib/app-store-persistence.ts:105-167` - `migratePersistedAppState`/`mergePersistedAppState`, `APP_STORE_PERSIST_VERSION`
- `lib/bundled-story-sync.ts` - bundled-story canonical load path
- `lib/story-hooks.ts:99-129` - import validation (`isSafeAssetReference`/`isString`/etc. checks for music/sound block data)
- `lib/vn-plate-editor/scene-normalizer.ts` - Plate/editor-bridge layer (NOT the canonical migration site)

### Runtime
- `lib/engine/useSceneExecutor.ts:248-284` - music/sound step execution into `SceneState`
- `lib/engine/runtime-types.ts:44-49` - `SceneState` music fields
- `hooks/useReaderAudio.ts:84-330` - reader playback (`resolveRuntimeMusic`, `applySceneAudio`, sfx event handling)
- `components/editor/PreviewScreen.tsx:75-95` - second, independent runtime consumer

### Editor UI And Serialization
- `lib/vn-plate-editor/embedded-script.ts:889-1006` - audio popover UI (action select, form collection, chip data)
- `lib/vn-plate-editor/embedded-renderers.ts:99-142` - chip label/details rendering
- `lib/document-editor/document-scene.ts:202-232,601-630` - `DocumentInlinePart` <-> `TimelineStep` conversion
- `lib/scene-document/sceneParser.ts`, `sceneSerializer.ts`, `sceneRecordAdapter.ts` - text-DSL scene notation (`[play music ...]`) with independent `action`/`fadeDuration` references
- `lib/scene-document/sceneValidation.ts:22` - "empty track while action=play" validation, needs `mode`-based rewrite

### Tests To Update
- `__tests__/unit/lib/audio-scene.test.ts`, `useSceneExecutor.test.ts`(`2`), `reader-scene.test.ts`
- `__tests__/unit/editor/plate-scene-roundtrip.test.ts`, `__tests__/unit/lib/document-editor.test.ts`
- `__tests__/unit/lib/editor-scene-save.test.ts`, `editor-scene-draft.test.ts`
- `__tests__/unit/lib/audio-player-service.test.ts`, `audio-manager-enhanced.test.ts`
- `__tests__/unit/reader-audio-session.test.ts`, `use-reader-audio.test.ts`
- `__tests__/unit/lib/app-store-persistence.test.ts`, `bundled-story-sync.test.ts`
</canonical_refs>

<deferred>
## Deferred Ideas

- True overlapping dual-track crossfade (both old and new track playing
  simultaneously during the fade window). V1 is sequential fade-out then
  fade-in.
- Bulk "stop all ambient sfx" action distinct from stopping one named channel.
- `.planning/STATE.md` phase/plan counters are not updated by this context or
  its plans — update them separately through the normal GSD progress flow
  when this phase is actually scheduled.
</deferred>
