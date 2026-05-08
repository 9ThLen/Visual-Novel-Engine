// Storage layer for React Native using AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Block } from './block-types';

const STORAGE_KEY = 'block_tree';

export async function saveTreeToStorage(root: Block): Promise<void> {
  const json = JSON.stringify(root);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, json);
  } catch (error) {
    console.error('[Storage] Failed to save tree:', error);
    throw error;
  }
}

export async function loadTreeFromStorage(): Promise<Block | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Block : null;
  } catch (error) {
    console.error('[Storage] Failed to load tree:', error);
    return null;
  }
}
