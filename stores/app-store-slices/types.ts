import type { AppState, AppStore } from '@/stores/app-store-types';

/**
 * A slice writes state and nothing else, so `set` is described in terms of
 * `AppState` rather than the whole store. That is what lets the player build
 * compose a store with fewer actions (`stores/use-app-store.player.ts`) and
 * still pass its own `set` to these same factories: a narrower store's setter
 * accepts every state patch a wider one does.
 */
export type AppStateSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => void;

/** For slices that only read state back. See {@link AppStateSet}. */
export type AppStateGet = () => AppState;

/** For slices that call other actions through `get()` — snapshots, releases. */
export type AppStoreGet = () => AppStore;

