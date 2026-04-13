/**
 * UI Feedback System
 * Haptic feedback and sound effects for interactions
 */

import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// Sound cache
const soundCache: Record<string, Audio.Sound> = {};

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
    // Haptics not supported on device
    console.warn('Haptics not supported:', error);
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
    // Check if sound is already loaded
    if (soundCache[soundName]) {
      await soundCache[soundName].replayAsync();
      return;
    }

    // Load sound (in production, use actual sound files)
    // For now, we'll just use a placeholder
    const { sound } = await Audio.Sound.createAsync(
      // Placeholder - replace with actual sound files
      { uri: `asset:/sounds/${soundName}.mp3` },
      { volume, shouldPlay: true }
    );

    soundCache[soundName] = sound;
  } catch (error) {
    // Sound not available or failed to load
    console.warn('Sound playback failed:', error);
  }
}

/**
 * Combined feedback for button press
 */
export async function buttonFeedback() {
  await Promise.all([
    playHaptic('light'),
    // playSound('click', 0.2), // Uncomment when sound files are available
  ]);
}

/**
 * Feedback for successful action
 */
export async function successFeedback() {
  await Promise.all([
    playHaptic('medium'),
    // playSound('success', 0.3),
  ]);
}

/**
 * Feedback for error
 */
export async function errorFeedback() {
  await Promise.all([
    playHaptic('heavy'),
    // playSound('error', 0.3),
  ]);
}

/**
 * Cleanup sound cache
 */
export async function cleanupSounds() {
  for (const sound of Object.values(soundCache)) {
    await sound.unloadAsync();
  }
}
