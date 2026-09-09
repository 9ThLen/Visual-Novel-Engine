import {
  PLAYER_CONFIG_GLOBAL,
  PLAYER_CONFIG_VERSION,
  __resetPlayerModeForTests,
  isCanonicalStoryShape,
  loadPlayerConfig,
  parsePlayerConfig,
  readInlinePlayerConfig,
} from '@/lib/player-mode';

const canonicalStory = {
  id: 'story-1',
  title: 'A Story',
  startSceneId: 's1',
  scenes: {
    s1: { id: 's1', timeline: [{ id: 'b1', blockType: 'text', data: {} }] },
  },
};

const legacyStory = {
  id: 'story-2',
  title: 'Legacy',
  startSceneId: 's1',
  scenes: {
    s1: { id: 's1', text: 'hi', characters: [], choices: [] },
  },
};

describe('isCanonicalStoryShape', () => {
  it('is true when scenes carry a timeline array', () => {
    expect(isCanonicalStoryShape(canonicalStory)).toBe(true);
  });

  it('is false for the legacy scene shape', () => {
    expect(isCanonicalStoryShape(legacyStory)).toBe(false);
  });

  it('is false for non-objects', () => {
    expect(isCanonicalStoryShape(null)).toBe(false);
    expect(isCanonicalStoryShape({})).toBe(false);
    expect(isCanonicalStoryShape({ scenes: {} })).toBe(false);
  });
});

describe('parsePlayerConfig', () => {
  it('accepts a valid config and echoes the story', () => {
    const config = parsePlayerConfig({ version: 1, story: canonicalStory, generatedAt: '2026-01-01' });
    expect(config).not.toBeNull();
    expect(config?.version).toBe(1);
    expect(config?.story.id).toBe('story-1');
    expect(config?.generatedAt).toBe('2026-01-01');
  });

  it('accepts a legacy-shaped story', () => {
    expect(parsePlayerConfig({ story: legacyStory })).not.toBeNull();
  });

  it('defaults the version when omitted', () => {
    const config = parsePlayerConfig({ story: canonicalStory });
    expect(config?.version).toBe(PLAYER_CONFIG_VERSION);
  });

  it('rejects configs without a usable story', () => {
    expect(parsePlayerConfig(null)).toBeNull();
    expect(parsePlayerConfig({})).toBeNull();
    expect(parsePlayerConfig({ story: null })).toBeNull();
    expect(parsePlayerConfig({ story: { title: 'x', startSceneId: 's', scenes: { s: {} } } })).toBeNull();
    expect(parsePlayerConfig({ story: { id: 'a', startSceneId: 's', scenes: { s: {} } } })).toBeNull();
    expect(parsePlayerConfig({ story: { id: 'a', title: 't', scenes: { s: {} } } })).toBeNull();
    expect(parsePlayerConfig({ story: { id: 'a', title: 't', startSceneId: 's', scenes: {} } })).toBeNull();
  });
});

describe('loadPlayerConfig', () => {
  afterEach(() => {
    document.querySelector('script[data-player-mode-test]')?.remove();
    vi.restoreAllMocks();
    __resetPlayerModeForTests();
  });

  it('resolves the config beside the deployed base path on a deep-link fallback', async () => {
    const script = document.createElement('script');
    script.dataset.playerModeTest = 'true';
    script.src = 'https://example.test/Visual-Novel-Engine/_expo/static/js/web/entry.js';
    document.head.appendChild(script);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ story: canonicalStory }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(loadPlayerConfig()).resolves.not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/Visual-Novel-Engine/player-config.json',
      { cache: 'no-store' },
    );
  });
});

describe('the inlined boot config', () => {
  const globalScope = globalThis as Record<string, unknown>;

  beforeEach(() => {
    __resetPlayerModeForTests();
    delete globalScope[PLAYER_CONFIG_GLOBAL];
  });
  afterEach(() => {
    __resetPlayerModeForTests();
    delete globalScope[PLAYER_CONFIG_GLOBAL];
  });

  it('is absent when nothing inlined one', () => {
    expect(readInlinePlayerConfig()).toBeNull();
  });

  /**
   * The inline copy is present before the first paint and cannot be answered
   * with an SPA fallback page, so it must win outright — a fetch that also ran
   * would be a second, slower source of truth for the same thing.
   */
  it('wins over the fetched file, which is never requested', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    globalScope[PLAYER_CONFIG_GLOBAL] = { version: 1, story: canonicalStory };

    const config = await loadPlayerConfig();

    expect(config?.story).toMatchObject({ id: 'story-1' });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('is ignored when it carries nothing playable', () => {
    globalScope[PLAYER_CONFIG_GLOBAL] = { version: 1, story: { id: 'x' } };
    expect(readInlinePlayerConfig()).toBeNull();
  });
});

describe('the packaged asset map in a boot config', () => {
  it('keeps references to files the bundle carries', () => {
    const config = parsePlayerConfig({
      version: 1,
      story: canonicalStory,
      assets: { 'idb-media://cover': 'media/abc.png' },
    });
    expect(config?.assets).toEqual({ 'idb-media://cover': 'media/abc.png' });
  });

  /**
   * A self-contained folder that quietly fetches from somewhere else should be
   * a visible decision, not a typo in an asset map.
   */
  it('drops anything that points outside the bundle', () => {
    const config = parsePlayerConfig({
      version: 1,
      story: canonicalStory,
      assets: {
        'a': 'https://example.test/x.png',
        'b': '//example.test/x.png',
        'c': '/absolute/x.png',
        'd': '../escape/x.png',
        'e': 'data:image/png;base64,AAA',
        'f': 'media/kept.png',
      },
    });
    expect(config?.assets).toEqual({ f: 'media/kept.png' });
  });

  it('leaves the field absent when a bundle packages nothing', () => {
    const config = parsePlayerConfig({ version: 1, story: canonicalStory, assets: {} });
    expect(config?.assets).toBeUndefined();
  });

  it('carries the release the bundle was cut from, when there is one', () => {
    const config = parsePlayerConfig({
      version: 1,
      story: canonicalStory,
      release: { releaseId: 'rel_1', version: '1.2.0', releasedAt: '2026-08-29T10:00:00.000Z' },
    });
    expect(config?.release).toEqual({
      releaseId: 'rel_1',
      version: '1.2.0',
      releasedAt: '2026-08-29T10:00:00.000Z',
    });
  });

  it('ignores a release block that names no release', () => {
    const config = parsePlayerConfig({ version: 1, story: canonicalStory, release: { version: '1.0.0' } });
    expect(config?.release).toBeUndefined();
  });
});
