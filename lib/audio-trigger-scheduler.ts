/**
 * Audio Trigger Scheduler
 * Manages trigger-based audio scheduling with support for delays,
 * cancellation, and batch execution.
 *
 * Depends on AudioPlayerService for playback and AudioLibraryService
 * for item lookups, but does not own those services — they are injected.
 */

import type { AudioTrigger, AudioTriggerType, AudioLibraryItem } from './audio-types';
import { AudioPlayerService } from './audio-player-service';
import { AudioLibraryService } from './audio-library-service';

/** Derive a unique track ID from type and trigger ID */
function buildTrackId(type: AudioLibraryItem['type'], triggerId: string): string {
    return `${type}_${triggerId}`;
}

export class AudioTriggerScheduler {
    private triggerTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private player: AudioPlayerService,
        private library: AudioLibraryService,
    ) { }

    /**
     * Execute a single audio trigger.
     */
    async executeTrigger(
        trigger: AudioTrigger,
        _context?: { sceneId?: string },
    ): Promise<void> {
const audioItem = this.library.get(trigger.audioId);
        if (!audioItem) {
          if (__DEV__) console.warn(`[AudioTriggerScheduler] Audio item not found: ${trigger.audioId}`);
          return;
        }

        const trackId = buildTrackId(audioItem.type, trigger.id);
        const volume = trigger.volume ?? audioItem.volume ?? 1;
        const loop = trigger.loop ?? audioItem.loop ?? false;

        // Stop previous audio of the same type if requested
        if (trigger.stopPrevious) {
            await this.stopByType(audioItem.type, trigger.fadeOut);
        }

        // Apply delay if specified
        if (trigger.delay && trigger.delay > 0) {
            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(async () => {
                    try {
                        await this.player.play(trackId, audioItem.uri, {
                            volume,
                            loop,
                            fadeIn: trigger.fadeIn,
                            metadata: { audioId: trigger.audioId, triggerId: trigger.id },
                        });
                        this.triggerTimeouts.delete(trigger.id);
                        resolve();
                    } catch (err) {
                        this.triggerTimeouts.delete(trigger.id);
                        reject(err);
                    }
                }, trigger.delay);

                this.triggerTimeouts.set(trigger.id, timeoutId);
            });
        } else {
            await this.player.play(trackId, audioItem.uri, {
                volume,
                loop,
                fadeIn: trigger.fadeIn,
                metadata: { audioId: trigger.audioId, triggerId: trigger.id },
            });
        }
    }

    /**
     * Execute multiple triggers filtered by type.
     */
    async executeTriggersByType(
        triggers: AudioTrigger[],
        triggerType: AudioTriggerType,
        context?: { sceneId?: string },
    ): Promise<void> {
        const matching = triggers.filter((t) => t.triggerType === triggerType);
        await Promise.all(matching.map((t) => this.executeTrigger(t, context)));
    }

    /**
     * Process a batch of triggers concurrently.
     */
    async processTriggers(triggers: AudioTrigger[]): Promise<void> {
        if (!triggers || triggers.length === 0) return;
        await Promise.all(triggers.map((t) => this.executeTrigger(t)));
    }

    /**
     * Cancel a pending (delayed) trigger.
     */
    cancelTrigger(triggerId: string): void {
        const timeout = this.triggerTimeouts.get(triggerId);
        if (timeout) {
            clearTimeout(timeout);
            this.triggerTimeouts.delete(triggerId);
        }
    }

    /**
     * Cancel all pending triggers.
     */
    cancelAllTriggers(): void {
        for (const timeout of this.triggerTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.triggerTimeouts.clear();
    }

    /**
     * Stop all tracks of a given audio type.
     */
    async stopByType(type: AudioLibraryItem['type'], fadeOut?: number): Promise<void> {
        // Get all active tracks from the player and check their metadata
        const activeTracks = this.player.getAllActiveTracks();
        const stopPromises: Promise<void>[] = [];

        for (const track of activeTracks) {
            const metaAudioId = track.metadata?.audioId;
            if (metaAudioId) {
                const item = this.library.get(metaAudioId);
                if (item && item.type === type) {
                    stopPromises.push(this.player.stop(track.trackId, fadeOut));
                }
            }
        }

        await Promise.all(stopPromises);
    }

    /**
     * Get playback state for active tracks by looking up their metadata.
     */
    getPlaybackStates(): Array<{
        trackId: string;
        audioId: string;
        isPlaying: boolean;
        volume: number;
        loop: boolean;
        startTime: number;
        triggerId?: string;
    }> {
        const states: Array<{
            trackId: string;
            audioId: string;
            isPlaying: boolean;
            volume: number;
            loop: boolean;
            startTime: number;
            triggerId?: string;
        }> = [];

        for (const track of this.player.getAllActiveTracks()) {
            const audioId = track.metadata?.audioId ?? '';
            states.push({
                trackId: track.trackId,
                audioId,
                isPlaying: track.isPlaying,
                volume: track.volume,
                loop: track.loop,
                startTime: Date.now(), // Approximate
                triggerId: track.metadata?.triggerId,
            });
        }

        return states;
    }

    /**
     * Cancel all pending triggers and return a cleanup function.
     */
    cleanup(): void {
        this.cancelAllTriggers();
    }
}