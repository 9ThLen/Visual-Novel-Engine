/**
 * Low-level Audio Player Service
 * Handles raw audio playback (play, stop, pause, resume, fade, crossfade).
 * No knowledge of library items, triggers, or domain concepts.
 */

import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './error-handler';
import type { IAudioPlayerService } from './audio-interfaces';
import { resolvePlayableAssetUri } from './asset-resolver';

const FADE_STEP_MS = 50;

interface TrackEntry {
    player: AudioPlayer;
    metadata?: Record<string, string | undefined>;
    fadeInterval?: ReturnType<typeof setInterval>;
    startTime: number;
}

export class AudioPlayerService implements IAudioPlayerService {
    private tracks = new Map<string, TrackEntry>();
    private initialized = false;
    /** Invalidates in-flight crossFade when stop/stopAll runs mid-fade. */
    private crossFadeGeneration = new Map<string, number>();

    private logDebug(event: string, context?: Record<string, unknown>): void {
        if (!__DEV__) return;
        console.log(`[AudioPlayerService] ${event}`, context ?? {});
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            await setAudioModeAsync({ playsInSilentMode: true });
            this.initialized = true;
} catch (err) {
      ErrorHandler.handle('AudioPlayer init failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW);
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

        await this.stop(trackId);

        try {
            const playableUri = await resolvePlayableAssetUri(uri);
            if (!playableUri) {
                ErrorHandler.handle(
                    `AudioPlayer could not resolve source for ${trackId}`,
                    undefined,
                    ErrorCategory.MEDIA,
                    ErrorSeverity.LOW,
                    { uri, trackId }
                );
                return;
            }

            const shouldKeepSessionActive = trackId === 'bgm' || loop;
            const player = createAudioPlayer(playableUri, {
                downloadFirst: shouldKeepSessionActive,
                keepAudioSessionActive: shouldKeepSessionActive,
            });
            player.loop = loop;

            const targetVolume = Math.max(0, Math.min(1, volume));
            const hasFadeIn = fadeIn != null && fadeIn > 0;
            player.volume = hasFadeIn ? 0 : targetVolume;

            this.tracks.set(trackId, { player, metadata, startTime: Date.now() });
            this.logDebug('play:start', {
                trackId,
                requestedUri: uri,
                playableUri,
                loop,
                volume: targetVolume,
                fadeIn,
                keepAudioSessionActive: shouldKeepSessionActive,
            });

            player.play();
            this.logDebug('play:called', {
                trackId,
                playing: player.playing,
                loop: player.loop,
                volume: player.volume,
            });

            if (hasFadeIn) {
                this._fade(trackId, 0, targetVolume, fadeIn);
            }

} catch (err) {
      ErrorHandler.handle(`AudioPlayer play(${trackId}) failed`, err, ErrorCategory.MEDIA, ErrorSeverity.LOW);
    }
    }

    async pause(trackId: string): Promise<void> {
        this.tracks.get(trackId)?.player.pause();
    }

    async resume(trackId: string): Promise<void> {
        const t = this.tracks.get(trackId);
        if (t && !t.player.playing) t.player.play();
    }

    private _invalidateCrossFade(trackId: string): void {
        const next = (this.crossFadeGeneration.get(trackId) ?? 0) + 1;
        this.crossFadeGeneration.set(trackId, next);
    }

    async stop(trackId: string, fadeOut?: number): Promise<void> {
        await this._stopInternal(trackId, true, fadeOut);
    }

    private async _stopInternal(trackId: string, invalidateCrossFade: boolean, fadeOut?: number): Promise<void> {
        const t = this.tracks.get(trackId);
        if (!t) return;
        if (invalidateCrossFade) {
            this._invalidateCrossFade(trackId);
        }
        this._clearFade(trackId);

        // If fadeOut requested and track is playing, fade then cleanup
        if (fadeOut != null && fadeOut > 0 && t.player.playing) {
            const currentVolume = t.player.volume;
            return new Promise<void>((resolve) => {
                this._fade(trackId, currentVolume, 0, fadeOut, () => {
                    try {
                        if (t.player.playing) t.player.pause();
                    } catch {}
                    t.player.remove();
                    this.tracks.delete(trackId);
                    resolve();
                });
            });
        }

        try {
            if (t.player.playing) {
                t.player.pause();
            }
        } catch {
            // Player may already be released on web.
        }
        t.player.remove();
        this.tracks.delete(trackId);
    }

    async stopAll(fadeOut?: number): Promise<void> {
        for (const id of [...this.tracks.keys()]) {
            this._invalidateCrossFade(id);
        }
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
        opts: {
            volume?: number;
            loop?: boolean;
            duration?: number;
        } = {},
    ): Promise<void> {
        const { volume = 1, loop = true } = opts;
        const generation = (this.crossFadeGeneration.get(trackId) ?? 0) + 1;
        this.crossFadeGeneration.set(trackId, generation);
        this.logDebug('crossFade:begin', { trackId, newUri, volume, loop, generation });

        // Check generation BEFORE stopping the old track
        if (this.crossFadeGeneration.get(trackId) !== generation) {
            this.logDebug('crossFade:cancelled', { trackId, generation });
            return;
        }
        await this._stopInternal(trackId, false);
        await this.play(trackId, newUri, { volume, loop });
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
    getAllActiveTracks(): { trackId: string; isPlaying: boolean; volume: number; loop: boolean; startTime: number; metadata?: Record<string, string | undefined> }[] {
        const result: { trackId: string; isPlaying: boolean; volume: number; loop: boolean; startTime: number; metadata?: Record<string, string | undefined> }[] = [];
        for (const [trackId, t] of this.tracks.entries()) {
            result.push({
                trackId,
                isPlaying: t.player.playing,
                volume: t.player.volume,
                loop: t.player.loop,
                startTime: t.startTime,
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
