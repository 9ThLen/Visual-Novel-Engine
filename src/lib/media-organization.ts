/**
 * How an author files the story's media: folders and tags.
 *
 * The library already answers "which kind", "whose" and "used or not" — every
 * one of those derived from something the story already knows. None of them
 * answers "which of these forty backgrounds belong to chapter two", because
 * nothing in a scene records that. That answer is the author's, so it is the
 * one thing here that is stored rather than derived.
 *
 * Two shapes, because they are two questions:
 *
 * - A **folder** is where a file lives. One file, one folder, or none — the
 *   same promise a folder makes anywhere else. Flat on purpose: a tree buys
 *   breadcrumbs, cycle checks and a move dialog, and a story's media is not
 *   deep enough to need any of it.
 * - A **tag** cuts across folders. A background can be «ніч» and «дощ» and
 *   still live in «Депо».
 *
 * Files are named by the gallery's own key (`asset:<id>` or `sprite-uri:<uri>`)
 * so nothing here needs a second identity scheme. Keys of files the story no
 * longer holds are dropped rather than kept: an entry pointing at nothing is
 * how a filing system starts lying about its counts.
 */

/** The least a file has to be for this module to file it. */
export interface OrganizableMedia {
  key: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface StoryMediaOrganization {
  /** Oldest first, which is the order the rail lists them in. */
  folders: MediaFolder[];
  /** Media key → folder id. A key that is absent is simply unfiled. */
  folderByKey: Record<string, string>;
  /** Media key → its tags, as typed, de-duplicated case-insensitively. */
  tagsByKey: Record<string, string[]>;
}

export type MediaOrganizationByStory = Record<string, StoryMediaOrganization>;

export const EMPTY_MEDIA_ORGANIZATION: StoryMediaOrganization = {
  folders: [],
  folderByKey: {},
  tagsByKey: {},
};

/** Long enough to name a chapter, short enough to stay on a rail row. */
export const MAX_FOLDER_NAME_LENGTH = 40;
export const MAX_TAG_LENGTH = 24;
/** Enough to file a story; past this the rail stops being a rail. */
export const MAX_FOLDERS_PER_STORY = 40;
export const MAX_TAGS_PER_FILE = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Collapse the whitespace a paste brings along, then cap it. */
function cleanLabel(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeFolderName(name: string): string {
  return cleanLabel(name, MAX_FOLDER_NAME_LENGTH);
}

export function normalizeTag(tag: string): string {
  return cleanLabel(tag, MAX_TAG_LENGTH);
}

/**
 * Two labels that differ only in case are one label; the first spelling wins.
 * Used for both tags and folder names — «Ніч» and «ніч» are the same shelf.
 */
export function sameLabel(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function sortTags(tags: string[]): string[] {
  return [...tags].sort((left, right) => left.localeCompare(right));
}

/**
 * Read whatever storage held, and hand back something every caller can use.
 *
 * Persisted state from an older version has no organization at all, and a
 * hand-edited backup can have anything; both arrive here as an empty filing
 * system rather than as a crash.
 */
export function normalizeMediaOrganizations(value: unknown): MediaOrganizationByStory {
  if (!isRecord(value)) return {};
  const result: MediaOrganizationByStory = {};

  for (const [storyId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;

    const folders: MediaFolder[] = Array.isArray(raw.folders)
      ? raw.folders.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) return [];
        const name = normalizeFolderName(typeof entry.name === 'string' ? entry.name : '');
        if (!name) return [];
        return [{
          id: entry.id,
          name,
          createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
        }];
      })
      : [];
    const folderIds = new Set(folders.map((folder) => folder.id));

    const folderByKey: Record<string, string> = {};
    if (isRecord(raw.folderByKey)) {
      for (const [key, folderId] of Object.entries(raw.folderByKey)) {
        // A file filed into a folder that is gone is unfiled, not lost.
        if (typeof folderId === 'string' && folderIds.has(folderId)) folderByKey[key] = folderId;
      }
    }

    const tagsByKey: Record<string, string[]> = {};
    if (isRecord(raw.tagsByKey)) {
      for (const [key, tags] of Object.entries(raw.tagsByKey)) {
        if (!Array.isArray(tags)) continue;
        const kept: string[] = [];
        for (const tag of tags) {
          if (typeof tag !== 'string') continue;
          const normalized = normalizeTag(tag);
          if (!normalized) continue;
          if (kept.some((existing) => sameLabel(existing, normalized))) continue;
          kept.push(normalized);
          if (kept.length >= MAX_TAGS_PER_FILE) break;
        }
        if (kept.length) tagsByKey[key] = sortTags(kept);
      }
    }

    result[storyId] = { folders, folderByKey, tagsByKey };
  }

  return result;
}

export function organizationForStory(
  all: MediaOrganizationByStory | undefined,
  storyId: string,
): StoryMediaOrganization {
  return all?.[storyId] ?? EMPTY_MEDIA_ORGANIZATION;
}

/**
 * A new folder, or the same filing system when the name is blank, taken, or
 * there are already more folders than a rail can show.
 *
 * Returning the input unchanged is how every write here reports "nothing to
 * do", so the store can skip the state update entirely.
 */
export function createFolder(
  organization: StoryMediaOrganization,
  name: string,
  id: string,
  now: number,
): StoryMediaOrganization {
  const cleaned = normalizeFolderName(name);
  if (!cleaned || organization.folders.length >= MAX_FOLDERS_PER_STORY) return organization;
  if (organization.folders.some((folder) => sameLabel(folder.name, cleaned))) return organization;

  return {
    ...organization,
    folders: [...organization.folders, { id, name: cleaned, createdAt: now }],
  };
}

export function renameFolder(
  organization: StoryMediaOrganization,
  folderId: string,
  name: string,
): StoryMediaOrganization {
  const cleaned = normalizeFolderName(name);
  if (!cleaned) return organization;
  const target = organization.folders.find((folder) => folder.id === folderId);
  if (!target || target.name === cleaned) return organization;
  if (organization.folders.some((folder) => folder.id !== folderId && sameLabel(folder.name, cleaned))) {
    return organization;
  }

  return {
    ...organization,
    folders: organization.folders.map((folder) => (folder.id === folderId
      ? { ...folder, name: cleaned }
      : folder)),
  };
}

/**
 * Delete the folder, not what was in it. Losing a background because its
 * folder went away would make filing a risk rather than a convenience.
 */
export function deleteFolder(
  organization: StoryMediaOrganization,
  folderId: string,
): StoryMediaOrganization {
  if (!organization.folders.some((folder) => folder.id === folderId)) return organization;

  const folderByKey: Record<string, string> = {};
  for (const [key, id] of Object.entries(organization.folderByKey)) {
    if (id !== folderId) folderByKey[key] = id;
  }

  return {
    ...organization,
    folders: organization.folders.filter((folder) => folder.id !== folderId),
    folderByKey,
  };
}

/** `null` files nothing: it takes the keys out of whatever folder they were in. */
export function moveToFolder(
  organization: StoryMediaOrganization,
  keys: readonly string[],
  folderId: string | null,
): StoryMediaOrganization {
  if (!keys.length) return organization;
  if (folderId !== null && !organization.folders.some((folder) => folder.id === folderId)) {
    return organization;
  }

  const folderByKey = { ...organization.folderByKey };
  let changed = false;
  for (const key of keys) {
    const current = folderByKey[key];
    if (folderId === null) {
      if (current === undefined) continue;
      delete folderByKey[key];
    } else {
      if (current === folderId) continue;
      folderByKey[key] = folderId;
    }
    changed = true;
  }

  return changed ? { ...organization, folderByKey } : organization;
}

export function addTag(
  organization: StoryMediaOrganization,
  keys: readonly string[],
  tag: string,
): StoryMediaOrganization {
  const cleaned = normalizeTag(tag);
  if (!cleaned || !keys.length) return organization;

  const tagsByKey = { ...organization.tagsByKey };
  let changed = false;
  for (const key of keys) {
    const current = tagsByKey[key] ?? [];
    if (current.some((existing) => sameLabel(existing, cleaned))) continue;
    // A file with a dozen tags has none: the row stops being readable long
    // before the list stops being valid.
    if (current.length >= MAX_TAGS_PER_FILE) continue;
    tagsByKey[key] = sortTags([...current, cleaned]);
    changed = true;
  }

  return changed ? { ...organization, tagsByKey } : organization;
}

export function removeTag(
  organization: StoryMediaOrganization,
  keys: readonly string[],
  tag: string,
): StoryMediaOrganization {
  const cleaned = normalizeTag(tag);
  if (!cleaned || !keys.length) return organization;

  const tagsByKey = { ...organization.tagsByKey };
  let changed = false;
  for (const key of keys) {
    const current = tagsByKey[key];
    if (!current) continue;
    const kept = current.filter((existing) => !sameLabel(existing, cleaned));
    if (kept.length === current.length) continue;
    if (kept.length) tagsByKey[key] = kept;
    else delete tagsByKey[key];
    changed = true;
  }

  return changed ? { ...organization, tagsByKey } : organization;
}

/**
 * Forget these files, because the story no longer holds them.
 *
 * A folder entry pointing at a removed background is invisible until the same
 * asset id comes back — and then it files a different picture into a folder
 * nobody chose.
 */
export function forgetMedia(
  organization: StoryMediaOrganization,
  keys: readonly string[],
): StoryMediaOrganization {
  const folderByKey = { ...organization.folderByKey };
  const tagsByKey = { ...organization.tagsByKey };
  let changed = false;
  for (const key of keys) {
    if (key in folderByKey) { delete folderByKey[key]; changed = true; }
    if (key in tagsByKey) { delete tagsByKey[key]; changed = true; }
  }
  return changed ? { ...organization, folderByKey, tagsByKey } : organization;
}

/**
 * Forget files the story no longer holds.
 *
 * Called with the keys that remain rather than the ones that went: removals
 * arrive from several places (the inspector, the batch bar, a scene edit that
 * drops the last reference), and the set that is still there is the one the
 * screen can always name.
 */
export function forgetMissingMedia(
  organization: StoryMediaOrganization,
  presentKeys: Iterable<string>,
): StoryMediaOrganization {
  const present = presentKeys instanceof Set ? presentKeys : new Set(presentKeys);

  const folderByKey: Record<string, string> = {};
  for (const [key, folderId] of Object.entries(organization.folderByKey)) {
    if (present.has(key)) folderByKey[key] = folderId;
  }
  const tagsByKey: Record<string, string[]> = {};
  for (const [key, tags] of Object.entries(organization.tagsByKey)) {
    if (present.has(key)) tagsByKey[key] = tags;
  }

  const sameFolders = Object.keys(folderByKey).length === Object.keys(organization.folderByKey).length;
  const sameTags = Object.keys(tagsByKey).length === Object.keys(organization.tagsByKey).length;
  return sameFolders && sameTags ? organization : { ...organization, folderByKey, tagsByKey };
}

export function tagsForMedia(
  organization: StoryMediaOrganization,
  key: string,
): string[] {
  return organization.tagsByKey[key] ?? [];
}

export function folderForMedia(
  organization: StoryMediaOrganization,
  key: string,
): MediaFolder | null {
  const folderId = organization.folderByKey[key];
  return organization.folders.find((folder) => folder.id === folderId) ?? null;
}

export interface OrganizationSummary {
  folders: { id: string; name: string; count: number }[];
  /** How many of the given files are in no folder at all. */
  unfiled: number;
  /** Every tag any of the given files carries, alphabetically. */
  tags: { tag: string; count: number }[];
}

/**
 * The counts the rail shows, over the files it is actually showing.
 *
 * Counting the whole story instead would put a 12 next to a folder that has
 * one clip in the open view, which reads as a filter that does not work.
 */
export function summarizeOrganization(
  items: readonly OrganizableMedia[],
  organization: StoryMediaOrganization,
): OrganizationSummary {
  const perFolder = new Map<string, number>();
  const perTag = new Map<string, { tag: string; count: number }>();
  let unfiled = 0;

  for (const item of items) {
    const folderId = organization.folderByKey[item.key];
    if (folderId) perFolder.set(folderId, (perFolder.get(folderId) ?? 0) + 1);
    else unfiled += 1;

    for (const tag of organization.tagsByKey[item.key] ?? []) {
      const existing = perTag.get(tag.toLocaleLowerCase());
      if (existing) existing.count += 1;
      else perTag.set(tag.toLocaleLowerCase(), { tag, count: 1 });
    }
  }

  return {
    // Every folder is listed, including the empty ones: a folder you cannot
    // see is a folder you cannot file into.
    folders: organization.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      count: perFolder.get(folder.id) ?? 0,
    })),
    unfiled,
    tags: [...perTag.values()].sort((left, right) => left.tag.localeCompare(right.tag)),
  };
}

export type OrganizationFilter =
  | { kind: 'folder'; folderId: string }
  | { kind: 'unfiled' }
  | { kind: 'tag'; tag: string };

export function matchesOrganizationFilter(
  key: string,
  filter: OrganizationFilter,
  organization: StoryMediaOrganization,
): boolean {
  if (filter.kind === 'folder') return organization.folderByKey[key] === filter.folderId;
  if (filter.kind === 'unfiled') return organization.folderByKey[key] === undefined;
  return (organization.tagsByKey[key] ?? []).some((tag) => sameLabel(tag, filter.tag));
}
