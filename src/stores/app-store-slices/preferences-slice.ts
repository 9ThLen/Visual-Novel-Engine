import { normalizeUserSettings } from '@/lib/user-settings';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStateSet } from '@/stores/app-store-slices/types';

export type PreferencesSliceActions = Pick<
  AppActions,
  'clearMigrationError' | 'setLanguage' | 'updateSettings' | 'updateAiBridgeSettings'
>;

export function createPreferencesSlice(set: AppStateSet): PreferencesSliceActions {
  return {
    clearMigrationError: () => set({ migrationError: null }),

    setLanguage: (lang) => set({ language: lang }),

    updateSettings: (partial) =>
      set((state) => ({ settings: normalizeUserSettings({ ...state.settings, ...partial }) })),

    updateAiBridgeSettings: (partial) =>
      set((state) => {
        const aiBridgeSettings = { ...state.aiBridgeSettings, ...partial };
        const provider = aiBridgeSettings.preferredProvider ?? 'openai';
        return {
          aiBridgeSettings: {
            ...aiBridgeSettings,
            profiles: {
              ...aiBridgeSettings.profiles,
              [provider]: {
                url: aiBridgeSettings.url,
                token: aiBridgeSettings.token,
                ...(aiBridgeSettings.requestedModel ? { requestedModel: aiBridgeSettings.requestedModel } : {}),
                ...(aiBridgeSettings.requestedTokenBudget ? { requestedTokenBudget: aiBridgeSettings.requestedTokenBudget } : {}),
              },
            },
          },
        };
      }),
  };
}
