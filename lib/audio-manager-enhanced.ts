/**
 * Enhanced Audio Manager (Facade)
 *
 * Refactored from a God class into three focused services:
 *   - AudioPlayerService    – low-level playback (play, stop, fade, crossfade)
 *   - AudioLibraryService   – catalog/management of audio library items
 *   - AudioTriggerScheduler – trigger-based scheduling and orchestration
 *
 * Dependencies are injected via constructor. Default singleton exported for convenience.
 */

import type {
  AudioLibraryItem,
  AudioTrigger,
  AudioTriggerType,
  AudioPlaybackState,
} from './audio-types';
import type { IAudioPlayerService, IAudioLibraryService, IAudioManager } from './audio-interfaces';
import { AudioPlayerService } from './audio-player-service';
import { AudioLibraryService } from './audio-library-service';
import { AudioTriggerScheduler } from './audio-trigger-scheduler';
import { isReaderAudioSessionActive } from './reader-audio-session';

// ── Facade class (backward-compatible API surface) ─────────────────────────

class EnhancedAudioManager implements IAudioManager {
  private playerService: IAudioPlayerService;
  private libraryService: IAudioLibraryService;
  private triggerScheduler: AudioTriggerScheduler;

  constructor(
    playerService?: IAudioPlayerService,
    libraryService?: IAudioLibraryService,
  ) {
    this.playerService = playerService ?? new AudioPlayerService();
    this.libraryService = libraryService ?? new AudioLibraryService();
    this.triggerScheduler = new AudioTriggerScheduler(this.playerService, this.libraryService);
  }
  // ── Initialization ──────────────────────────────────────────────────────

  // ── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.playerService.initialize();
  }

  // ── Library Management (delegates to AudioLibraryService) ───────────────

  loadLibrary(items: AudioLibraryItem[]): void {
    this.libraryService.load(items);
  }

  getLibraryItem(audioId: string): AudioLibraryItem | undefined {
    return this.libraryService.get(audioId);
  }

  // ── Trigger System (delegates to AudioTriggerScheduler) ────────────────

  async executeTrigger(trigger: AudioTrigger): Promise<void> {
    if (!isReaderAudioSessionActive()) return;
    await this.triggerScheduler.executeTrigger(trigger);
  }

  async executeTriggersByType(
    triggers: AudioTrigger[],
    triggerType: AudioTriggerType,
  ): Promise<void> {
    if (!isReaderAudioSessionActive()) return;
    await this.triggerScheduler.executeTriggersByType(triggers, triggerType);
  }

  cancelTrigger(triggerId: string): void {
    this.triggerScheduler.cancelTrigger(triggerId);
  }

  cancelAllTriggers(): void {
    this.triggerScheduler.cancelAllTriggers();
  }

  async processTriggers(triggers: AudioTrigger[]): Promise<void> {
    if (!isReaderAudioSessionActive()) return;
    await this.triggerScheduler.processTriggers(triggers);
  }

  // ── Playback Control (delegates to AudioPlayerService) ──────────────────

  async play(
    trackId: string,
    uri: string,
    opts: {
      volume?: number;
      loop?: boolean;
      fadeIn?: number;
      audioId?: string;
      triggerId?: string;
    } = {},
  ): Promise<void> {
    if (!isReaderAudioSessionActive()) return;
    await this.playerService.play(trackId, uri, {
      volume: opts.volume,
      loop: opts.loop,
      fadeIn: opts.fadeIn,
      metadata: { audioId: opts.audioId, triggerId: opts.triggerId },
    });
  }

  async pause(trackId: string): Promise<void> {
    await this.playerService.pause(trackId);
  }

  async resume(trackId: string): Promise<void> {
    await this.playerService.resume(trackId);
  }

  async stop(trackId: string, fadeOut?: number): Promise<void> {
    await this.playerService.stop(trackId, fadeOut);
  }

  async stopAll(fadeOut?: number): Promise<void> {
    await this.playerService.stopAll(fadeOut);
  }

  async stopByType(type: AudioLibraryItem['type'], fadeOut?: number): Promise<void> {
    await this.triggerScheduler.stopByType(type, fadeOut);
  }

  async setVolume(trackId: string, volume: number): Promise<void> {
    await this.playerService.setVolume(trackId, volume);
  }

  async crossFade(
    trackId: string,
    newUri: string,
    opts: {
      volume?: number;
      loop?: boolean;
      fadeInMs?: number;
      fadeOutMs?: number;
    } = {},
  ): Promise<void> {
    if (!isReaderAudioSessionActive()) return;
    await this.playerService.crossFade(trackId, newUri, opts);
  }

  isPlaying(trackId: string): boolean {
    return this.playerService.isPlaying(trackId);
  }

  // ── State Query ────────────────────────────────────────────────────────

  getActiveTracksByType(type: AudioLibraryItem['type']): string[] {
    const matching: string[] = [];
    for (const track of this.playerService.getAllActiveTracks()) {
      const metaAudioId = track.metadata?.audioId;
      if (metaAudioId) {
        const item = this.libraryService.get(metaAudioId);
        if (item && item.type === type && track.isPlaying) {
          matching.push(track.trackId);
        }
      }
    }
    return matching;
  }

  getPlaybackState(): AudioPlaybackState[] {
    return this.triggerScheduler.getPlaybackStates();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    this.triggerScheduler.cleanup();
    await this.playerService.cleanup();
    this.libraryService.clear();
  }
}

// ── Factory function ───────────────────────────────────────────────────────

export function createEnhancedAudioManager(
  playerService?: IAudioPlayerService,
  libraryService?: IAudioLibraryService,
): EnhancedAudioManager {
  return new EnhancedAudioManager(playerService, libraryService);
}

// ── Singleton export ───────────────────────────────────────────────────────

export const enhancedAudioManager = createEnhancedAudioManager();

/**
 * Initialize the singleton audio manager. Idempotent and safe to call multiple
 * times — the underlying `AudioPlayerService.initialize()` is guarded by a
 * module-level `initPromise` so the actual audio-mode setup runs at most once
 * per session. Returns the shared initialization promise.
 */
export async function ensureAudioManagerInitialized(): Promise<void> {
  await enhancedAudioManager.initialize();
}
