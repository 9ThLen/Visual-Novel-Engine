import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!currentScene) return;

    let isMounted = true;

    // Resolve and play music (only if URI is provided and valid)
    if (currentScene.musicUri && currentScene.musicUri.trim()) {
      resolveAssetUri(currentScene.musicUri).then((uri) => {
        if (isMounted && uri) {
          audioManager.crossFade('bgm', uri, volumesRef.current.bgm);
        } else if (isMounted) {
          audioManager.stop('bgm');
        }
      }).catch(() => {
        // Silent fail for missing music
        if (isMounted) audioManager.stop('bgm');
      });
    } else {
      // No music URI, stop playing
      audioManager.stop('bgm');
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

    return () => {
      isMounted = false;
    };
  }, [currentScene?.id]); // Only re-run when scene changes

  useEffect(() => {
    // Initialize audio system early to prevent playback delays
    audioManager.initialize().catch(err => console.warn('Audio init failed:', err));

    return () => {
      audioManager.stopAll(0);
    };
  }, []);
}
