import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { UserSettings } from '../lib/user-settings';
import type { IAudioManager } from '../lib/audio-interfaces';
import { enhancedAudioManager as defaultAudioManager } from '../lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '../lib/asset-resolver';
import { getPlaybackAudioLibrary } from '../lib/audio-library';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../lib/error-handler';
import type { MusicBlockData, SceneState, TimelineStep } from '../lib/engine/types';
import type { AudioTrigger } from '../lib/audio-types';
import {
  activateReaderAudioSession,
  deactivateReaderAudioSession,
  getReaderAudioSessionId,
  isReaderAudioSessionValid,
  resumeReaderAudioSession,
  suspendReaderAudioSession,
} from '../lib/reader-audio-session';

type ReaderAudioScene = {
  id: string;
  timeline?: TimelineStep[];
  musicUri?: string | null;
  voiceAudioUri?: string | null;
  audioTriggers?: AudioTrigger[];
};

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

function getSceneStartMusicUri(scene: ReaderAudioScene | null): string | null {
  const musicStep = scene?.timeline?.find(
    (step: TimelineStep) => step.enabled && step.blockType === 'music',
  );
  if (!musicStep) return scene?.musicUri?.trim() || null;

  const data = musicStep.data as MusicBlockData;
  if (data.action !== 'play') return null;
  return data.assetId?.trim() || null;
}

function resolveRuntimeMusicUri(
  scene: ReaderAudioScene,
  sceneState: SceneState | null | undefined,
): string | null {
  if (sceneState) {
    return sceneState.musicPlaying ? sceneState.musicTrackId?.trim() || null : null;
  }
  return getSceneStartMusicUri(scene);
}

/** Stops all reader playback and disables the reader audio session. */
export async function stopReaderPlayback(
  audioManager: IAudioManager = defaultAudioManager,
): Promise<void> {
  deactivateReaderAudioSession();
  audioManager.cancelAllTriggers();
  await audioManager.stopAll(0);
}

export function useReaderAudio(
  storyId: string | null | undefined,
  currentScene: ReaderAudioScene | null,
  settings: UserSettings,
  options?: {
    audioManager?: IAudioManager;
    sceneState?: SceneState | null;
    /** True when reader menu, history log, or similar overlays block story audio. */
    blockedByOverlay?: boolean;
  },
) {
  const audioManager = options?.audioManager ?? defaultAudioManager;
  const sceneState = options?.sceneState ?? null;
  const blockedByOverlay = options?.blockedByOverlay ?? false;
  const isFocused = useIsFocused();
  const audioTriggerSignature = buildAudioTriggerSignature(currentScene);
  const volumesRef = useRef({ bgm: settings.bgmVolume, voice: settings.voiceVolume });
  const currentBgmUriRef = useRef<string | null>(null);
  const sceneGenerationRef = useRef(0);

  const logDebug = useCallback((event: string, context?: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.log(`[useReaderAudio] ${event}`, context ?? {});
  }, []);

  const applySceneAudio = useCallback(
    (scene: ReaderAudioScene, runtimeState: SceneState | null, sessionId: number) => {
      const generation = ++sceneGenerationRef.current;
      const musicUri = resolveRuntimeMusicUri(scene, runtimeState);
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
        if (track.trackId !== 'bgm') {
          void audioManager.stop(track.trackId, 300);
        }
      }

      const newMusicUri = musicUri;

      if (newMusicUri) {
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
            if (__DEV__) console.warn('[useReaderAudio] Could not resolve BGM:', newMusicUri);
            return;
          }

          if (currentBgmUriRef.current === uri) {
            void audioManager.setVolume('bgm', volumesRef.current.bgm);
            logDebug('bgm:reuse-track', {
              sceneId: scene.id,
              resolvedUri: uri,
              bgmVolume: volumesRef.current.bgm,
            });
            return;
          }

          void audioManager
            .crossFade('bgm', uri, { volume: volumesRef.current.bgm, duration: 800 })
            .catch((err) =>
              ErrorHandler.handle('BGM crossfade failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW),
            );
          logDebug('bgm:crossFade-dispatched', {
            sceneId: scene.id,
            resolvedUri: uri,
            bgmVolume: volumesRef.current.bgm,
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
            if (__DEV__ && scene.voiceAudioUri?.trim()) {
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
    },
    [audioManager, logDebug, storyId],
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
    if (blockedByOverlay) {
      sceneGenerationRef.current += 1;
      currentBgmUriRef.current = null;
      suspendReaderAudioSession();
      void audioManager.cancelAllTriggers();
      void audioManager.stopAll(0);
      return;
    }

    resumeReaderAudioSession();

    if (!isFocused) {
      sceneGenerationRef.current += 1;
      currentBgmUriRef.current = null;
      void stopReaderPlayback(audioManager);
      return;
    }

    if (!currentScene) {
      sceneGenerationRef.current += 1;
      currentBgmUriRef.current = null;
      void stopReaderPlayback(audioManager);
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
    sceneState?.musicVolume,
    currentScene?.voiceAudioUri,
    audioTriggerSignature,
    applySceneAudio,
    audioManager,
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
