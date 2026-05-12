import { useEffect, useRef } from 'react';
import { StoryScene, UserSettings } from '../lib/types';
import { enhancedAudioManager as audioManager } from '../lib/audio-manager-enhanced';
import { resolveAssetUri } from '../lib/asset-resolver';

export function useReaderAudio(currentScene: StoryScene | null, settings: UserSettings) {
  const volumesRef = useRef({ bgm: settings.bgmVolume, voice: settings.voiceVolume });
  // Track the currently playing BGM uri so we can compare across scenes
  const currentBgmUriRef = useRef<string | null>(null);

  useEffect(() => {
    volumesRef.current = { bgm: settings.bgmVolume, voice: settings.voiceVolume };
    audioManager.setVolume('bgm', settings.bgmVolume);
    audioManager.setVolume('voice', settings.voiceVolume);
  }, [settings.bgmVolume, settings.voiceVolume]);

  // Stop ALL audio when leaving the reader screen (back to menu, etc.)
  useEffect(() => {
    return () => {
      audioManager.cancelAllTriggers();
      audioManager.stopAll(0);
      currentBgmUriRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!currentScene) return;

    let isMounted = true;

    // Always stop non-BGM tracks (voice, SFX, ambient from triggers)
    // Voice is scene-specific, triggers are scene-specific
    audioManager.cancelAllTriggers();
    audioManager.stop('voice');
    // Stop trigger-based tracks that are NOT bgm type
    // (we handle bgm separately below)
    const activeTracks = audioManager.getPlaybackState();
    for (const track of activeTracks) {
      if (track.trackId !== 'bgm') {
        audioManager.stop(track.trackId, 300);
      }
    }

    // ── BGM logic: only change music if the new scene has a different URI ──
    const newMusicUri = (currentScene.musicUri && currentScene.musicUri.trim())
      ? currentScene.musicUri.trim()
      : null;

    if (newMusicUri) {
      // New scene has music — resolve and play (crossfade if different track)
      resolveAssetUri(newMusicUri).then((uri) => {
        if (!isMounted) return;
        if (!uri) return;

        if (currentBgmUriRef.current === uri) {
          // Same track already playing — just adjust volume
          audioManager.setVolume('bgm', volumesRef.current.bgm);
          return;
        }

        // Different track — crossfade to new music
        audioManager.crossFade('bgm', uri, volumesRef.current.bgm, 800);
        currentBgmUriRef.current = uri;
      }).catch(() => {
        // Failed to resolve — stop if nothing was playing
      });
    }
    // If newMusicUri is null, DON'T stop the current BGM — let it keep playing

    // ── Voice ──
    if (currentScene.voiceAudioUri && currentScene.voiceAudioUri.trim()) {
      resolveAssetUri(currentScene.voiceAudioUri).then((uri) => {
        if (isMounted && uri) {
          audioManager.play('voice', uri, { volume: volumesRef.current.voice });
        }
      }).catch(() => {
        // Silent fail for missing voice
      });
    }

    // ── Audio triggers ──
    if (currentScene.audioTriggers && currentScene.audioTriggers.length > 0) {
      audioManager.processTriggers(currentScene.audioTriggers);
    }

    return () => {
      isMounted = false;
    };
  }, [currentScene?.id]);

  useEffect(() => {
    if (__DEV__) audioManager.initialize().catch(err => console.warn('Audio init failed:', err));
    else audioManager.initialize();
  }, []);
}
