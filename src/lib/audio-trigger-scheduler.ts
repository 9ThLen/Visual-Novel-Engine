/**
 * Audio Trigger Scheduler
 * Manages trigger-based audio scheduling with support for delays,
 * cancellation, and batch execution.
 *
 * Depends on AudioPlayerService for playback and AudioLibraryService
 * for item lookups, but does not own those services — they are injected.
 */

import type { AudioTrigger, AudioTriggerType, AudioLibraryItem } from './audio-types';
import type { IAudioPlayerService, IAudioLibraryService } from './audio-interfaces';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './error-handler';

function buildTrackId(type: AudioLibraryItem['type'], triggerId: string): string {
    return `${type}_${triggerId}`;
}

interface PendingTrigger {
    timeout: ReturnType<typeof setTimeout>;
    resolve: () => void;
}

export class AudioTriggerScheduler {
    private triggerTimeouts = new Map<string, PendingTrigger>();

    constructor(
        private player: IAudioPlayerService,
        private library: IAudioLibraryService,
    ) { }

    async executeTrigger(
        trigger: AudioTrigger,
    ): Promise<void> {
const audioItem = this.library.get(trigger.audioId);
        if (!audioItem) {
          ErrorHandler.handle(`Audio item not found: ${trigger.audioId}`, undefined, ErrorCategory.MEDIA, ErrorSeverity.LOW);
          return;
        }

        const trackId = buildTrackId(audioItem.type, trigger.id);
        const volume = trigger.volume ?? audioItem.volume ?? 1;
        const loop = trigger.loop ?? audioItem.loop ?? false;

        if (trigger.stopPrevious) {
            await this.stopByType(audioItem.type, trigger.fadeOut);
        }

        if (trigger.delay && trigger.delay > 0) {
            await new Promise<void>((resolve) => {
                const timeoutId = setTimeout(async () => {
                    try {
                        await this.player.play(trackId, audioItem.uri, {
                            volume,
                            loop,
                            fadeIn: trigger.fadeIn,
                            metadata: { audioId: trigger.audioId, triggerId: trigger.id },
                        });
                        this.triggerTimeouts.delete(trigger.id);
                    } catch (err) {
                        ErrorHandler.handle('Audio playback failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW);
                    }
                    resolve();
                }, trigger.delay);

                this.triggerTimeouts.set(trigger.id, { timeout: timeoutId, resolve });
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

    async executeTriggersByType(
        triggers: AudioTrigger[],
        triggerType: AudioTriggerType,
    ): Promise<void> {
        const matching = triggers.filter((t) => t.triggerType === triggerType);
        await Promise.allSettled(
            matching.map((t) => this.executeTrigger(t).catch((err) => {
                ErrorHandler.handle(`Audio trigger failed: ${t.id}`, err, ErrorCategory.MEDIA, ErrorSeverity.LOW);
            }))
        );
    }

    async processTriggers(triggers: AudioTrigger[]): Promise<void> {
        if (!triggers || triggers.length === 0) return;
        await Promise.allSettled(triggers.map((t) =>
            this.executeTrigger(t).catch((err) => {
                ErrorHandler.handle('Audio trigger failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW);
            })
        ));
    }

    cancelTrigger(triggerId: string): void {
        const entry = this.triggerTimeouts.get(triggerId);
        if (entry) {
            clearTimeout(entry.timeout);
            entry.resolve();
            this.triggerTimeouts.delete(triggerId);
        }
    }

    cancelAllTriggers(): void {
        for (const entry of this.triggerTimeouts.values()) {
            clearTimeout(entry.timeout);
            entry.resolve();
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
    getPlaybackStates(): {
        trackId: string;
        audioId: string;
        isPlaying: boolean;
        volume: number;
        loop: boolean;
        startTime: number;
        triggerId?: string;
    }[] {
        const states: {
            trackId: string;
            audioId: string;
            isPlaying: boolean;
            volume: number;
            loop: boolean;
            startTime: number;
            triggerId?: string;
        }[] = [];

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