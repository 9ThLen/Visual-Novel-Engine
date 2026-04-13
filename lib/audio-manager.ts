/**
 * AudioManager — real playback via expo-audio with cross-fade support.
 *
 * Track IDs used by the app:
 *   "bgm"   – looping background music
 *   "voice" – one-shot character voice line
 *   "sfx"   – one-shot sound effect
 */
import { setAudioModeAsync, AudioModule } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

interface ManagedTrack {
  player: AudioPlayer;
  uri: string;
  fadeInterval?: ReturnType<typeof setInterval>;
}

const FADE_STEP_MS = 50;   // tick every 50 ms
const FADE_DURATION_MS = 600;

class AudioManager {
  private tracks = new Map<string, ManagedTrack>();
  private initialized = false;

  // ── init ────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      this.initialized = true;
    } catch (err) {
      console.warn('[Audio] init failed:', err);
    }
  }

  // ── playback ─────────────────────────────────────────────────────────────

  async play(
    id: string,
    uri: string,
    opts: { volume?: number; loop?: boolean; fadeIn?: boolean } = {}
  ): Promise<void> {
    await this.initialize();
    const { volume = 1, loop = false, fadeIn = false } = opts;

    // Stop previous track with the same id
    await this.stop(id, false);

    try {
      const player = new AudioModule.AudioPlayer(uri, 100, false);
      player.loop = loop;
      player.volume = fadeIn ? 0 : Math.max(0, Math.min(1, volume));

      this.tracks.set(id, { player, uri });
      player.play();

      if (fadeIn) this._fade(id, 0, volume, FADE_DURATION_MS);
    } catch (err) {
      console.warn(`[Audio] play(${id}) failed:`, err);
    }
  }

  async pause(id: string): Promise<void> {
    const t = this.tracks.get(id);
    if (t) t.player.pause();
  }

  async resume(id: string): Promise<void> {
    const t = this.tracks.get(id);
    if (t && !t.player.playing) t.player.play();
  }

  async stop(id: string, fadeOut = false): Promise<void> {
    const t = this.tracks.get(id);
    if (!t) return;
    this._clearFade(id);

    if (fadeOut) {
      await new Promise<void>((resolve) => {
        this._fade(id, t.player.volume, 0, FADE_DURATION_MS, () => {
          t.player.remove();
          this.tracks.delete(id);
          resolve();
        });
      });
    } else {
      t.player.remove();
      this.tracks.delete(id);
    }
  }

  async stopAll(fadeOut = false): Promise<void> {
    await Promise.all([...this.tracks.keys()].map((id) => this.stop(id, fadeOut)));
  }

  async setVolume(id: string, volume: number): Promise<void> {
    const t = this.tracks.get(id);
    if (t) t.player.volume = Math.max(0, Math.min(1, volume));
  }

  async crossFade(id: string, newUri: string, volume = 1): Promise<void> {
    // Fade out old → immediately start new with fade-in
    await this.stop(id, true);
    await this.play(id, newUri, { volume, loop: true, fadeIn: true });
  }

  isPlaying(id: string): boolean {
    return this.tracks.get(id)?.player.playing ?? false;
  }

  // ── private ──────────────────────────────────────────────────────────────

  private _clearFade(id: string): void {
    const t = this.tracks.get(id);
    if (t?.fadeInterval) {
      clearInterval(t.fadeInterval);
      t.fadeInterval = undefined;
    }
  }

  private _fade(
    id: string,
    from: number,
    to: number,
    durationMs: number,
    onDone?: () => void
  ): void {
    this._clearFade(id);
    const t = this.tracks.get(id);
    if (!t) { onDone?.(); return; }

    const steps = durationMs / FADE_STEP_MS;
    const delta = (to - from) / steps;
    let current = from;

    const interval = setInterval(() => {
      const track = this.tracks.get(id);
      if (!track) { clearInterval(interval); onDone?.(); return; }

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

export const audioManager = new AudioManager();
export type { ManagedTrack };
