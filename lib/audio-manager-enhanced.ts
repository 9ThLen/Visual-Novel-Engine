/**
 * Enhanced Audio Manager (Facade)
 *
 * Refactored from a God class into three focused services:
 *   - AudioPlayerService    – low-level playback (play, stop, fade, crossfade)
 *   - AudioLibraryService   – catalog/management of audio library items
 *   - AudioTriggerScheduler – trigger-based scheduling and orchestration
 *
 * This module re-exports the same singleton interface for backward compatibility.
 */

import type {
  AudioLibraryItem,
  AudioTrigger,
  AudioTriggerType,
  AudioPlaybackState,
} from './audio-types';
import { AudioPlayerService } from './audio-player-service';
import { AudioLibraryService } from './audio-library-service';
import { AudioTriggerScheduler } from './audio-trigger-scheduler';

// ── Service instances (singletons) ─────────────────────────────────────────

const playerService = new AudioPlayerService();
const libraryService = new AudioLibraryService();
const triggerScheduler = new AudioTriggerScheduler(playerService, libraryService);

// ── Facade class (backward-compatible API surface) ─────────────────────────

class EnhancedAudioManager {
  // ── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await playerService.initialize();
  }

  // ── Library Management (delegates to AudioLibraryService) ───────────────

  loadLibrary(items: AudioLibraryItem[]): void {
    libraryService.load(items);
  }

  getLibraryItem(audioId: string): AudioLibraryItem | undefined {
    return libraryService.get(audioId);
  }

  // ── Trigger System (delegates to AudioTriggerScheduler) ────────────────

  async executeTrigger(
    trigger: AudioTrigger,
    context?: { sceneId?: string },
  ): Promise<void> {
    await triggerScheduler.executeTrigger(trigger, context);
  }

  async executeTriggersByType(
    triggers: AudioTrigger[],
    triggerType: AudioTriggerType,
    context?: { sceneId?: string },
  ): Promise<void> {
    await triggerScheduler.executeTriggersByType(triggers, triggerType, context);
  }

  cancelTrigger(triggerId: string): void {
    triggerScheduler.cancelTrigger(triggerId);
  }

  cancelAllTriggers(): void {
    triggerScheduler.cancelAllTriggers();
  }

  async processTriggers(triggers: AudioTrigger[]): Promise<void> {
    await triggerScheduler.processTriggers(triggers);
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
    await playerService.play(trackId, uri, {
      volume: opts.volume,
      loop: opts.loop,
      fadeIn: opts.fadeIn,
      metadata: { audioId: opts.audioId, triggerId: opts.triggerId },
    });
  }

  async pause(trackId: string): Promise<void> {
    await playerService.pause(trackId);
  }

  async resume(trackId: string): Promise<void> {
    await playerService.resume(trackId);
  }

  async stop(trackId: string, fadeOut?: number): Promise<void> {
    await playerService.stop(trackId, fadeOut);
  }

  async stopAll(fadeOut?: number): Promise<void> {
    await playerService.stopAll(fadeOut);
  }

  async stopByType(type: AudioLibraryItem['type'], fadeOut?: number): Promise<void> {
    await triggerScheduler.stopByType(type, fadeOut);
  }

  async setVolume(trackId: string, volume: number): Promise<void> {
    await playerService.setVolume(trackId, volume);
  }

  async crossFade(
    trackId: string,
    newUri: string,
    volume = 1,
    duration = 600,
  ): Promise<void> {
    await playerService.crossFade(trackId, newUri, volume, duration);
  }

  isPlaying(trackId: string): boolean {
    return playerService.isPlaying(trackId);
  }

  // ── State Query ────────────────────────────────────────────────────────

  getActiveTracksByType(type: AudioLibraryItem['type']): string[] {
    const matching: string[] = [];
    for (const track of playerService.getAllActiveTracks()) {
      const metaAudioId = track.metadata?.audioId;
      if (metaAudioId) {
        const item = libraryService.get(metaAudioId);
        if (item && item.type === type && track.isPlaying) {
          matching.push(track.trackId);
        }
      }
    }
    return matching;
  }

  getPlaybackState(): AudioPlaybackState[] {
    return triggerScheduler.getPlaybackStates();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    triggerScheduler.cleanup();
    await playerService.cleanup();
    libraryService.clear();
  }
}

// ── Singleton exports (backward compatible) ────────────────────────────────

export const enhancedAudioManager = new EnhancedAudioManager();
export const audioManager = enhancedAudioManager;