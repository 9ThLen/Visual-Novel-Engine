import {
  describeSaveCompatibility,
  needsSaveCompatibilityWarning,
} from '@/lib/release/save-compatibility';

const release = { releaseId: 'release_2', version: '1.2.0', sceneIds: ['start', 'middle'] };

describe('describeSaveCompatibility', () => {
  it('says nothing when the save came from the release being played', () => {
    expect(describeSaveCompatibility({
      slot: { sceneId: 'start', releaseId: 'release_2', releaseVersion: '1.2.0' },
      release,
    })).toEqual({ kind: 'same' });
  });

  it('names the versions when the save came from an earlier release', () => {
    expect(describeSaveCompatibility({
      slot: { sceneId: 'start', releaseId: 'release_1', releaseVersion: '1.0.0' },
      release,
    })).toEqual({ kind: 'otherVersion', savedVersion: '1.0.0', currentVersion: '1.2.0' });
  });

  it('still reports a mismatch when the old save recorded no version', () => {
    expect(describeSaveCompatibility({
      slot: { sceneId: 'start', releaseId: 'release_1' },
      release,
    })).toEqual({ kind: 'otherVersion', savedVersion: null, currentVersion: '1.2.0' });
  });

  // Not an error: saves predate releases, and an author testing a draft leaves
  // no stamp either. Naming it beats assuming it is fine.
  it('reports an unstamped save rather than calling it a match', () => {
    expect(describeSaveCompatibility({ slot: { sceneId: 'start' }, release }))
      .toEqual({ kind: 'unstamped', currentVersion: '1.2.0' });
  });

  it('has nothing to compare when no release is being played', () => {
    expect(describeSaveCompatibility({
      slot: { sceneId: 'start', releaseId: 'release_1' },
      release: null,
    })).toEqual({ kind: 'noRelease' });
  });

  // "There is nowhere to put you" outranks "this may read oddly".
  it('reports a missing scene ahead of a version mismatch', () => {
    expect(describeSaveCompatibility({
      slot: { sceneId: 'deleted', releaseId: 'release_1', releaseVersion: '1.0.0' },
      release,
    })).toEqual({ kind: 'missingScene', sceneId: 'deleted' });
  });

  it('reports a missing scene even for a save from this very release', () => {
    expect(describeSaveCompatibility({
      slot: { sceneId: 'deleted', releaseId: 'release_2', releaseVersion: '1.2.0' },
      release,
    })).toEqual({ kind: 'missingScene', sceneId: 'deleted' });
  });
});

describe('needsSaveCompatibilityWarning', () => {
  it.each([
    ['a match', { kind: 'same' as const }, false],
    ['no release', { kind: 'noRelease' as const }, false],
    ['an unstamped save', { kind: 'unstamped' as const, currentVersion: '1.0.0' }, false],
    [
      'another version',
      { kind: 'otherVersion' as const, savedVersion: '1.0.0', currentVersion: '1.2.0' },
      true,
    ],
    ['a missing scene', { kind: 'missingScene' as const, sceneId: 'gone' }, true],
  ])('warns for %s: %s', (_label, compatibility, expected) => {
    expect(needsSaveCompatibilityWarning(compatibility)).toBe(expected);
  });
});
