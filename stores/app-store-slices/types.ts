import type { AppStore } from '@/stores/app-store-types';

export type AppStoreSet = (
  partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>),
) => void;

export type AppStoreGet = () => AppStore;
