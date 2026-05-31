# Audio System

Last updated: 2026-05-29

## Architecture

The audio system uses a **Facade pattern** with three focused services:

```
┌──────────────────────────────────────────┐
│  EnhancedAudioManager (Facade)           │
│  lib/audio-manager-enhanced.ts (187 LOC) │
├──────────────┬───────────────┬───────────┤
│ Player       │ Library       │ Trigger   │
│ Service      │ Service       │ Scheduler │
│ audio-player │ audio-library │ audio-    │
│ -service.ts  │ -service.ts   │ trigger-  │
│ (103 LOC)    │ (91 LOC)      │ scheduler │
│              │               │ .ts       │
└──────────────┴───────────────┴───────────┘
```

## Services

### AudioPlayerService
- **File:** `lib/audio-player-service.ts`
- **Purpose:** Low-level playback (play, stop, fade, crossfade).
- **Interface:** `IAudioPlayerService`
- **Key methods:**
  - `play(trackId, uri, opts?)` — Start playback with optional fadeIn
  - `stop(trackId, fadeOut?)` — Stop with optional fadeOut
  - `pause(trackId)` / `resume(trackId)` — Pause/resume
  - `crossFade(trackId, newUri, opts?)` — Crossfade to new track
  - `setVolume(trackId, volume)` — Change volume
  - `getActiveTrackIds()` — List active track IDs
  - `cleanup()` — Stop all and release resources

### AudioLibraryService
- **File:** `lib/audio-library-service.ts`
- **Purpose:** Catalog/management of audio library items.
- **Interface:** `IAudioLibraryService`
- **Key methods:**
  - `load(items)` — Bulk load library items
  - `get(audioId)` — Get item by ID
  - `getByType(type)` — Filter by type (music/sfx/voice/ambient)
  - `getAll()` — List all items
  - `clear()` — Remove all items

### AudioTriggerScheduler
- **File:** `lib/audio-trigger-scheduler.ts`
- **Purpose:** Trigger-based scheduling and orchestration.
- **Dependencies:** Injects `IAudioPlayerService` and `IAudioLibraryService`
- **Key methods:**
  - `executeTrigger(trigger)` — Execute a single trigger
  - `executeTriggersByType(triggers, type)` — Execute all triggers of a type
  - `cancelTrigger(triggerId)` — Cancel a specific trigger
  - `cancelAllTriggers()` — Cancel all pending triggers

### EnhancedAudioManager (Facade)
- **File:** `lib/audio-manager-enhanced.ts`
- **Purpose:** Backward-compatible API surface combining all services.
- **Interface:** `IAudioManager`
- **Singleton:** `export const enhancedAudioManager = new EnhancedAudioManager()`
- **Constructor injection:**
  ```typescript
  constructor(playerService?: IAudioPlayerService, libraryService?: IAudioLibraryService)
  ```
- **Reader guard:** All trigger execution checks `isReaderAudioSessionActive()` first.

## Types

### AudioLibraryItem
```typescript
interface AudioLibraryItem {
  id: string;
  name: string;
  uri: string;
  type: 'music' | 'sfx' | 'voice' | 'ambient';
  duration?: number;
  loop?: boolean;
  volume?: number;
  tags?: string[];
  createdAt: number;
}
```

### AudioTrigger
```typescript
interface AudioTrigger {
  id: string;
  audioId: string;           // Reference to AudioLibraryItem
  triggerType: AudioTriggerType;
  delay?: number;            // For 'delay' type (ms)
  volume?: number;           // Override library item volume
  loop?: boolean;            // Override library item loop
  fadeIn?: number;           // Fade in duration (ms)
  fadeOut?: number;          // Fade out duration (ms)
  stopPrevious?: boolean;    // Stop previous audio of same type
}
```

### AudioTriggerType
- `scene_start` — Play when scene starts
- `text_complete` — Play after text finishes typing
- `delay` — Play after X milliseconds
- `choice_shown` — Play when choices appear
- `manual` — Triggered manually by script

### AudioPlaybackState
```typescript
interface AudioPlaybackState {
  trackId: string;
  audioId: string;
  isPlaying: boolean;
  volume: number;
  loop: boolean;
  startTime: number;
  triggerId?: string;
}
```

## Audio Session Guard

`lib/reader-audio-session.ts` manages whether reader audio is active:

```typescript
export function isReaderAudioSessionActive(): boolean;
export function setReaderAudioSessionActive(active: boolean): void;
```

All `EnhancedAudioManager` trigger execution methods check this guard before playing. This prevents audio from playing when the user navigates away from the reader.

## Reader Audio Flow

1. `useReaderAudio` hook receives current scene and settings.
2. On scene change, resolves `audioTriggers` from scene data.
3. Executes `scene_start` triggers via `enhancedAudioManager.executeTriggersByType()`.
4. On text complete (via `useTypewriter` effect), executes `text_complete` triggers.
5. On cleanup (overlay open, navigation), calls `stopReaderPlayback()`.

## File Reference

| File | LOC | Purpose |
|---|---|---|
| `lib/audio-interfaces.ts` | 93 | TypeScript interfaces |
| `lib/audio-types.ts` | 88 | Type definitions |
| `lib/audio-manager-enhanced.ts` | 187 | Main facade (singleton) |
| `lib/audio-player-service.ts` | ~100 | Playback service |
| `lib/audio-library-service.ts` | ~91 | Library management |
| `lib/audio-trigger-scheduler.ts` | ~80 | Trigger orchestration |
| `lib/reader-audio-session.ts` | ~20 | Session guard |
| `lib/audio-web-source.ts` | ~25 | Web audio source helper |
| `lib/audio-library.ts` | ~20 | Legacy audio library |
