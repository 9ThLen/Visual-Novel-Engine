import type {
  AudioLibraryItem,
  AudioTrigger,
  AudioTriggerType,
  AudioPlaybackState,
} from './audio-types';

export interface IAudioPlayerService {
  initialize(): Promise<void>;
  play(
    trackId: string,
    uri: string,
    opts?: {
      volume?: number;
      loop?: boolean;
      fadeIn?: number;
      metadata?: Record<string, string | undefined>;
    },
  ): Promise<void>;
  pause(trackId: string): Promise<void>;
  resume(trackId: string): Promise<void>;
  stop(trackId: string, fadeOut?: number): Promise<void>;
  stopAll(fadeOut?: number): Promise<void>;
  setVolume(trackId: string, volume: number): Promise<void>;
  isPlaying(trackId: string): boolean;
  crossFade(
    trackId: string,
    newUri: string,
    opts?: { volume?: number; loop?: boolean; fadeInMs?: number; fadeOutMs?: number },
  ): Promise<void>;
  getActiveTrackIds(): string[];
  getTrackMetadata(trackId: string): Record<string, string | undefined> | undefined;
  getAllActiveTracks(): {
    trackId: string;
    isPlaying: boolean;
    volume: number;
    loop: boolean;
    startTime: number;
    metadata?: Record<string, string | undefined>;
  }[];
  cleanup(): Promise<void>;
}

export interface IAudioLibraryService {
  load(items: AudioLibraryItem[]): void;
  get(audioId: string): AudioLibraryItem | undefined;
  getByType(type: AudioLibraryItem['type']): AudioLibraryItem[];
  set(item: AudioLibraryItem): void;
  remove(audioId: string): void;
  getAll(): AudioLibraryItem[];
  clear(): void;
  readonly size: number;
}

export interface IAudioManager {
  initialize(): Promise<void>;
  loadLibrary(items: AudioLibraryItem[]): void;
  getLibraryItem(audioId: string): AudioLibraryItem | undefined;
  executeTrigger(trigger: AudioTrigger): Promise<void>;
  executeTriggersByType(
    triggers: AudioTrigger[],
    triggerType: AudioTriggerType,
  ): Promise<void>;
  cancelTrigger(triggerId: string): void;
  cancelAllTriggers(): void;
  processTriggers(triggers: AudioTrigger[]): Promise<void>;
  play(
    trackId: string,
    uri: string,
    opts?: {
      volume?: number;
      loop?: boolean;
      fadeIn?: number;
      audioId?: string;
      triggerId?: string;
    },
  ): Promise<void>;
  pause(trackId: string): Promise<void>;
  resume(trackId: string): Promise<void>;
  stop(trackId: string, fadeOut?: number): Promise<void>;
  stopAll(fadeOut?: number): Promise<void>;
  stopByType(type: AudioLibraryItem['type'], fadeOut?: number): Promise<void>;
  setVolume(trackId: string, volume: number): Promise<void>;
  crossFade(
    trackId: string,
    newUri: string,
    opts?: { volume?: number; loop?: boolean; fadeInMs?: number; fadeOutMs?: number },
  ): Promise<void>;
  isPlaying(trackId: string): boolean;
  getActiveTracksByType(type: AudioLibraryItem['type']): string[];
  getPlaybackState(): AudioPlaybackState[];
  cleanup(): Promise<void>;
}
