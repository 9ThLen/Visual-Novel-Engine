import {
  buildReleasePreview,
  isReleasePlayableBy,
  parseReleaseManifest,
  parseReleasePayload,
} from '@/lib/release/manifest';
import {
  RELEASE_CONTAINER_VERSION,
  RELEASE_FORMAT,
  RELEASE_LIMITS,
  RELEASE_SCHEMA_VERSION,
} from '@/lib/release/types';

const PAYLOAD_HASH = 'a'.repeat(64);
const OBJECT_HASH = 'b'.repeat(64);
const OTHER_OBJECT_HASH = 'c'.repeat(64);

/** A minimal manifest that must parse; every negative case mutates a copy. */
function validManifest(): Record<string, unknown> {
  return {
    format: RELEASE_FORMAT,
    containerVersion: RELEASE_CONTAINER_VERSION,
    schemaVersion: RELEASE_SCHEMA_VERSION,
    createdAt: '2026-08-29T10:00:00.000Z',
    appVersion: '1.0.0',
    story: {
      id: 'story_1',
      title: 'A Test Novel',
      startSceneId: 'scene_1',
      createdAt: 1,
      updatedAt: 2,
      sceneCount: 3,
    },
    release: {
      releaseId: 'release_1',
      storyId: 'story_1',
      version: '1.0.0',
      channel: 'both',
      releasedAt: '2026-08-29T10:00:00.000Z',
      notes: 'First release.',
      engineVersion: '1.0.0',
      minEngineVersion: '1.0.0',
      payloadHash: PAYLOAD_HASH,
      presentation: {
        coverAssetId: 'asset_cover',
        bannerEffect: 'rain',
        readerLayoutPreset: 'classic',
      },
      publication: {
        author: 'A Writer',
        languages: ['uk', 'en-GB'],
        contentRating: 'teen',
        contentWarnings: ['violence'],
        licence: 'CC-BY-4.0',
        credits: [{ role: 'art', name: 'An Artist', source: 'commission', licence: 'CC-BY-4.0' }],
        aiAssisted: false,
      },
      stats: { scenes: 3, words: 1200, readMinutes: 7, endings: 2, branches: 4 },
    },
    counts: {
      scenes: 3,
      characters: 1,
      audioItems: 1,
      embeddedAssets: 2,
      totalAssetBytes: 300,
    },
    payload: { archivePath: 'story.json', sha256: PAYLOAD_HASH, size: 2048 },
    assets: [
      {
        assetId: 'asset_cover',
        sourceReferences: ['idb-media://cover'],
        sha256: OBJECT_HASH,
        size: 100,
        kind: 'image',
        mimeType: 'image/webp',
        originalName: 'cover.webp',
        originalExtension: '.webp',
        archivePath: `objects/${OBJECT_HASH}`,
      },
      {
        assetId: 'asset_theme',
        sourceReferences: [],
        sha256: OTHER_OBJECT_HASH,
        size: 200,
        kind: 'audio',
        mimeType: 'audio/mpeg',
        originalName: 'theme.mp3',
        archivePath: `objects/${OTHER_OBJECT_HASH}`,
      },
    ],
  };
}

/** Mutate a nested field of a fresh valid manifest. */
function withRelease(changes: Record<string, unknown>): Record<string, unknown> {
  const manifest = validManifest();
  manifest.release = { ...(manifest.release as Record<string, unknown>), ...changes };
  return manifest;
}

function withPublication(changes: Record<string, unknown>): Record<string, unknown> {
  const manifest = validManifest();
  const release = manifest.release as Record<string, unknown>;
  release.publication = { ...(release.publication as Record<string, unknown>), ...changes };
  return manifest;
}

describe('parseReleaseManifest', () => {
  it('accepts a well-formed manifest', () => {
    const parsed = parseReleaseManifest(validManifest());
    expect(parsed.release.version).toBe('1.0.0');
    expect(parsed.release.publication.languages).toEqual(['uk', 'en-GB']);
    expect(parsed.assets).toHaveLength(2);
  });

  it('round-trips through JSON unchanged', () => {
    const parsed = parseReleaseManifest(validManifest());
    expect(parseReleaseManifest(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('does not alias the input object', () => {
    const raw = validManifest();
    const parsed = parseReleaseManifest(raw);
    (raw.story as Record<string, unknown>).title = 'Mutated';
    expect(parsed.story.title).toBe('A Test Novel');
  });

  it('drops unknown top-level fields rather than carrying them through', () => {
    const parsed = parseReleaseManifest({ ...validManifest(), attacker: 'payload' });
    expect(parsed).not.toHaveProperty('attacker');
  });

  it('normalizes hashes to lower case', () => {
    const manifest = withRelease({ payloadHash: PAYLOAD_HASH.toUpperCase() });
    manifest.payload = { archivePath: 'story.json', sha256: PAYLOAD_HASH.toUpperCase(), size: 2048 };
    expect(parseReleaseManifest(manifest).release.payloadHash).toBe(PAYLOAD_HASH);
  });

  it('omits optional fields that were absent instead of setting undefined', () => {
    const parsed = parseReleaseManifest(withRelease({ notes: undefined, presentation: undefined }));
    expect('notes' in parsed.release).toBe(false);
    expect('presentation' in parsed.release).toBe(false);
  });

  describe('container identity', () => {
    it.each([
      ['a backup rather than a release', { format: 'vne-story-backup' }, /Not a VNE release/],
      ['a future container version', { containerVersion: 2 }, /container version/],
      ['a future schema version', { schemaVersion: 99 }, /schema version/],
    ])('rejects %s', (_label, changes, message) => {
      expect(() => parseReleaseManifest({ ...validManifest(), ...changes })).toThrow(message);
    });

    it.each([null, undefined, 'a string', 42, []])('rejects a non-object manifest (%s)', (value) => {
      expect(() => parseReleaseManifest(value)).toThrow(/Invalid release manifest/);
    });
  });

  describe('cross-field integrity', () => {
    it('rejects a release block naming a different story', () => {
      expect(() => parseReleaseManifest(withRelease({ storyId: 'story_other' })))
        .toThrow(/disagree about the story ID/);
    });

    it('rejects a payload hash that disagrees with the descriptor', () => {
      expect(() => parseReleaseManifest(withRelease({ payloadHash: OBJECT_HASH })))
        .toThrow(/disagree about the payload hash/);
    });

    it('rejects a minimum engine newer than the building engine', () => {
      expect(() => parseReleaseManifest(withRelease({ minEngineVersion: '2.0.0' })))
        .toThrow(/requires a newer engine/);
    });

    it('rejects an asset count that does not match the asset table', () => {
      const manifest = validManifest();
      manifest.counts = { ...(manifest.counts as object), embeddedAssets: 5 };
      expect(() => parseReleaseManifest(manifest)).toThrow(/asset count does not match/);
    });

    it('rejects a byte total that does not match the asset table', () => {
      const manifest = validManifest();
      manifest.counts = { ...(manifest.counts as object), totalAssetBytes: 999 };
      expect(() => parseReleaseManifest(manifest)).toThrow(/asset size does not match/);
    });

    it('rejects a scene count that disagrees with the stats', () => {
      const manifest = validManifest();
      manifest.counts = { ...(manifest.counts as object), scenes: 4 };
      expect(() => parseReleaseManifest(manifest)).toThrow(/scene count does not match its stats/);
    });
  });

  describe('release block', () => {
    it.each([
      ['a missing release id', { releaseId: '' }, /release ID/],
      ['a blank release id', { releaseId: '   ' }, /release ID/],
      ['a non-semver version', { version: '1.0' }, /Invalid release version/],
      ['an unknown channel', { channel: 'torrent' }, /channel/],
      ['an unparseable release date', { releasedAt: 'someday' }, /release date/],
      ['a short payload hash', { payloadHash: 'abc' }, /payload hash/],
      ['a non-hex payload hash', { payloadHash: 'z'.repeat(64) }, /payload hash/],
      ['an invalid engine version', { engineVersion: 'latest' }, /engine version/],
    ])('rejects %s', (_label, changes, message) => {
      expect(() => parseReleaseManifest(withRelease(changes))).toThrow(message);
    });

    it('rejects notes beyond the length limit', () => {
      const notes = 'x'.repeat(RELEASE_LIMITS.maxNotesLength + 1);
      expect(() => parseReleaseManifest(withRelease({ notes }))).toThrow(/notes are too long/);
    });

    it('rejects a missing release block', () => {
      const manifest = validManifest();
      delete manifest.release;
      expect(() => parseReleaseManifest(manifest)).toThrow(/Invalid release release block/);
    });

    it.each([
      ['a negative stat', { scenes: -1 }],
      ['a fractional stat', { words: 12.5 }],
      ['a missing stat', { endings: undefined }],
    ])('rejects %s', (_label, changes) => {
      const manifest = validManifest();
      const release = manifest.release as Record<string, unknown>;
      release.stats = { ...(release.stats as object), ...changes };
      expect(() => parseReleaseManifest(manifest)).toThrow(/stat/);
    });
  });

  describe('publication', () => {
    it('rejects a missing author', () => {
      expect(() => parseReleaseManifest(withPublication({ author: '' }))).toThrow(/author/);
    });

    it('rejects an unknown content rating', () => {
      expect(() => parseReleaseManifest(withPublication({ contentRating: 'adults' })))
        .toThrow(/content rating/);
    });

    it('rejects an empty language list', () => {
      expect(() => parseReleaseManifest(withPublication({ languages: [] })))
        .toThrow(/Invalid release languages/);
    });

    it.each(['ukrainian!', 'u', '', 'en_GB'])('rejects the malformed language tag %o', (language) => {
      expect(() => parseReleaseManifest(withPublication({ languages: [language] })))
        .toThrow(/language/);
    });

    it('deduplicates languages', () => {
      const parsed = parseReleaseManifest(withPublication({ languages: ['uk', 'uk', 'en'] }));
      expect(parsed.release.publication.languages).toEqual(['uk', 'en']);
    });

    it('rejects a credit without a name', () => {
      expect(() => parseReleaseManifest(withPublication({ credits: [{ role: 'art' }] })))
        .toThrow(/credit name/);
    });

    it('rejects a non-boolean AI disclosure', () => {
      expect(() => parseReleaseManifest(withPublication({ aiAssisted: 'yes' })))
        .toThrow(/AI disclosure/);
    });

    it('rejects more credits than the limit allows', () => {
      const credits = Array.from({ length: RELEASE_LIMITS.maxCredits + 1 }, (_, index) => ({
        role: 'art',
        name: `Artist ${index}`,
      }));
      expect(() => parseReleaseManifest(withPublication({ credits }))).toThrow(/too many credits/);
    });
  });

  describe('assets', () => {
    it('rejects an archive path that does not match the hash', () => {
      const manifest = validManifest();
      (manifest.assets as Record<string, unknown>[])[0].archivePath = `objects/${OTHER_OBJECT_HASH}`;
      expect(() => parseReleaseManifest(manifest)).toThrow(/asset path or hash/);
    });

    it('rejects an archive path outside objects/', () => {
      const manifest = validManifest();
      (manifest.assets as Record<string, unknown>[])[0].archivePath = `../${OBJECT_HASH}`;
      expect(() => parseReleaseManifest(manifest)).toThrow(/asset path or hash/);
    });

    it('rejects duplicate asset ids', () => {
      const manifest = validManifest();
      (manifest.assets as Record<string, unknown>[])[1].assetId = 'asset_cover';
      expect(() => parseReleaseManifest(manifest)).toThrow(/Duplicate release asset ID/);
    });

    it('rejects one object claiming two different sizes', () => {
      const manifest = validManifest();
      const assets = manifest.assets as Record<string, unknown>[];
      assets[1].sha256 = OBJECT_HASH;
      assets[1].archivePath = `objects/${OBJECT_HASH}`;
      expect(() => parseReleaseManifest(manifest)).toThrow(/Inconsistent release object size/);
    });

    it('rejects a source reference owned by two assets', () => {
      const manifest = validManifest();
      (manifest.assets as Record<string, unknown>[])[1].sourceReferences = ['idb-media://cover'];
      expect(() => parseReleaseManifest(manifest)).toThrow(/Ambiguous release media reference/);
    });

    it('rejects an object beyond the size limit', () => {
      const manifest = validManifest();
      const assets = manifest.assets as Record<string, unknown>[];
      assets[0].size = RELEASE_LIMITS.maxObjectBytes + 1;
      manifest.counts = {
        ...(manifest.counts as object),
        totalAssetBytes: RELEASE_LIMITS.maxObjectBytes + 201,
      };
      expect(() => parseReleaseManifest(manifest)).toThrow(/object is too large/);
    });

    it('accepts a release with no assets at all', () => {
      const manifest = validManifest();
      manifest.assets = [];
      manifest.counts = { ...(manifest.counts as object), embeddedAssets: 0, totalAssetBytes: 0 };
      const release = manifest.release as Record<string, unknown>;
      release.presentation = {};
      expect(parseReleaseManifest(manifest).assets).toEqual([]);
    });
  });
});

describe('parseReleasePayload', () => {
  const payload = {
    scenes: { scene_1: { id: 'scene_1', timeline: [] } },
    characters: [],
    audioLibrary: [],
  };

  it('accepts a well-formed payload', () => {
    expect(parseReleasePayload(payload).scenes.scene_1).toBeDefined();
  });

  it('does not alias the input', () => {
    const raw = structuredClone(payload);
    const parsed = parseReleasePayload(raw);
    raw.scenes.scene_1.id = 'mutated';
    expect(parsed.scenes.scene_1.id).toBe('scene_1');
  });

  it('rejects a payload with no scenes', () => {
    expect(() => parseReleasePayload({ ...payload, scenes: {} })).toThrow(/no scenes/);
  });

  it.each([
    ['characters', { characters: {} }],
    ['audio library', { audioLibrary: 'none' }],
  ])('rejects an invalid %s', (_label, changes) => {
    expect(() => parseReleasePayload({ ...payload, ...changes })).toThrow(/Invalid release/);
  });
});

describe('isReleasePlayableBy', () => {
  const manifest = parseReleaseManifest(
    withRelease({ engineVersion: '1.5.0', minEngineVersion: '1.2.0' }),
  );

  it('accepts an engine at or above the minimum', () => {
    expect(isReleasePlayableBy(manifest, '1.2.0')).toBe(true);
    expect(isReleasePlayableBy(manifest, '2.0.0')).toBe(true);
  });

  it('refuses an engine below the minimum', () => {
    expect(isReleasePlayableBy(manifest, '1.1.9')).toBe(false);
  });

  it('refuses an unparseable engine version rather than guessing', () => {
    expect(isReleasePlayableBy(manifest, 'unknown')).toBe(false);
  });
});

describe('buildReleasePreview', () => {
  it('summarizes media by kind and totals the bytes', () => {
    const preview = buildReleasePreview(parseReleaseManifest(validManifest()));
    expect(preview.mediaKinds).toEqual({ image: 1, audio: 1 });
    expect(preview.totalBytes).toBe(2048 + 300);
    expect(preview.release.version).toBe('1.0.0');
  });

  it('does not alias the manifest it summarizes', () => {
    const manifest = parseReleaseManifest(validManifest());
    const preview = buildReleasePreview(manifest);
    preview.story.title = 'Mutated';
    expect(manifest.story.title).toBe('A Test Novel');
  });
});
