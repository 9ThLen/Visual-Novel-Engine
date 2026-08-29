/**
 * lib/story-home/asset-report.ts — one asset verdict for the project page.
 *
 * The state band's «assets» tile and the panel it opens must never disagree, so
 * they read the same report from the same inputs. Pure: the screen and the card
 * each pass what they already hold from the store.
 */

import {
  buildAssetUsageReport,
  buildAvailableAssets,
  collectAssetReferences,
  type AssetUsageReport,
} from '@/lib/asset-usage';
import { buildPlaybackAudioLibraryItems } from '@/lib/audio-library';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { getStoryImageAssets, type StoryImageAssetIds } from '@/lib/story-image-library';

export interface StoryAssetUsageInput {
  storyId: string;
  scenes: SceneRecord[];
  mediaLibrary: LibraryAsset[];
  imageAssetIdsByStory: StoryImageAssetIds;
  storyAudioLibrary: AudioLibraryItem[];
  characters: Character[];
}

export function buildStoryAssetUsageReport(input: StoryAssetUsageInput): AssetUsageReport {
  const playbackAudioLibrary = buildPlaybackAudioLibraryItems(input.storyAudioLibrary, input.mediaLibrary);
  const storyImageAssets = getStoryImageAssets(input.storyId, input.imageAssetIdsByStory, input.mediaLibrary);
  const availableAssets = buildAvailableAssets(storyImageAssets, playbackAudioLibrary, input.characters);
  return buildAssetUsageReport(collectAssetReferences(input.scenes), availableAssets);
}
