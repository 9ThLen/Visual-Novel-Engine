/**
 * Enhanced Audio Manager with Trigger Support
 * Manages audio playback with trigger-based system
 */

import { setAudioModeAsync, AudioModule } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import type {
  AudioLibraryItem,
  AudioTrigger,
  AudioPlaybackState,
  AudioTriggerType,
} from './audio-types';

interface ManagedTrack {
  player: AudioPlayer;
  audioId: string;
  triggerId?: string;
  fadeInterval?: ReturnType<typeof setInterval>;
  stopTimeout?: ReturnType<typeof setTimeout>;
}

const FADE_STEP_MS = 50;

class EnhancedAudioManager {
  private tracks = new Map<string, ManagedTrack>();
  private library = new Map<string, AudioLibraryItem>();
  private initialized = false;
  private triggerTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  // ── Initialization ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      this.initialized = true;
    } catch (err) {
      console.warn('[EnhancedAudio] init failed:', err);
    }
  }

  // ── Library Management ────────────────────────────────────────────────────

  loadLibrary(items: AudioLibraryItem[]): void {
    this.library.clear();
    for (const item of items) {
      this.library.set(item.id, item);
    }
  }

  getLibraryItem(audioId: string): AudioLibraryItem | undefined {
    return this.library.get(audioId);
  }

  // ── Trigger System ────────────────────────────────────────────────────────

  /**
   * Execute audio trigger
   */
  async executeTrigger(
    trigger: AudioTrigger,
    context?: { sceneId?: string }
  ): Promise<void> {
    const audioItem = this.library.get(trigger.audioId);
    if (!audioItem) {
      console.warn(`[EnhancedAudio] Audio item not found: ${trigger.audioId}`);
      return;
    }

    const trackId = this.getTrackId(audioItem.type, trigger.id);
    const volume = trigger.volume ?? audioItem.volume ?? 1;
    const loop = trigger.loop ?? audioItem.loop ?? false;

    // Stop previous if requested
    if (trigger.stopPrevious) {
      await this.stopByType(audioItem.type, trigger.fadeOut);
    }

    // Apply delay if specified
    if (trigger.delay && trigger.delay > 0) {
      const timeoutId = setTimeout(() => {
        this.playAudio(trackId, audioItem.uri, {
          volume,
          loop,
          fadeIn: trigger.fadeIn,
          audioId: trigger.audioId,
          triggerId: trigger.id,
        });
        this.triggerTimeouts.delete(trigger.id);
      }, trigger.delay);

      this.triggerTimeouts.set(trigger.id, timeoutId);
    } else {
      await this.playAudio(trackId, audioItem.uri, {
        volume,
        loop,
        fadeIn: trigger.fadeIn,
        audioId: trigger.audioId,
        triggerId: trigger.id,
      });
    }
  }

  /**
   * Execute multiple triggers by type
   */
  async executeTriggersByType(
    triggers: AudioTrigger[],
    triggerType: AudioTriggerType,
    context?: { sceneId?: string }
  ): Promise<void> {
    const matching = triggers.filter((t) => t.triggerType === triggerType);
    await Promise.all(matching.map((t) => this.executeTrigger(t, context)));
  }

  /**
   * Cancel pending trigger
   */
  cancelTrigger(triggerId: string): void {
    const timeout = this.triggerTimeouts.get(triggerId);
    if (timeout) {
      clearTimeout(timeout);
      this.triggerTimeouts.delete(triggerId);
    }
  }

  /**
   * Cancel all pending triggers
   */
  cancelAllTriggers(): void {
    for (const timeout of this.triggerTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.triggerTimeouts.clear();
  }

  // ── Playback Control ──────────────────────────────────────────────────────

  private async playAudio(
    trackId: string,
    uri: string,
    opts: {
      volume?: number;
      loop?: boolean;
      fadeIn?: number;
      audioId?: string;
      triggerId?: string;
    } = {}
  ): Promise<void> {
    await this.initialize();
    const { volume = 1, loop = false, fadeIn, audioId, triggerId } = opts;

    // Stop previous track with same ID
    await this.stop(trackId);

    try {
      const player = new AudioModule.AudioPlayer(uri, 100, false);
      player.loop = loop;
      player.volume = fadeIn ? 0 : Math.max(0, Math.min(1, volume));

      this.tracks.set(trackId, {
        player,
        audioId: audioId || uri,
        triggerId,
      });

      player.play();

      if (fadeIn) {
        this._fade(trackId, 0, volume, fadeIn);
      }
    } catch (err) {
      console.warn(`[EnhancedAudio] play(${trackId}) failed:`, err);
    }
  }

  async pause(trackId: string): Promise<void> {
    const t = this.tracks.get(trackId);
    if (t) t.player.pause();
  }

  async resume(trackId: string): Promise<void> {
    const t = this.tracks.get(trackId);
    if (t && !t.player.playing) t.player.play();
  }

  async stop(trackId: string, fadeOut?: number): Promise<void> {
    const t = this.tracks.get(trackId);
    if (!t) return;
    this._clearFade(trackId);

    if (fadeOut && fadeOut > 0) {
      await new Promise<void>((resolve) => {
        this._fade(trackId, t.player.volume, 0, fadeOut, () => {
          t.player.remove();
          this.tracks.delete(trackId);
          resolve();
        });
      });
    } else {
      t.player.remove();
      this.tracks.delete(trackId);
    }
  }

  async stopAll(fadeOut?: number): Promise<void> {
    await Promise.all([...this.tracks.keys()].map((id) => this.stop(id, fadeOut)));
  }

  async stopByType(type: AudioLibraryItem['type'], fadeOut?: number): Promise<void> {
    const tracksToStop: string[] = [];

    for (const [trackId, track] of this.tracks.entries()) {
      const audioItem = this.library.get(track.audioId);
      if (audioItem && audioItem.type === type) {
        tracksToStop.push(trackId);
      }
    }

    await Promise.all(tracksToStop.map((id) => this.stop(id, fadeOut)));
  }

  async setVolume(trackId: string, volume: number): Promise<void> {
    const t = this.tracks.get(trackId);
    if (t) t.player.volume = Math.max(0, Math.min(1, volume));
  }

  async crossFade(
    trackId: string,
    newUri: string,
    volume = 1,
    duration = 600
  ): Promise<void> {
    await this.stop(trackId, duration);
    await this.playAudio(trackId, newUri, { volume, loop: true, fadeIn: duration });
  }

  isPlaying(trackId: string): boolean {
    return this.tracks.get(trackId)?.player.playing ?? false;
  }

  // ── State Query ───────────────────────────────────────────────────────────

  getActiveTracksByType(type: AudioLibraryItem['type']): string[] {
    const result: string[] = [];

    for (const [trackId, track] of this.tracks.entries()) {
      const audioItem = this.library.get(track.audioId);
      if (audioItem && audioItem.type === type && track.player.playing) {
        result.push(trackId);
      }
    }

    return result;
  }

  getPlaybackState(): AudioPlaybackState[] {
    const states: AudioPlaybackState[] = [];

    for (const [trackId, track] of this.tracks.entries()) {
      const audioItem = this.library.get(track.audioId);
      if (audioItem) {
        states.push({
          trackId,
          audioId: track.audioId,
          isPlaying: track.player.playing,
          volume: track.player.volume,
          loop: track.player.loop,
          startTime: Date.now(), // Approximate
          triggerId: track.triggerId,
        });
      }
    }

    return states;
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private getTrackId(type: AudioLibraryItem['type'], triggerId: string): string {
    // Generate unique track ID based on type and trigger
    return `${type}_${triggerId}`;
  }

  private _clearFade(trackId: string): void {
    const t = this.tracks.get(trackId);
    if (t?.fadeInterval) {
      clearInterval(t.fadeInterval);
      t.fadeInterval = undefined;
    }
  }

  private _fade(
    trackId: string,
    from: number,
    to: number,
    durationMs: number,
    onDone?: () => void
  ): void {
    this._clearFade(trackId);
    const t = this.tracks.get(trackId);
    if (!t) {
      onDone?.();
      return;
    }

    const steps = durationMs / FADE_STEP_MS;
    const delta = (to - from) / steps;
    let current = from;

    const interval = setInterval(() => {
      const track = this.tracks.get(trackId);
      if (!track) {
        clearInterval(interval);
        onDone?.();
        return;
      }

      current += delta;
      const done = delta > 0 ? current >= to : current <= to;
      track.player.volume = Math.max(0, Math.min(1, done ? to : current));

      if (done) {
        clearInterval(interval);
        track.fadeInterval = undefined;
        onDone?.();
      }
    }, FADE_STEP_MS);

    t.fadeInterval = interval;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    this.cancelAllTriggers();
    await this.stopAll();
    this.library.clear();
  }
}

export const enhancedAudioManager = new EnhancedAudioManager();
