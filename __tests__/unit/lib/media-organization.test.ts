/**
 * Folders and tags: the only part of the media library the story cannot answer
 * for itself, and so the only part that is stored.
 *
 * The rules worth pinning down are the ones that decide whether filing is safe
 * to use: a folder that goes away must not take its files with it, a file that
 * leaves the story must not leave an entry behind, and nothing typed twice may
 * turn into two shelves.
 */
import {
  MAX_TAGS_PER_FILE,
  addTag,
  createFolder,
  deleteFolder,
  EMPTY_MEDIA_ORGANIZATION,
  folderForMedia,
  forgetMedia,
  matchesOrganizationFilter,
  moveToFolder,
  normalizeFolderName,
  normalizeMediaOrganizations,
  normalizeTag,
  removeTag,
  renameFolder,
  summarizeOrganization,
  tagsForMedia,
  type StoryMediaOrganization,
} from '@/lib/media-organization';

const NOW = 1_700_000_000_000;

function withFolder(name = 'Chapter two'): StoryMediaOrganization {
  return createFolder(EMPTY_MEDIA_ORGANIZATION, name, 'folder-1', NOW);
}

describe('naming', () => {
  it('collapses the whitespace a paste brings along', () => {
    expect(normalizeFolderName('  Chapter   two \n')).toBe('Chapter two');
    expect(normalizeTag('  night  rain ')).toBe('night rain');
  });

  it('caps a name rather than letting it run off the rail', () => {
    expect(normalizeFolderName('x'.repeat(80))).toHaveLength(40);
    expect(normalizeTag('x'.repeat(80))).toHaveLength(24);
  });
});

describe('folders', () => {
  it('creates one, and refuses a name that is already a folder', () => {
    const organization = withFolder();
    expect(organization.folders).toEqual([{ id: 'folder-1', name: 'Chapter two', createdAt: NOW }]);

    // Case is not a difference: «Ніч» and «ніч» are one shelf.
    const again = createFolder(organization, 'chapter TWO', 'folder-2', NOW);
    expect(again).toBe(organization);
    expect(createFolder(organization, '   ', 'folder-3', NOW)).toBe(organization);
  });

  it('renames one, and leaves it alone when the name is taken or unchanged', () => {
    const two = createFolder(withFolder(), 'Menu art', 'folder-2', NOW);

    expect(renameFolder(two, 'folder-2', 'Title art').folders[1].name).toBe('Title art');
    expect(renameFolder(two, 'folder-2', 'Chapter two')).toBe(two);
    expect(renameFolder(two, 'folder-2', 'Menu art')).toBe(two);
    expect(renameFolder(two, 'nope', 'Anything')).toBe(two);
  });

  // Deleting a folder is not deleting art. If it were, filing would be a risk
  // rather than a convenience, and nobody would file anything.
  it('takes the folder away and leaves what was in it', () => {
    const filed = moveToFolder(withFolder(), ['asset:a', 'asset:b'], 'folder-1');
    const after = deleteFolder(filed, 'folder-1');

    expect(after.folders).toEqual([]);
    expect(after.folderByKey).toEqual({});
    expect(deleteFolder(after, 'folder-1')).toBe(after);
  });

  it('moves files in and back out again', () => {
    const filed = moveToFolder(withFolder(), ['asset:a'], 'folder-1');
    expect(folderForMedia(filed, 'asset:a')?.name).toBe('Chapter two');

    const unfiled = moveToFolder(filed, ['asset:a'], null);
    expect(folderForMedia(unfiled, 'asset:a')).toBeNull();
    // Already where it was asked to go: nothing to write.
    expect(moveToFolder(unfiled, ['asset:a'], null)).toBe(unfiled);
    expect(moveToFolder(filed, ['asset:a'], 'nope')).toBe(filed);
  });
});

describe('tags', () => {
  it('adds one to several files at once, alphabetically and without repeats', () => {
    const tagged = addTag(addTag(EMPTY_MEDIA_ORGANIZATION, ['asset:a', 'asset:b'], 'rain'), ['asset:a'], 'night');

    expect(tagsForMedia(tagged, 'asset:a')).toEqual(['night', 'rain']);
    expect(tagsForMedia(tagged, 'asset:b')).toEqual(['rain']);
    expect(addTag(tagged, ['asset:a'], 'RAIN')).toBe(tagged);
    expect(addTag(tagged, ['asset:a'], '  ')).toBe(tagged);
  });

  // A file with a dozen tags has none: the row stops being readable long before
  // the list stops being valid.
  it('stops at the limit rather than growing without end', () => {
    let organization = EMPTY_MEDIA_ORGANIZATION;
    for (let index = 0; index < MAX_TAGS_PER_FILE + 3; index += 1) {
      organization = addTag(organization, ['asset:a'], `tag-${index}`);
    }
    expect(tagsForMedia(organization, 'asset:a')).toHaveLength(MAX_TAGS_PER_FILE);
  });

  it('removes one, and drops the entry when the last tag goes', () => {
    const tagged = addTag(EMPTY_MEDIA_ORGANIZATION, ['asset:a'], 'night');

    const removed = removeTag(tagged, ['asset:a'], 'NIGHT');
    expect(removed.tagsByKey).toEqual({});
    expect(removeTag(removed, ['asset:a'], 'night')).toBe(removed);
  });
});

describe('files that leave the story', () => {
  // An entry pointing at nothing is invisible until the same asset id comes
  // back — and then it files a different picture into a folder nobody chose.
  it('forgets the folder and the tags of a removed file', () => {
    const organization = addTag(
      moveToFolder(withFolder(), ['asset:a', 'asset:b'], 'folder-1'),
      ['asset:a'],
      'night',
    );

    const after = forgetMedia(organization, ['asset:a']);
    expect(after.folderByKey).toEqual({ 'asset:b': 'folder-1' });
    expect(after.tagsByKey).toEqual({});
    expect(forgetMedia(after, ['asset:a'])).toBe(after);
  });
});

describe('what the rail shows', () => {
  it('counts over the files on screen, and keeps empty folders listed', () => {
    const organization = addTag(
      moveToFolder(createFolder(withFolder(), 'Menu art', 'folder-2', NOW), ['asset:a'], 'folder-1'),
      ['asset:a', 'asset:b'],
      'night',
    );

    const summary = summarizeOrganization([{ key: 'asset:a' }, { key: 'asset:b' }], organization);

    expect(summary.folders).toEqual([
      { id: 'folder-1', name: 'Chapter two', count: 1 },
      // Listed with nothing in it: a folder you cannot see is one you cannot
      // file into.
      { id: 'folder-2', name: 'Menu art', count: 0 },
    ]);
    expect(summary.unfiled).toBe(1);
    expect(summary.tags).toEqual([{ tag: 'night', count: 2 }]);
  });

  it('filters by folder, by nothing-in-a-folder, and by tag', () => {
    const organization = addTag(
      moveToFolder(withFolder(), ['asset:a'], 'folder-1'),
      ['asset:b'],
      'night',
    );

    expect(matchesOrganizationFilter('asset:a', { kind: 'folder', folderId: 'folder-1' }, organization)).toBe(true);
    expect(matchesOrganizationFilter('asset:b', { kind: 'folder', folderId: 'folder-1' }, organization)).toBe(false);
    expect(matchesOrganizationFilter('asset:b', { kind: 'unfiled' }, organization)).toBe(true);
    expect(matchesOrganizationFilter('asset:b', { kind: 'tag', tag: 'NIGHT' }, organization)).toBe(true);
    expect(matchesOrganizationFilter('asset:a', { kind: 'tag', tag: 'night' }, organization)).toBe(false);
  });
});

describe('reading what storage held', () => {
  it('turns anything at all into a filing system rather than a crash', () => {
    expect(normalizeMediaOrganizations(undefined)).toEqual({});
    expect(normalizeMediaOrganizations('nope')).toEqual({});
    expect(normalizeMediaOrganizations({ 'story-1': 7 })).toEqual({});
  });

  it('drops a file filed into a folder that is gone', () => {
    const normalized = normalizeMediaOrganizations({
      'story-1': {
        folders: [{ id: 'folder-1', name: 'Chapter two', createdAt: NOW }],
        folderByKey: { 'asset:a': 'folder-1', 'asset:b': 'folder-vanished' },
        tagsByKey: { 'asset:a': ['night', 'NIGHT', '', 42] },
      },
    });

    expect(normalized['story-1'].folderByKey).toEqual({ 'asset:a': 'folder-1' });
    // One tag, whichever spelling arrived first, and nothing that was not text.
    expect(normalized['story-1'].tagsByKey).toEqual({ 'asset:a': ['night'] });
  });

  it('drops a folder with no usable name or id', () => {
    const normalized = normalizeMediaOrganizations({
      'story-1': {
        folders: [{ id: '', name: 'Nameless' }, { id: 'folder-2', name: '   ' }, { id: 'folder-3', name: 'Kept' }],
        folderByKey: {},
        tagsByKey: {},
      },
    });

    expect(normalized['story-1'].folders).toEqual([{ id: 'folder-3', name: 'Kept', createdAt: 0 }]);
  });
});
