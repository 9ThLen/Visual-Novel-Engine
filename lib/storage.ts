// Storage layer for React Native using AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Block } from './block-types';
import { STORAGE_KEYS } from './storage-keys';

export async function saveTreeToStorage(root: Block): Promise<void> {
  const json = JSON.stringify(root);
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.BLOCK_TREE, json);
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to save tree:', error);
    throw error;
  }
}

export async function loadTreeFromStorage(): Promise<Block | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.BLOCK_TREE);
    return raw ? JSON.parse(raw) as Block : null;
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to load tree:', error);
    return null;
  }
}
