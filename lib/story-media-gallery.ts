/**
 * Display model for the story media library.
 *
 * Backgrounds and sprites live in two unrelated places — `LibraryAsset` in the
 * media library, `CharacterSprite` inside `characterLibraries` — and the same
 * file is routinely present in both. This module folds them into one list where
 * a file appears exactly once and character ownership is an attribute of it
 * rather than a separate entry, which is what lets a single grid answer both
 * "what images does this story have" and "show me everything Alice wears".
 *
 * Nothing here is persisted: every value is derived from state the store
 * already holds.
 */

import {
  buildAssetUsageReport,
  buildAvailableAssets,
  collectAssetReferences,
  toSpriteUsageAssetId,
  type AssetUsageKind,
} from '@/lib/asset-usage';
import {
  categoryOfAudioItem,
  guessAudioCategoryFromName,
  type AudioCategory,
} from '@/lib/audio-category';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character, CharacterSprite } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { getStoryGalleryImageAssets, type StoryImageAssetIds } from '@/lib/story-image-library';
import type { StoryMediaAssetIds } from '@/lib/story-media-library';

export type MediaKind = 'image' | 'video' | 'audio';

/** Re-exported: the library shows audio in these two categories. */
export type { AudioCategory };

export interface MediaOwner {
  characterId: string;
  characterName: string;
  color?: string;
  spriteId: string;
  spriteName: string;
  isDefaultSprite: boolean;
  /** Composite reference key used by the timeline: `${characterId}:${spriteId}`. */
  usageAssetId: string;
  /**
   * References to this sprite alone, not to the file.
   *
   * Detaching a sprite dangles only the references that name it, so the same
   * file can be detachable from one character and pinned by another.
   */
  usage: MediaUsage;
}

export interface MediaReference {
  sceneId: string;
  sceneName: string;
  stepId: string;
  kind: AssetUsageKind;
  enabled: boolean;
}

export interface MediaUsage {
  enabled: number;
  disabled: number;
}

export interface StoryMediaItem {
  /** `asset:<id>` when the file is in the media library, else `sprite-uri:<uri>`. */
  key: string;
  kind: MediaKind;
  /** Canonical URI for storage and actions. Display goes through resolveAssetUri. */
  uri: string;
  name: string;
  addedAt: number;
  /** Absent for a sprite whose file never entered the media library. */
  assetId?: string;
  owners: MediaOwner[];
  usage: MediaUsage;
  references: MediaReference[];
  sizeBytes?: number;
  durationSeconds?: number;
  mimeType?: string;
  /** Only for `kind === 'audio'`. See `audioCategoryOf`. */
  audioCategory?: AudioCategory;
  /**
   * Only for `kind === 'audio'`, and only when the story's audio library has an
   * entry for the file. Undefined means nobody has said either way — which is
   * not the same as "does not loop", so the row shows nothing rather than
   * claiming a default.
   */
  audioLoop?: boolean;
}

export interface CharacterMediaFilter {
  characterId: string;
  name: string;
  color?: string;
  /** Sprite preview for the filter chip; absent means fall back to initials. */
  avatarUri?: string;
  count: number;
}

export interface StoryMediaGallery {
  images: StoryMediaItem[];
  videos: StoryMediaItem[];
  audios: StoryMediaItem[];
  characterFilters: CharacterMediaFilter[];
  counts: { images: number; videos: number; audios: number; used: number; unused: number };
}

export interface StoryMediaGalleryInput {
  storyId: string;
  mediaLibrary: LibraryAsset[];
  imageAssetIdsByStory: StoryImageAssetIds;
  mediaAssetIdsByStory: StoryMediaAssetIds;
  characters: Character[];
  scenes: SceneRecord[];
  /**
   * This story's audio library, when it has one. Only a source of metadata:
   * the list of audio files is `mediaAssetIdsByStory`, exactly as for video.
   * `buildPlaybackAudioLibraryItems` cannot stand in for it — it walks the
   * whole media library and so returns other stories' audio too.
   */
  audioLibrary?: AudioLibraryItem[];
}

/**
 * `assetUri` holds the persistent URI while `uri` may carry a runtime `blob:`
 * from the web editor. Everything that has to survive a reload uses this one.
 */
function canonicalSpriteUri(sprite: CharacterSprite): string {
  return sprite.assetUri ?? sprite.uri;
}

/**
 * Resolve a sprite to the library asset holding the same file.
 *
 * The order is fixed and the first hit wins: `sprite.uri` may legitimately hold
 * an asset id rather than a URI (see lib/ai/image-placement.ts), so a sprite can
 * match on four different spellings and two implementations that disagree about
 * precedence would produce different galleries for the same data.
 */
function findSpriteAsset(
  sprite: CharacterSprite,
  assetById: Map<string, LibraryAsset>,
  assetByUri: Map<string, LibraryAsset>,
): LibraryAsset | undefined {
  const { assetUri, uri } = sprite;
  return (assetUri ? assetById.get(assetUri) ?? assetByUri.get(assetUri) : undefined)
    ?? assetById.get(uri)
    ?? assetByUri.get(uri);
}

function isDefaultSprite(character: Character, sprite: CharacterSprite): boolean {
  return character.defaultSpriteId
    ? character.defaultSpriteId === sprite.id
    : character.sprites[0]?.id === sprite.id;
}

/**
 * Which of the two categories an audio file belongs to, most reliable source
 * first.
 *
 * The story's audio library is the author's own answer, so it wins. Failing
 * that, the scenes say how the file is actually played: anything a `music`
 * block names is music, whatever else it is also used for. The file name is
 * consulted last and only for files nothing plays: the name heuristic reads a
 * handful of words and calls everything else a sound effect, which is a guess,
 * not a fact.
 */
export function findAudioLibraryEntry(
  item: StoryMediaItem,
  audioLibrary: AudioLibraryItem[] | undefined,
): AudioLibraryItem | undefined {
  return audioLibrary?.find(
    (candidate) => candidate.id === item.assetId || candidate.uri === item.uri,
  );
}

export function audioCategoryOf(
  item: StoryMediaItem,
  audioLibrary: AudioLibraryItem[] | undefined,
): AudioCategory {
  const entry = findAudioLibraryEntry(item, audioLibrary);
  if (entry) return categoryOfAudioItem(entry);
  if (item.references.some((reference) => reference.kind === 'music')) return 'music';
  if (item.references.some((reference) => reference.kind === 'sound')) return 'sound';
  return guessAudioCategoryFromName(item.name);
}

function countUsage(references: MediaReference[] | undefined): MediaUsage {
  const usage: MediaUsage = { enabled: 0, disabled: 0 };
  for (const reference of references ?? []) {
    if (reference.enabled) usage.enabled += 1;
    else usage.disabled += 1;
  }
  return usage;
}

function referenceKey(reference: MediaReference): string {
  return `${reference.sceneId}:${reference.stepId}:${reference.kind}`;
}

export function buildStoryMediaGallery(input: StoryMediaGalleryInput): StoryMediaGallery {
  const {
    storyId,
    mediaLibrary,
    imageAssetIdsByStory,
    mediaAssetIdsByStory,
    characters,
    scenes,
    audioLibrary,
  } = input;

  const imageAssets = getStoryGalleryImageAssets(storyId, imageAssetIdsByStory, mediaLibrary, scenes);
  const storyMediaIds = new Set(mediaAssetIdsByStory[storyId] ?? []);
  const videoAssets = mediaLibrary.filter((asset) => asset.type === 'video' && storyMediaIds.has(asset.id));
  const audioAssets = mediaLibrary.filter((asset) => asset.type === 'audio' && storyMediaIds.has(asset.id));

  const sceneNameById = new Map(scenes.map((scene) => [scene.id, scene.name]));
  const report = buildAssetUsageReport(
    collectAssetReferences(scenes),
    // Handing the report this story's audio is what makes `music` and `sound`
    // references resolve: without it every one of them counts as broken, and
    // every track reads as unused.
    buildAvailableAssets(
      [...imageAssets, ...videoAssets],
      audioAssets.map<AudioLibraryItem>((asset) => ({
        id: asset.id,
        name: asset.name,
        uri: asset.uri,
        type: audioLibrary?.find((entry) => entry.id === asset.id)?.type
          ?? (guessAudioCategoryFromName(asset.name) === 'music' ? 'music' : 'sfx'),
        createdAt: asset.addedAt,
      })),
      characters,
    ),
  );
  const referencesByUsageId = new Map(report.assets.map(({ asset, references }) => [
    asset.id,
    references.map<MediaReference>((reference) => ({
      sceneId: reference.sceneId,
      sceneName: sceneNameById.get(reference.sceneId) ?? reference.sceneId,
      stepId: reference.stepId,
      kind: reference.kind,
      enabled: reference.enabled,
    })),
  ]));

  const assetById = new Map(mediaLibrary.map((asset) => [asset.id, asset]));
  const assetByUri = new Map(mediaLibrary.map((asset) => [asset.uri, asset]));

  const itemsByKey = new Map<string, StoryMediaItem>();
  const usageIdsByKey = new Map<string, Set<string>>();

  const startItem = (item: StoryMediaItem, usageId?: string) => {
    itemsByKey.set(item.key, item);
    usageIdsByKey.set(item.key, new Set(usageId ? [usageId] : []));
  };

  const fromAsset = (asset: LibraryAsset, kind: MediaKind): StoryMediaItem => ({
    key: `asset:${asset.id}`,
    kind,
    uri: asset.uri,
    name: asset.name,
    addedAt: asset.addedAt,
    assetId: asset.id,
    owners: [],
    usage: { enabled: 0, disabled: 0 },
    references: [],
    sizeBytes: asset.size,
    durationSeconds: asset.durationSeconds,
    mimeType: asset.mimeType,
  });

  for (const asset of imageAssets) startItem(fromAsset(asset, 'image'), asset.id);
  for (const asset of videoAssets) startItem(fromAsset(asset, 'video'), asset.id);
  for (const asset of audioAssets) startItem(fromAsset(asset, 'audio'), asset.id);

  for (const character of characters) {
    for (const sprite of character.sprites) {
      const uri = canonicalSpriteUri(sprite);
      const asset = findSpriteAsset(sprite, assetById, assetByUri);
      const key = asset ? `asset:${asset.id}` : `sprite-uri:${uri}`;
      const owner: MediaOwner = {
        characterId: character.id,
        characterName: character.name,
        color: character.color,
        spriteId: sprite.id,
        spriteName: sprite.name,
        isDefaultSprite: isDefaultSprite(character, sprite),
        usageAssetId: toSpriteUsageAssetId(character.id, sprite.id),
        usage: countUsage(referencesByUsageId.get(toSpriteUsageAssetId(character.id, sprite.id))),
      };

      let item = itemsByKey.get(key);
      if (!item) {
        if (asset) {
          // The file is in the media library but not in this story's image
          // membership — the sprite is what brings it in. Build the tile from
          // the asset so it keeps its id, name and size; taking the sprite's
          // fields here would produce a tile keyed as an asset that has no
          // assetId, and every action gated on `assetId` would silently vanish.
          item = fromAsset(asset, asset.type === 'video' ? 'video' : 'image');
          startItem(item, asset.id);
        } else {
          // A sprite whose file never entered the media library: it still
          // belongs in the grid, but it has no assetId, so it cannot be removed
          // from the story as a file — only through its character.
          item = {
            key,
            kind: 'image',
            uri,
            name: sprite.name,
            addedAt: sprite.createdAt,
            owners: [],
            usage: { enabled: 0, disabled: 0 },
            references: [],
          };
          startItem(item);
        }
      }
      item.owners.push(owner);
      usageIdsByKey.get(key)?.add(owner.usageAssetId);
    }
  }

  for (const item of itemsByKey.values()) {
    const seen = new Set<string>();
    for (const usageId of usageIdsByKey.get(item.key) ?? []) {
      for (const reference of referencesByUsageId.get(usageId) ?? []) {
        const dedupeKey = referenceKey(reference);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        item.references.push(reference);
        if (reference.enabled) item.usage.enabled += 1;
        else item.usage.disabled += 1;
      }
    }
  }

  const byNewestFirst = (a: StoryMediaItem, b: StoryMediaItem) => b.addedAt - a.addedAt;
  const all = [...itemsByKey.values()];
  const images = all.filter((item) => item.kind === 'image').sort(byNewestFirst);
  const videos = all.filter((item) => item.kind === 'video').sort(byNewestFirst);
  const audios = all.filter((item) => item.kind === 'audio').sort(byNewestFirst);

  // After the references are attached: the category reads them.
  for (const item of audios) {
    item.audioCategory = audioCategoryOf(item, audioLibrary);
    item.audioLoop = findAudioLibraryEntry(item, audioLibrary)?.loop;
  }

  const ownedCounts = new Map<string, number>();
  const avatarByCharacter = new Map<string, string>();
  for (const item of images) {
    for (const owner of item.owners) {
      ownedCounts.set(owner.characterId, (ownedCounts.get(owner.characterId) ?? 0) + 1);
      if (owner.isDefaultSprite || !avatarByCharacter.has(owner.characterId)) {
        avatarByCharacter.set(owner.characterId, item.uri);
      }
    }
  }

  // Characters with no sprites are listed too, at zero: picking one and then
  // adding an image is how the author gives them their first sprite.
  const characterFilters = characters.map<CharacterMediaFilter>((character) => ({
    characterId: character.id,
    name: character.name,
    color: character.color,
    avatarUri: avatarByCharacter.get(character.id),
    count: ownedCounts.get(character.id) ?? 0,
  }));

  const isUsed = (item: StoryMediaItem) => item.usage.enabled + item.usage.disabled > 0;
  return {
    images,
    videos,
    audios,
    characterFilters,
    counts: {
      images: images.length,
      videos: videos.length,
      audios: audios.length,
      used: all.filter(isUsed).length,
      unused: all.filter((item) => !isUsed(item)).length,
    },
  };
}

export type ImageFilter =
  | { kind: 'all' }
  | { kind: 'used' }
  | { kind: 'unused' }
  | { kind: 'character'; characterId: string }
  | { kind: 'audioCategory'; category: AudioCategory };

export type VideoFilter = 'all' | 'used' | 'unused';

export function isMediaItemUsed(item: StoryMediaItem): boolean {
  return item.usage.enabled + item.usage.disabled > 0;
}

/**
 * Whether the file can be taken out of the story.
 *
 * Membership is re-derived from scene references on every hydration
 * (see story-image-library / story-media-library), so removing a file that is
 * still referenced does not stick — it comes back on the next launch. Blocking
 * the action is the only honest state.
 */
export function canRemoveFromStory(item: StoryMediaItem): boolean {
  return Boolean(item.assetId) && item.owners.length === 0 && !isMediaItemUsed(item);
}

/**
 * Whether the sprite can be taken off its character.
 *
 * Only this sprite's own references matter: the file may well be a background
 * in ten scenes, and none of those would break. What breaks is a timeline step
 * naming `${characterId}:${spriteId}`, and unlike story membership there is no
 * migration that quietly restores the sprite, so a dangling reference stays
 * dangling.
 */
export function canDetachOwner(owner: MediaOwner): boolean {
  return owner.usage.enabled + owner.usage.disabled === 0;
}

/**
 * Whether the scenes in memory can answer "where is this used".
 *
 * Loading being over is not the same as the answer being complete. A reader
 * window leaves a handful of scenes in memory and the full load marks the story
 * hydrated even when storage returned nothing (see scene-slice), so a story of
 * ten scenes can sit there with one — and every reference in the other nine
 * silently reads as absent.
 *
 * The story's own scene count is the only independent check available, and it
 * is maintained as an exact count on every path that writes scenes. Anything
 * short of it means the picture is partial, whatever the loader reported.
 */
export function usageIsKnowable(
  scenesLoaded: boolean,
  scenes: SceneRecord[],
  story: { sceneCount: number } | undefined,
): boolean {
  return scenesLoaded && !!story && scenes.length === story.sceneCount;
}

/**
 * What the screen knows about where its files are used.
 *
 * `pending` is a load still running; `unavailable` is a load that finished
 * without an answer — rejected, or returning fewer scenes than the story
 * claims. Both forbid the destructive actions, but they are different things
 * to tell an author, and saying "checking…" forever would be the wrong one.
 */
export type UsageState = 'pending' | 'ready' | 'unavailable';

/**
 * Re-resolve one owner against a freshly supplied state.
 *
 * The grid is built from whatever scenes were in memory when it rendered, and
 * scene records arrive asynchronously: a sprite can look unreferenced simply
 * because the scene that shows it has not loaded yet. Detaching is the one
 * action with no way back — story membership is re-derived on every hydration,
 * a deleted sprite is not — so the write re-reads the store and asks again
 * rather than trusting the snapshot the button was rendered from.
 *
 * Returns undefined when the owner is gone entirely, which is also a refusal.
 */
export function findOwnerInGallery(
  input: StoryMediaGalleryInput,
  itemKey: string,
  usageAssetId: string,
): MediaOwner | undefined {
  const gallery = buildStoryMediaGallery(input);
  const item = [...gallery.images, ...gallery.videos, ...gallery.audios]
    .find((candidate) => candidate.key === itemKey);
  return item?.owners.find((owner) => owner.usageAssetId === usageAssetId);
}

function matchesQuery(item: StoryMediaItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (item.name.toLowerCase().includes(needle)) return true;
  return item.owners.some((owner) =>
    owner.characterName.toLowerCase().includes(needle)
    || owner.spriteName.toLowerCase().includes(needle));
}

export function filterMediaItems(
  items: StoryMediaItem[],
  filter: ImageFilter | VideoFilter,
  query = '',
): StoryMediaItem[] {
  const normalized: ImageFilter = typeof filter === 'string' ? { kind: filter } : filter;
  return items.filter((item) => {
    if (!matchesQuery(item, query)) return false;
    switch (normalized.kind) {
      case 'used': return isMediaItemUsed(item);
      case 'unused': return !isMediaItemUsed(item);
      case 'character': return item.owners.some((owner) => owner.characterId === normalized.characterId);
      case 'audioCategory': return item.audioCategory === normalized.category;
      default: return true;
    }
  });
}

export type DateGroupLabel = 'today' | 'thisWeek' | 'earlier';

export interface MediaDateGroup {
  label: DateGroupLabel;
  items: StoryMediaItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param now passed in rather than read from the clock so the boundaries are
 * testable and a re-render cannot silently reshuffle the grid.
 */
export function groupMediaByDate(items: StoryMediaItem[], now: number): MediaDateGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayAt = startOfToday.getTime();
  const weekAt = todayAt - 6 * DAY_MS;

  const groups: Record<DateGroupLabel, StoryMediaItem[]> = { today: [], thisWeek: [], earlier: [] };
  for (const item of items) {
    if (item.addedAt >= todayAt) groups.today.push(item);
    else if (item.addedAt >= weekAt) groups.thisWeek.push(item);
    else groups.earlier.push(item);
  }

  return (['today', 'thisWeek', 'earlier'] as DateGroupLabel[])
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, items: groups[label] }));
}
