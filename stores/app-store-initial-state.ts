import { defaultUserSettings } from '@/lib/user-settings';
import type { AppState } from '@/stores/app-store-types';

export const initialAppState: AppState = {
  storiesMetadata: [],
  sceneRecordsByStory: {},
  sceneRecordHydration: {},
  currentStoryId: null,
  playbackState: null,
  playbackGeneration: 0,
  settings: defaultUserSettings,
  aiBridgeSettings: { url: '', token: '', disabled: false, preferredProvider: 'openai' },
  saveSlots: [],
  audioLibraries: {},
  characterLibraries: {},
  language: 'en',
  mediaLibrary: [],
  imageAssetIdsByStory: {},
  mediaAssetIdsByStory: {},
  endingsReachedByStory: {},
  readerBlockingMedia: null,
  isLoaded: false,
  migrationError: null,
};
