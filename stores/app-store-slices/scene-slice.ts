import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  createSceneReadSlice,
  type SceneReadSlice,
} from '@/stores/app-store-slices/scene-read-slice';
import {
  createSceneWriteSlice,
  type SceneWriteSlice,
} from '@/stores/app-store-slices/scene-write-slice';
import type { AppStateGet, AppStateSet } from '@/stores/app-store-slices/types';

/**
 * The studio's scene slice: reading and writing together.
 *
 * The two halves live in separate modules so a player build can take only the
 * read half. Everything else composes this and sees the slice it always saw.
 */
export type SceneSlice = SceneReadSlice & SceneWriteSlice;

export function createSceneSlice(
  set: AppStateSet,
  get: AppStateGet,
  storage = createPersistentStorage(),
): SceneSlice {
  return {
    ...createSceneReadSlice(set, get, storage),
    ...createSceneWriteSlice(set),
  };
}
