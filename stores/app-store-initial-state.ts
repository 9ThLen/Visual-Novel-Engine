import { defaultUserSettings } from '@/lib/user-settings';
import type { AppState } from '@/stores/app-store-types';

export const initialAppState: AppState = {
  storiesMetadata: [],
  sceneRecordsByStory: {},
  sceneRecordHydration: {},
  currentStoryId: null,
  playbackState: null,
  settings: defaultUserSettings,
  saveSlots: [],
  audioLibraries: {},
  characterLibraries: {},
  language: 'en',
  mediaLibrary: [],
  imageAssetIdsByStory: {},
  isLoaded: false,
  migrationError: null,
};
