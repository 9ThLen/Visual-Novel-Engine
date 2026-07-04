import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import type { UserSettings } from '../lib/user-settings';
import type { IAudioManager } from '../lib/audio-interfaces';
import { enhancedAudioManager as defaultAudioManager } from '../lib/audio-manager-enhanced';
import { isEffectAmbienceTrack } from '../lib/effect-audio';
import { useEffectAmbience } from './useEffectAmbience';
import { resolvePlayableAssetUri } from '../lib/asset-resolver';
import { getPlaybackAudioLibrary } from '@/stores/audio-library-actions';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../lib/error-handler';
import type { MusicBlockData, TimelineStep } from '../lib/engine/types';
import type { SceneState, SoundRuntimeEvent } from '../lib/engine/runtime-types';
import type { AudioTrigger } from '../lib/audio-types';
import {
  activateReaderAudioSession,
  deactivateReaderAudioSession,
  getReaderAudioSessionId,
  isReaderAudioSessionValid,
  resumeReaderAudioSession,
  suspendReaderAudioSession,
} from '../lib/reader-audio-session';
import { shouldLogDevDiagnostics } from '../lib/dev-logging';

type ReaderAudioScene = {
  id: string;
  timeline?: TimelineStep[];
  musicUri?: string | null;
  voiceAudioUri?: string | null;
  audioTriggers?: AudioTrigger[];
};

const MAX_PLAYED_SOUND_EVENT_KEYS = 200;

function buildAudioTriggerSignature(scene: ReaderAudioScene | null): string {
  const triggers = scene?.audioTriggers;
  if (!triggers || triggers.length === 0) {
    return '';
  }

  return triggers
    .map((trigger) =>
      [
        trigger.id,
        trigger.audioId,
        trigger.triggerType,
        trigger.delay ?? '',
        trigger.volume ?? '',
        trigger.loop ?? '',
        trigger.stopPrevious ?? '',
        trigger.fadeIn ?? '',
        trigger.fadeOut ?? '',
      ].join(':'),
    )
    .join('|');
}

function buildSoundEventSignature(events: SoundRuntimeEvent[] | undefined): string {
  return (events ?? [])
    .map((event) =>
      [
        event.id,
        event.assetId,
        event.action,
        event.volume,
        event.loop,
        event.pitchVariation,
        event.timestamp,
      ].join(':'),
    )
    .join('|');
}

function rememberPlayedSoundEvent(playedEvents: Set<string>, eventKey: string): void {
  playedEvents.add(eventKey);

  while (playedEvents.size > MAX_PLAYED_SOUND_EVENT_KEYS) {
    const oldest = playedEvents.values().next().value;
    if (oldest === undefined) break;
    playedEvents.delete(oldest);
  }
}

function getSceneStartMusicUri(scene: ReaderAudioScene | null): string | null {
  const musicStep = scene?.timeline?.find(
    (step: TimelineStep) => step.enabled && step.blockType === 'music',
  );
  if (!musicStep) return scene?.musicUri?.trim() || null;

  const data = musicStep.data as MusicBlockData;
  if (data.action !== 'play') return null;
  return data.assetId?.trim() || null;
}

function resolveRuntimeMusic(
  scene: ReaderAudioScene,
  sceneState: SceneState | null | undefined,
): {
  uri: string | null;
  action: MusicBlockData['action'] | null;
  volume: number;
  loop: boolean;
  fadeDuration: number;
} {
  if (sceneState?.musicAction) {
    return {
      uri: sceneState.musicTrackId?.trim() || null,
      action: sceneState.musicAction,
      volume: typeof sceneState.musicVolume === 'number' ? sceneState.musicVolume : 1,
      loop: sceneState.musicLoop ?? true,
      fadeDuration: sceneState.musicFadeDuration ?? 800,
    };
  }
  return {
    uri: getSceneStartMusicUri(scene),
    action: null,
    volume: 1,
    loop: true,
    fadeDuration: 800,
  };
}

/** Stops all reader playback and disables the reader audio session. */
export async function stopReaderPlayback(
  audioManager: IAudioManager = defaultAudioManager,
): Promise<void> {
  deactivateReaderAudioSession();
  audioManager.cancelAllTriggers();
  await audioManager.stopAll(0);
}

/**
 * `audioManager` is a module-level singleton (see `enhancedAudioManager` in
 * `lib/audio-manager-enhanced.ts`). Its reference never changes, so dependency
 * arrays that include it are stable and the hook does not need to receive it
 * as a parameter. Use the singleton directly to keep the API surface small.
 */
export function useReaderAudio(
  storyId: string | null | undefined,
  currentScene: ReaderAudioScene | null,
  settings: UserSettings,
  options?: {
    sceneState?: SceneState | null;
    /** True when reader menu, history log, or similar overlays block story audio. */
    blockedByOverlay?: boolean;
  },
) {
  // Singleton — import once, never re-assign. See module doc above.
  const audioManager = defaultAudioManager;
  const sceneState = options?.sceneState ?? null;
  const blockedByOverlay = options?.blockedByOverlay ?? false;
  const isFocused = useIsFocused();
  const audioTriggerSignature = buildAudioTriggerSignature(currentScene);
  const soundEventSignature = buildSoundEventSignature(sceneState?.soundEvents);
  const volumesRef = useRef({ bgm: settings.bgmVolume, voice: settings.voiceVolume });
  const currentBgmUriRef = useRef<string | null>(null);
  const playedSoundEventsRef = useRef<Set<string>>(new Set());
  const sceneGenerationRef = useRef(0);

  const logDebug = useCallback((event: string, context?: Record<string, unknown>) => {
    if (!shouldLogDevDiagnostics()) return;
    console.log(`[useReaderAudio] ${event}`, context ?? {});
  }, []);

  useEffectAmbience(
    sceneState?.activeEffects,
    settings.sfxVolume,
    isFocused && !blockedByOverlay,
  );

  const applySceneAudio = useCallback(
    (scene: ReaderAudioScene, runtimeState: SceneState | null, sessionId: number) => {
      const generation = ++sceneGenerationRef.current;
      const music = resolveRuntimeMusic(scene, runtimeState);
      const musicUri = music.uri;
      logDebug('applySceneAudio', {
        storyId,
        sceneId: scene.id,
        musicUri,
        voiceAudioUri: scene.voiceAudioUri,
        triggerCount: scene.audioTriggers?.length ?? 0,
        sessionId,
        generation,
        bgmVolume: volumesRef.current.bgm,
      });

      audioManager.cancelAllTriggers();
      audioManager.stop('voice');
      const activeTracks = audioManager.getPlaybackState() ?? [];
      for (const track of activeTracks) {
        // Effect ambience (rain loop, thunder) outlives a single step —
        // useEffectAmbience owns its lifecycle.
        if (track.trackId !== 'bgm' && !isEffectAmbienceTrack(track.trackId)) {
          void audioManager.stop(track.trackId, 300);
        }
      }

      const newMusicUri = musicUri;

      if (music.action === 'stop') {
        void audioManager.stop('bgm', music.fadeDuration);
        currentBgmUriRef.current = null;
      } else if (music.action === 'pause') {
        void audioManager.pause('bgm');
      } else if (newMusicUri) {
        resolvePlayableAssetUri(newMusicUri).then((uri) => {
          logDebug('bgm:resolved', {
            sceneId: scene.id,
            requestedUri: newMusicUri,
            resolvedUri: uri,
            generation,
            sessionId,
          });
          if (
            sceneGenerationRef.current !== generation ||
            !isReaderAudioSessionValid(sessionId)
          ) {
            logDebug('bgm:aborted', {
              sceneId: scene.id,
              requestedUri: newMusicUri,
              generation,
              currentGeneration: sceneGenerationRef.current,
              sessionId,
              sessionStillValid: isReaderAudioSessionValid(sessionId),
            });
            return;
          }
          if (!uri) {
            if (shouldLogDevDiagnostics()) console.warn('[useReaderAudio] Could not resolve BGM:', newMusicUri);
            return;
          }

          if (currentBgmUriRef.current === uri) {
            void audioManager.setVolume('bgm', volumesRef.current.bgm * music.volume);
            logDebug('bgm:reuse-track', {
              sceneId: scene.id,
              resolvedUri: uri,
              bgmVolume: volumesRef.current.bgm * music.volume,
            });
            return;
          }

          void audioManager
            .crossFade('bgm', uri, {
              volume: volumesRef.current.bgm * music.volume,
              duration: music.fadeDuration || 800,
              ...(music.action ? { loop: music.loop } : {}),
            })
            .catch((err) =>
              ErrorHandler.handle('BGM crossfade failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
            );
          logDebug('bgm:crossFade-dispatched', {
            sceneId: scene.id,
            resolvedUri: uri,
            bgmVolume: volumesRef.current.bgm * music.volume,
          });
          currentBgmUriRef.current = uri;
        });
      } else {
        logDebug('bgm:none', { sceneId: scene.id });
      }

      if (scene.voiceAudioUri?.trim()) {
        resolvePlayableAssetUri(scene.voiceAudioUri).then((uri) => {
          if (
            sceneGenerationRef.current !== generation ||
            !isReaderAudioSessionValid(sessionId) ||
            !uri
          ) {
            if (shouldLogDevDiagnostics() && scene.voiceAudioUri?.trim()) {
              console.warn('[useReaderAudio] Could not resolve voice:', scene.voiceAudioUri);
            }
            return;
          }
          void audioManager
            .play('voice', uri, { volume: volumesRef.current.voice })
            .catch((err) =>
              ErrorHandler.handle('Voice playback failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
            );
        });
      }

      const triggers = scene.audioTriggers;
      if (triggers && triggers.length > 0) {
        void audioManager
          .executeTriggersByType(triggers, 'scene_start')
          .catch((err) =>
            ErrorHandler.handle('scene_start triggers failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
          );
      }

      for (const event of runtimeState?.soundEvents ?? []) {
        const eventKey = `${scene.id}:${event.id}`;
        if (!event.assetId || playedSoundEventsRef.current.has(eventKey)) continue;
        rememberPlayedSoundEvent(playedSoundEventsRef.current, eventKey);
        const soundChannelId = event.loop ? `sfx:${event.assetId}` : `sfx:${event.id}`;
        if (event.action === 'stop') {
          void audioManager.stop(`sfx:${event.assetId}`, 100);
          continue;
        }
        resolvePlayableAssetUri(event.assetId).then((uri) => {
          if (
            sceneGenerationRef.current !== generation ||
            !isReaderAudioSessionValid(sessionId) ||
            !uri
          ) {
            return;
          }
          void audioManager
            .play(soundChannelId, uri, {
              volume: settings.sfxVolume * event.volume,
              loop: event.loop,
            })
            .catch((err) =>
              ErrorHandler.handle('SFX playback failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
            );
        });
      }
    },
    [audioManager, logDebug, settings.sfxVolume, storyId],
  );

  useEffect(() => {
    volumesRef.current = { bgm: settings.bgmVolume, voice: settings.voiceVolume };
    audioManager.setVolume('bgm', settings.bgmVolume);
    audioManager.setVolume('voice', settings.voiceVolume);
  }, [settings.bgmVolume, settings.voiceVolume, audioManager]);

  useEffect(() => {
    if (!storyId) return;

    let cancelled = false;
    getPlaybackAudioLibrary(storyId)
      .then((library) => {
        if (!cancelled) audioManager.loadLibrary(library);
      })
      .catch((err) =>
        ErrorHandler.handle('Failed to load audio library', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
      );

    return () => {
      cancelled = true;
    };
  }, [storyId, audioManager]);

  useFocusEffect(
    useCallback(() => {
      activateReaderAudioSession();
      return () => {
        sceneGenerationRef.current += 1;
        currentBgmUriRef.current = null;
        void stopReaderPlayback(audioManager);
      };
    }, [audioManager]),
  );

  useEffect(() => {
    playedSoundEventsRef.current.clear();
  }, [currentScene?.id]);

  useEffect(() => {
    if (blockedByOverlay) {
      sceneGenerationRef.current += 1;
      currentBgmUriRef.current = null;
      suspendReaderAudioSession();
      void audioManager.cancelAllTriggers();
      void audioManager.stopAll(0);
      return;
    }

    resumeReaderAudioSession();

    if (!isFocused || !currentScene) {
      sceneGenerationRef.current += 1;
      currentBgmUriRef.current = null;
      void stopReaderPlayback(audioManager);
    }
  }, [blockedByOverlay, isFocused, currentScene?.id, audioManager]);

  useEffect(() => {
    if (blockedByOverlay || !isFocused || !currentScene) {
      return;
    }

    const sessionId = getReaderAudioSessionId() ?? activateReaderAudioSession();
    applySceneAudio(currentScene, sceneState, sessionId);

    return () => {
      sceneGenerationRef.current += 1;
    };
  }, [
    blockedByOverlay,
    isFocused,
    currentScene?.id,
    sceneState?.musicTrackId,
    sceneState?.musicPlaying,
    sceneState?.musicAction,
    sceneState?.musicVolume,
    sceneState?.musicLoop,
    sceneState?.musicFadeDuration,
    soundEventSignature,
    currentScene?.voiceAudioUri,
    audioTriggerSignature,
    applySceneAudio,
  ]);

  useEffect(() => {
    return () => {
      sceneGenerationRef.current += 1;
      currentBgmUriRef.current = null;
      void stopReaderPlayback(audioManager);
    };
  }, [audioManager]);

  useEffect(() => {
    audioManager
      .initialize()
      .catch((err) =>
        ErrorHandler.handle('Audio init failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
      );
  }, [audioManager]);
}
