/**
 * Low-level Audio Player Service
 * Handles raw audio playback (play, stop, pause, resume, fade, crossfade).
 * No knowledge of library items, triggers, or domain concepts.
 */

import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

const FADE_STEP_MS = 50;

interface TrackEntry {
    player: AudioPlayer;
    metadata?: Record<string, string | undefined>;
    fadeInterval?: ReturnType<typeof setInterval>;
}

export class AudioPlayerService {
    private tracks = new Map<string, TrackEntry>();
    private initialized = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            await setAudioModeAsync({ playsInSilentMode: true });
            this.initialized = true;
        } catch (err) {
            console.warn('[AudioPlayer] init failed:', err);
        }
    }

    async play(
        trackId: string,
        uri: string,
        opts: {
            volume?: number;
            loop?: boolean;
            fadeIn?: number;
            metadata?: Record<string, string | undefined>;
        } = {},
    ): Promise<void> {
        await this.initialize();
        const { volume = 1, loop = false, fadeIn, metadata } = opts;

        // Stop any existing track with the same ID
        await this.stop(trackId);

        try {
            const player = createAudioPlayer(uri);
            player.loop = loop;
            player.volume = fadeIn ? 0 : Math.max(0, Math.min(1, volume));

            this.tracks.set(trackId, { player, metadata });

            player.play();

            if (fadeIn) {
                this._fade(trackId, 0, volume, fadeIn);
            }
        } catch (err) {
            console.warn(`[AudioPlayer] play(${trackId}) failed:`, err);
        }
    }

    async pause(trackId: string): Promise<void> {
        this.tracks.get(trackId)?.player.pause();
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

    async setVolume(trackId: string, volume: number): Promise<void> {
        const t = this.tracks.get(trackId);
        if (t) t.player.volume = Math.max(0, Math.min(1, volume));
    }

    isPlaying(trackId: string): boolean {
        return this.tracks.get(trackId)?.player.playing ?? false;
    }

    async crossFade(
        trackId: string,
        newUri: string,
        volume = 1,
        duration = 600,
    ): Promise<void> {
        await this.stop(trackId, duration);
        await this.play(trackId, newUri, { volume, loop: true, fadeIn: duration });
    }

    /** Returns track IDs of all currently playing tracks */
    getActiveTrackIds(): string[] {
        const ids: string[] = [];
        for (const [id, t] of this.tracks.entries()) {
            if (t.player.playing) ids.push(id);
        }
        return ids;
    }

    /** Returns metadata associated with a track (if any was stored at play time) */
    getTrackMetadata(trackId: string): Record<string, string | undefined> | undefined {
        return this.tracks.get(trackId)?.metadata;
    }

    /** Get all active tracks with their metadata (for state queries / debugging) */
    getAllActiveTracks(): Array<{ trackId: string; isPlaying: boolean; volume: number; loop: boolean; metadata?: Record<string, string | undefined> }> {
        const result: Array<{ trackId: string; isPlaying: boolean; volume: number; loop: boolean; metadata?: Record<string, string | undefined> }> = [];
        for (const [trackId, t] of this.tracks.entries()) {
            result.push({
                trackId,
                isPlaying: t.player.playing,
                volume: t.player.volume,
                loop: t.player.loop,
                metadata: t.metadata,
            });
        }
        return result;
    }

    /** Clean up all tracks */
    async cleanup(): Promise<void> {
        await this.stopAll();
    }

    // ── Private ──────────────────────────────────────────────────────────────

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
        onDone?: () => void,
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
}