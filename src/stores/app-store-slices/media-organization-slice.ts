/**
 * The author's filing of the story's media: folders and tags.
 *
 * Every write goes through the pure model, which returns the same object when
 * there is nothing to do — a rename to the name it already has, a tag a file
 * already carries, a move into the folder it is already in. Comparing by
 * identity here is what keeps those no-ops from re-rendering the library.
 */

import {
  addTag,
  createFolder,
  deleteFolder,
  moveToFolder,
  organizationForStory,
  removeTag,
  renameFolder,
  type StoryMediaOrganization,
} from '@/lib/media-organization';
import type { AppActions } from '@/stores/app-store-types';
import type { AppStateSet } from '@/stores/app-store-slices/types';

export type MediaOrganizationSliceActions = Pick<
  AppActions,
  'createMediaFolder' | 'renameMediaFolder' | 'deleteMediaFolder'
  | 'moveMediaToFolder' | 'addMediaTag' | 'removeMediaTag'
>;

export function createMediaOrganizationSlice(set: AppStateSet): MediaOrganizationSliceActions {
  /** One shape for every write: read this story's filing, replace it, or don't. */
  const update = (
    storyId: string,
    change: (organization: StoryMediaOrganization) => StoryMediaOrganization,
  ) => set((state) => {
    const current = organizationForStory(state.mediaOrganizationByStory, storyId);
    const next = change(current);
    if (next === current) return {};
    return {
      mediaOrganizationByStory: { ...state.mediaOrganizationByStory, [storyId]: next },
    };
  });

  return {
    createMediaFolder: (storyId, name) => {
      // The id is minted here rather than in the model, so the model stays a
      // pure function of its inputs and the tests can name folders themselves.
      const id = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      let created = false;
      update(storyId, (organization) => {
        const next = createFolder(organization, name, id, Date.now());
        created = next !== organization;
        return next;
      });
      // Reported back so the caller can put files straight into it: on a phone
      // "new folder" is reached from the move menu, and stopping there would
      // leave the author to find the folder again.
      return created ? id : null;
    },
    renameMediaFolder: (storyId, folderId, name) =>
      update(storyId, (organization) => renameFolder(organization, folderId, name)),
    deleteMediaFolder: (storyId, folderId) =>
      update(storyId, (organization) => deleteFolder(organization, folderId)),
    moveMediaToFolder: (storyId, keys, folderId) =>
      update(storyId, (organization) => moveToFolder(organization, keys, folderId)),
    addMediaTag: (storyId, keys, tag) =>
      update(storyId, (organization) => addTag(organization, keys, tag)),
    removeMediaTag: (storyId, keys, tag) =>
      update(storyId, (organization) => removeTag(organization, keys, tag)),
  };
}
