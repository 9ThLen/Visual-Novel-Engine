import { normalizeUserSettings } from '@/lib/user-settings';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStoreSet } from '@/stores/app-store-slices/types';

export type PreferencesSliceActions = Pick<
  AppActions,
  'clearMigrationError' | 'setLanguage' | 'updateSettings' | 'updateAiBridgeSettings'
>;

export function createPreferencesSlice(set: AppStoreSet): PreferencesSliceActions {
  return {
    clearMigrationError: () => set({ migrationError: null }),

    setLanguage: (lang) => set({ language: lang }),

    updateSettings: (partial) =>
      set((state) => ({ settings: normalizeUserSettings({ ...state.settings, ...partial }) })),

    updateAiBridgeSettings: (partial) =>
      set((state) => ({ aiBridgeSettings: { ...state.aiBridgeSettings, ...partial } })),
  };
}
