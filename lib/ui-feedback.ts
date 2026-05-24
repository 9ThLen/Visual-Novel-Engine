import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';

const soundModules: Record<string, number> = {
  click:   require('../assets/sounds/button-press.ogg'),
  whoosh:  require('../assets/sounds/button-press.ogg'),
  success: require('../assets/sounds/success_action.wav'),
  error:   require('../assets/sounds/error.wav'),
};

const assetUriCache = new Map<string | number, string>();
const activePlayers: AudioPlayer[] = [];
const MAX_PLAYERS = 8;

let audioInitAttempted = false;

async function ensureAudioMode(): Promise<void> {
  if (audioInitAttempted) return;
  audioInitAttempted = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch (e) { if (__DEV__) console.debug('Audio mode init failed:', e); }
}

async function resolveAssetUri(module: string | number): Promise<string | null> {
  if (typeof module === 'string') return module;
  const cached = assetUriCache.get(module);
  if (cached) return cached;
  try {
    const asset = Asset.fromModule(module);
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri ?? null;
    if (uri) assetUriCache.set(module, uri);
    return uri;
  } catch (e) { if (__DEV__) console.debug('Asset URI resolve failed:', e); return null; }
}

function evictOldestPlayer(): void {
  while (activePlayers.length >= MAX_PLAYERS) {
    const player = activePlayers.shift();
    if (player) player.remove();
  }
}

async function playHaptic(
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
    if (__DEV__) console.debug('Haptics not supported:', error);
  }
}

async function playSound(
  soundName: 'click' | 'success' | 'error' | 'whoosh',
  volume: number = 0.3
) {
  if (Platform.OS === 'web') return;

  const soundModule = soundModules[soundName];
  if (!soundModule) {
    if (__DEV__) console.debug(`Sound not available: ${soundName}`);
    return;
  }

  try {
    await ensureAudioMode();

    const uri = await resolveAssetUri(soundModule);
    if (!uri) return;

    evictOldestPlayer();

    const player = createAudioPlayer(uri);
    player.volume = Math.max(0, Math.min(1, volume));
    activePlayers.push(player);
    player.play();
  } catch (error) {
    if (__DEV__) console.debug(`Sound playback failed: ${soundName}`, error);
  }
}

export async function buttonFeedback() {
  await Promise.all([
    playHaptic('light'),
    playSound('click', 0.2),
  ]);
}

async function successFeedback() {
  await Promise.all([
    playHaptic('medium'),
    playSound('success', 0.3),
  ]);
}

async function errorFeedback() {
  await Promise.all([
    playHaptic('heavy'),
    playSound('error', 0.3),
  ]);
}

async function transitionFeedback() {
  await Promise.all([
    playHaptic('light'),
    playSound('whoosh', 0.25),
  ]);
}

async function cleanupSounds() {
  for (const player of activePlayers) {
    try { player.remove(); } catch {}
  }
  activePlayers.length = 0;
}
