import {
  FIRST_RELEASE_VERSION,
  compareReleaseVersions,
  formatReleaseVersion,
  generateReleaseId,
  isNewerReleaseVersion,
  isReleaseVersion,
  latestReleaseVersion,
  nextReleaseVersion,
  parseReleaseVersion,
} from '@/lib/release/version';

describe('parseReleaseVersion', () => {
  it('parses a plain three-part version', () => {
    expect(parseReleaseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('accepts zero components', () => {
    expect(parseReleaseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it.each([
    ['a missing patch component', '1.2'],
    ['a fourth component', '1.2.3.4'],
    ['a leading zero', '1.02.3'],
    ['a pre-release tag', '1.2.3-beta'],
    ['build metadata', '1.2.3+build'],
    ['a leading v', 'v1.2.3'],
    ['surrounding space', ' 1.2.3 '],
    ['an empty string', ''],
    ['a negative component', '1.-2.3'],
  ])('rejects %s', (_label, value) => {
    expect(parseReleaseVersion(value)).toBeNull();
    expect(isReleaseVersion(value)).toBe(false);
  });

  it('rejects non-strings without throwing', () => {
    expect(parseReleaseVersion(123)).toBeNull();
    expect(parseReleaseVersion(null)).toBeNull();
    expect(parseReleaseVersion({ major: 1 })).toBeNull();
  });

  it('round-trips through formatReleaseVersion', () => {
    expect(formatReleaseVersion(parseReleaseVersion('12.0.7')!)).toBe('12.0.7');
  });
});

describe('compareReleaseVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareReleaseVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareReleaseVersions('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareReleaseVersions('1.1.2', '1.1.3')).toBeLessThan(0);
    expect(compareReleaseVersions('1.1.1', '1.1.1')).toBe(0);
  });

  it('compares numerically, not lexically', () => {
    expect(compareReleaseVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('throws on an invalid operand', () => {
    expect(() => compareReleaseVersions('1.0', '1.0.0')).toThrow(/Invalid release version/);
    expect(() => compareReleaseVersions('1.0.0', 'nope')).toThrow(/Invalid release version/);
  });
});

describe('isNewerReleaseVersion', () => {
  it('treats any valid version as newer than no previous release', () => {
    expect(isNewerReleaseVersion('0.0.1', null)).toBe(true);
    expect(isNewerReleaseVersion('1.0.0', undefined)).toBe(true);
  });

  it('refuses an equal version', () => {
    expect(isNewerReleaseVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('refuses a lower version', () => {
    expect(isNewerReleaseVersion('1.0.0', '1.0.1')).toBe(false);
  });

  it('refuses an invalid candidate', () => {
    expect(isNewerReleaseVersion('1.0', '0.9.0')).toBe(false);
  });

  it('accepts anything valid over an unparseable history entry', () => {
    expect(isNewerReleaseVersion('1.0.0', 'garbage')).toBe(true);
  });
});

describe('nextReleaseVersion', () => {
  it('starts at 1.0.0 with no history', () => {
    expect(nextReleaseVersion(null)).toBe(FIRST_RELEASE_VERSION);
    expect(nextReleaseVersion(undefined, 'major')).toBe(FIRST_RELEASE_VERSION);
    expect(nextReleaseVersion('not a version')).toBe(FIRST_RELEASE_VERSION);
  });

  it('bumps and resets the components below it', () => {
    expect(nextReleaseVersion('1.4.7', 'patch')).toBe('1.4.8');
    expect(nextReleaseVersion('1.4.7', 'minor')).toBe('1.5.0');
    expect(nextReleaseVersion('1.4.7', 'major')).toBe('2.0.0');
  });

  it('defaults to a patch bump', () => {
    expect(nextReleaseVersion('2.0.0')).toBe('2.0.1');
  });

  it('always produces something newer than its input', () => {
    for (const bump of ['major', 'minor', 'patch'] as const) {
      expect(isNewerReleaseVersion(nextReleaseVersion('3.5.9', bump), '3.5.9')).toBe(true);
    }
  });
});

describe('latestReleaseVersion', () => {
  it('returns null for an empty history', () => {
    expect(latestReleaseVersion([])).toBeNull();
  });

  it('finds the highest version regardless of order', () => {
    expect(latestReleaseVersion(['1.0.0', '1.10.0', '1.9.0'])).toBe('1.10.0');
  });

  it('ignores entries that are not versions', () => {
    expect(latestReleaseVersion(['garbage', '1.2.0', ''])).toBe('1.2.0');
    expect(latestReleaseVersion(['garbage'])).toBeNull();
  });
});

describe('generateReleaseId', () => {
  it('produces distinct prefixed ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateReleaseId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.startsWith('release_')).toBe(true);
  });
});
