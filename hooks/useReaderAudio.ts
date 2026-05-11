import { useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { StoryScene, UserSettings } from '../lib/types';
import { enhancedAudioManager as audioManager } from '../lib/audio-manager-enhanced';
import { resolveAssetUri } from '../lib/asset-resolver';

export function useReaderAudio(currentScene: StoryScene | null, settings: UserSettings) {
  // Use refs to avoid re-triggering scene effects when volume changes
  const volumesRef = useRef({ bgm: settings.bgmVolume, voice: settings.voiceVolume });

  useEffect(() => {
    volumesRef.current = { bgm: settings.bgmVolume, voice: settings.voiceVolume };
    // Update live volume without restarting audio
    audioManager.setVolume('bgm', settings.bgmVolume);
    audioManager.setVolume('voice', settings.voiceVolume);
  }, [settings.bgmVolume, settings.voiceVolume]);

  // Stop ALL audio when leaving the reader screen (blur/unfocus)
  // Expo Router keeps screens mounted in the stack, so useEffect cleanup
  // on unmount is NOT reliable — useFocusEffect handles navigation away.
  useFocusEffect(
    useRef(() => {
      // on focus: nothing — audio is started by the scene effect below
      return () => {
        // on blur: user navigated away (back to menu, etc.)
        audioManager.cancelAllTriggers();
        audioManager.stopAll(0);
      };
    }).current,
  );

  useEffect(() => {
    if (!currentScene) return;

    let isMounted = true;

    // Stop all previous audio before starting new scene audio.
    // This ensures trigger-based tracks (music_trigger1, etc.) from the
    // previous scene are cleaned up — crossFade only manages the 'bgm' track.
    audioManager.cancelAllTriggers();
    audioManager.stopAll(0).then(() => {
      if (!isMounted) return;

      // Resolve and play music (only if URI is provided and valid)
      if (currentScene.musicUri && currentScene.musicUri.trim()) {
        resolveAssetUri(currentScene.musicUri).then((uri) => {
          if (isMounted && uri) {
            audioManager.play('bgm', uri, {
              volume: volumesRef.current.bgm,
              loop: true,
              fadeIn: 400,
            });
          } else if (isMounted) {
            audioManager.stop('bgm');
          }
        }).catch(() => {
          if (isMounted) audioManager.stop('bgm');
        });
      }

      // Resolve and play voice
      if (currentScene.voiceAudioUri && currentScene.voiceAudioUri.trim()) {
        resolveAssetUri(currentScene.voiceAudioUri).then((uri) => {
          if (isMounted) {
            audioManager.play('voice', uri, { volume: volumesRef.current.voice });
          }
        }).catch(() => {
          // Silent fail for missing voice
        });
      }

      // Process audio triggers for the current scene
      if (currentScene.audioTriggers && currentScene.audioTriggers.length > 0) {
        audioManager.processTriggers(currentScene.audioTriggers);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentScene?.id]); // Only re-run when scene changes

  useEffect(() => {
    // Initialize audio system early to prevent playback delays
    audioManager.initialize().catch(err => console.warn('Audio init failed:', err));
  }, []);
}
