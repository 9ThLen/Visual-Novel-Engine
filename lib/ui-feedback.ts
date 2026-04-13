/**
 * UI Feedback System
 * Haptic feedback and sound effects for interactions
 */

import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// Sound cache
const soundCache: Record<string, Audio.Sound> = {};

// Sound file mappings - will be loaded dynamically
const SOUND_FILES: Record<string, any> = {};

// Try to load sound files, but don't fail if they're missing
try {
  SOUND_FILES.click = require('@/assets/sounds/button-press.ogg');
} catch {}
try {
  SOUND_FILES.success = require('@/assets/sounds/success_action.wav');
} catch {}
try {
  SOUND_FILES.error = require('@/assets/sounds/error.wav');
} catch {}
try {
  SOUND_FILES.whoosh = require('@/assets/sounds/button-press.ogg'); // Using button-press as fallback
} catch {}

/**
 * Play haptic feedback
 */
export async function playHaptic(
  type: 'light' | 'medium' | 'heavy' | 'selection' = 'light'
) {
  if (Platform.OS === 'web') return;

  try {
    switch (type) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'selection':
        await Haptics.selectionAsync();
        break;
    }
  } catch (error) {
    // Haptics not supported on device - silent fail
  }
}

/**
 * Play UI sound effect
 */
export async function playSound(
  soundName: 'click' | 'success' | 'error' | 'whoosh',
  volume: number = 0.3
) {
  try {
    // Check if sound file exists
    const soundFile = SOUND_FILES[soundName];
    if (!soundFile) {
      // Sound file not available - silent fail (graceful degradation)
      return;
    }

    // Check if sound is already loaded
    if (soundCache[soundName]) {
      await soundCache[soundName].setPositionAsync(0);
      await soundCache[soundName].setVolumeAsync(volume);
      await soundCache[soundName].playAsync();
      return;
    }

    // Load and play sound
    const { sound } = await Audio.Sound.createAsync(
      soundFile,
      { volume, shouldPlay: true }
    );

    soundCache[soundName] = sound;
  } catch (error) {
    // Sound playback failed - silent fail (graceful degradation)
  }
}

/**
 * Combined feedback for button press
 */
export async function buttonFeedback() {
  await Promise.all([
    playHaptic('light'),
    playSound('click', 0.2),
  ]);
}

/**
 * Feedback for successful action
 */
export async function successFeedback() {
  await Promise.all([
    playHaptic('medium'),
    playSound('success', 0.3),
  ]);
}

/**
 * Feedback for error
 */
export async function errorFeedback() {
  await Promise.all([
    playHaptic('heavy'),
    playSound('error', 0.3),
  ]);
}

/**
 * Feedback for transitions
 */
export async function transitionFeedback() {
  await Promise.all([
    playHaptic('light'),
    playSound('whoosh', 0.25),
  ]);
}

/**
 * Cleanup sound cache
 */
export async function cleanupSounds() {
  for (const sound of Object.values(soundCache)) {
    try {
      await sound.unloadAsync();
    } catch {}
  }
  Object.keys(soundCache).forEach(key => delete soundCache[key]);
}
