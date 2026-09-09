/**
 * What a novel is called once it stops being a web page.
 *
 * The invariant worth defending here is quiet: the application id decides which
 * data directory the app gets, and that directory holds the reader's saves. An
 * id that moves when the author renames the story loses those saves; an id that
 * two stories share hands one novel's saves to another. Both are silent, and
 * both surface as "my game forgot everything".
 */
import {
  applicationIdProblem,
  deriveApplicationId,
  deriveNativeIdentity,
  desktopVersionProblem,
  isValidApplicationId,
  normalizeProductName,
  androidVersionCode,
  androidVersionCodeProblem,
  deriveAndroidIdentity,
  deriveUrlScheme,
  isSameSigningCertificate,
  normalizeSigningFingerprint,
  MAX_ANDROID_VERSION_CODE,
  NATIVE_ID_PREFIX,
} from '@/lib/release/native-identity';

describe('the application id', () => {
  it('is the same every time for the same story', () => {
    expect(deriveApplicationId('story_1712')).toBe(deriveApplicationId('story_1712'));
  });

  it('is valid for both bundlers', () => {
    for (const storyId of ['story_1712', 'a', 'STORY-with-DASHES', 'кирилиця', '  ', '12345']) {
      const id = deriveApplicationId(storyId.trim() || 'x');
      expect(isValidApplicationId(id), `${storyId} → ${id}`).toBe(true);
    }
  });

  /**
   * The one that costs a reader their progress. `my-story` and `my_story` and
   * `MyStory` all reduce to the same readable text; without the hash they would
   * install over each other.
   */
  it('separates stories whose readable parts collapse to the same text', () => {
    const ids = ['my-story', 'my_story', 'MyStory', 'my.story'].map((id) => deriveApplicationId(id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not change when the title or the author does', () => {
    const first = deriveNativeIdentity({ storyId: 's1', title: 'The Lighthouse', version: '1.0.0' });
    const renamed = deriveNativeIdentity({ storyId: 's1', title: 'Something Else Entirely', version: '2.4.0' });
    expect(renamed.applicationId).toBe(first.applicationId);
  });

  it('starts each part with a letter, because a package name is a Java name', () => {
    // A numeric story id would otherwise produce a segment starting with a digit.
    const id = deriveApplicationId('99999');
    for (const segment of id.split('.')) expect(segment).toMatch(/^[a-z]/);
  });

  it('refuses a story id it cannot derive anything from', () => {
    expect(() => deriveApplicationId('')).toThrow('without a story id');
  });

  it('uses the engine prefix unless told otherwise', () => {
    expect(deriveApplicationId('s1').startsWith(`${NATIVE_ID_PREFIX}.`)).toBe(true);
    expect(deriveApplicationId('s1', 'io.example').startsWith('io.example.')).toBe(true);
  });
});

describe('rejecting an application id', () => {
  it('names what is wrong rather than saying no', () => {
    expect(applicationIdProblem('')).toContain('empty');
    expect(applicationIdProblem('single')).toContain('two dot-separated parts');
    // Underscores are legal on Android and rejected by Tauri; hyphens are the
    // other way round. Neither survives.
    expect(applicationIdProblem('com.my_story.s1')).toContain('not a usable part');
    expect(applicationIdProblem('com.my-story.s1')).toContain('not a usable part');
    expect(applicationIdProblem('com.1story.s1')).toContain('not a usable part');
    expect(applicationIdProblem('com.new.s1')).toContain('reserved word');
  });

  /** Tauri rejects this one specifically: it collides with a macOS bundle. */
  it('refuses an id ending in .app', () => {
    expect(applicationIdProblem('com.example.app')).toContain('.app');
  });

  it('refuses one too long to be a package name', () => {
    expect(applicationIdProblem(`com.${'a'.repeat(160)}.s1`)).toContain('155');
  });
});

describe('the product name', () => {
  it('keeps an ordinary title as it is', () => {
    expect(normalizeProductName('The Lighthouse')).toBe('The Lighthouse');
  });

  /**
   * Novels have colons and question marks far more often than software does,
   * and the product name becomes an installer filename.
   */
  it('removes what a Windows filename cannot hold', () => {
    expect(normalizeProductName('Chapter 1: What Now?')).toBe('Chapter 1 What Now');
    expect(normalizeProductName('a/b\\c*d|e')).toBe('a b c d e');
  });

  it('drops a trailing dot, which Windows would drop silently', () => {
    expect(normalizeProductName('The End.')).toBe('The End');
  });

  it('falls back rather than producing an empty name', () => {
    expect(normalizeProductName('   ')).toBe('Untitled Story');
    expect(normalizeProductName(undefined)).toBe('Untitled Story');
    expect(normalizeProductName('???')).toBe('Untitled Story');
  });

  it('escapes a reserved device name', () => {
    expect(normalizeProductName('CON')).toBe('CON Story');
    expect(normalizeProductName('lpt1')).toBe('lpt1 Story');
  });

  it('caps the length and does not leave a trailing space behind', () => {
    const name = normalizeProductName(`${'x'.repeat(59)} tail`);
    expect(name).toHaveLength(59);
    expect(name).not.toMatch(/[ .]$/);
  });
});

describe('the desktop version', () => {
  it('accepts a release version', () => {
    expect(desktopVersionProblem('1.0.0')).toBeNull();
    expect(desktopVersionProblem('12.34.567')).toBeNull();
  });

  /**
   * Refused, not clamped. Clamping would make two different releases install as
   * the same version, and an installer that thinks it is already up to date is
   * worse than one that never ran.
   */
  it('refuses a version Windows Installer cannot record', () => {
    expect(desktopVersionProblem('256.0.0')).toContain('outside what a Windows installer');
    expect(desktopVersionProblem('1.999.0')).toContain('outside what a Windows installer');
    expect(desktopVersionProblem('1.0.70000')).toContain('outside what a Windows installer');
  });

  it('refuses anything that is not three numbers', () => {
    expect(desktopVersionProblem('1.0')).toContain('MAJOR.MINOR.PATCH');
    expect(desktopVersionProblem('1.0.0-beta')).toContain('MAJOR.MINOR.PATCH');
    expect(desktopVersionProblem(undefined)).toContain('no version');
  });
});

describe('the whole identity', () => {
  it('comes out of a release', () => {
    expect(deriveNativeIdentity({ storyId: 'story_42', title: 'Rain: A Novel', version: '2.1.0' })).toEqual({
      storyId: 'story_42',
      applicationId: deriveApplicationId('story_42'),
      productName: 'Rain A Novel',
      version: '2.1.0',
    });
  });

  it('throws rather than handing back a name the platform will reject', () => {
    expect(() => deriveNativeIdentity({ storyId: 's1', version: '1.0' })).toThrow('MAJOR.MINOR.PATCH');
  });
});

describe('the Android version code', () => {
  /**
   * Derived rather than reserved from a counter. Monotonic by construction,
   * because a release version is already refused unless it is strictly newer
   * than the last one — so there is no counter to lose and nothing to race for.
   */
  it('increases with the release version', () => {
    const codes = ['1.0.0', '1.0.1', '1.1.0', '2.0.0'].map((v) => androidVersionCode(v));
    for (let i = 1; i < codes.length; i += 1) expect(codes[i]).toBeGreaterThan(codes[i - 1]);
  });

  /**
   * The same release in two formats is one version of the app. Different codes
   * would make a sideloaded APK and a Play listing of one release look like two
   * versions to a device that saw both.
   */
  it('gives the same release the same code every time', () => {
    expect(androidVersionCode('3.4.5')).toBe(androidVersionCode('3.4.5'));
    expect(androidVersionCode('3.4.5')).toBe(3_004_005);
  });

  it('stays inside what Android accepts', () => {
    expect(androidVersionCode('2000.999.999')).toBeLessThan(MAX_ANDROID_VERSION_CODE);
  });

  it('refuses a version it cannot pack, rather than wrapping it', () => {
    expect(androidVersionCodeProblem('1.1000.0')).toContain('does not fit');
    expect(androidVersionCodeProblem('2001.0.0')).toContain('does not fit');
    expect(androidVersionCodeProblem('1.0')).toContain('MAJOR.MINOR.PATCH');
    expect(() => androidVersionCode('1.0.1000')).toThrow('does not fit');
  });
});

describe('a signing certificate fingerprint', () => {
  const colons = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89'
    + ':AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';

  /**
   * `keytool` prints it with colons, some CI tools without, and either in lower
   * case. Compared through one normalizer so no caller compares raw strings and
   * concludes a matching certificate does not match.
   */
  it('is the same certificate however it was printed', () => {
    expect(isSameSigningCertificate(colons, colons.replace(/:/g, ''))).toBe(true);
    expect(isSameSigningCertificate(colons, colons.toLowerCase())).toBe(true);
    expect(normalizeSigningFingerprint(colons.replace(/:/g, '').toLowerCase())).toBe(colons);
  });

  it('is not equal to something that is not a fingerprint', () => {
    expect(isSameSigningCertificate(colons, 'unknown')).toBe(false);
    expect(isSameSigningCertificate(null, null)).toBe(false);
    expect(normalizeSigningFingerprint('AB:CD')).toBeNull();
    // A SHA-1 fingerprint is 20 bytes, and the two are printed identically.
    expect(normalizeSigningFingerprint('AB'.repeat(20))).toBeNull();
  });
});

describe('the Android identity', () => {
  it('is the shared identity plus a version code', () => {
    expect(deriveAndroidIdentity({ storyId: 'story_42', title: 'Rain', version: '2.1.0' })).toEqual({
      storyId: 'story_42',
      applicationId: deriveApplicationId('story_42'),
      productName: 'Rain',
      version: '2.1.0',
      androidVersionCode: 2_001_000,
      urlScheme: deriveUrlScheme(deriveApplicationId('story_42')),
    });
  });

  /** The desktop derivation must not inherit a limit that is not its own. */
  it('refuses a version the desktop one accepts', () => {
    expect(deriveNativeIdentity({ storyId: 's1', version: '1.0.1000' }).version).toBe('1.0.1000');
    expect(() => deriveAndroidIdentity({ storyId: 's1', version: '1.0.1000' })).toThrow('does not fit');
  });
});

describe('the URL scheme', () => {
  /**
   * Every build used to carry the engine's own scheme, so two novels installed
   * on one phone registered the same one — and duplicate registrations are
   * resolved arbitrarily. A link meant for one novel opens another, and a player
   * can sit in front of the studio's own OAuth redirect on a device with both.
   */
  it('is different for every application', () => {
    const schemes = ['story_a', 'story_b', 'my-story', 'my_story']
      .map((id) => deriveUrlScheme(deriveApplicationId(id)));
    expect(new Set(schemes).size).toBe(schemes.length);
  });

  it('is stable for one application', () => {
    const id = deriveApplicationId('story_42');
    expect(deriveUrlScheme(id)).toBe(deriveUrlScheme(id));
  });

  /** Letters and digits only: mobile linking handles the rest inconsistently. */
  it('is letters and digits, starting with a letter', () => {
    for (const storyId of ['story_42', '99999', 'кирилиця', 'MyStory']) {
      expect(deriveUrlScheme(deriveApplicationId(storyId)), storyId).toMatch(/^[a-z][a-z0-9]*$/);
    }
  });

  it('refuses to derive one from an id no platform would accept', () => {
    expect(() => deriveUrlScheme('com.my_story.s1')).toThrow('not a usable part');
  });

  it('travels with the rest of the Android identity', () => {
    const identity = deriveAndroidIdentity({ storyId: 'story_42', title: 'Rain', version: '2.1.0' });
    expect(identity.urlScheme).toBe(deriveUrlScheme(identity.applicationId));
  });
});
