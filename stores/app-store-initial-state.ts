import { defaultUserSettings } from '@/lib/user-settings';
import type { AppState } from '@/stores/app-store-types';

export const initialAppState: AppState = {
  storiesMetadata: [],
  sceneRecordsByStory: {},
  sceneRecordHydration: {},
  currentStoryId: null,
  playbackState: null,
  settings: defaultUserSettings,
  aiBridgeSettings: { url: '', token: '', disabled: false },
  saveSlots: [],
  audioLibraries: {},
  characterLibraries: {},
  language: 'en',
  mediaLibrary: [],
  imageAssetIdsByStory: {},
  endingsReachedByStory: {},
  isLoaded: false,
  migrationError: null,
};
