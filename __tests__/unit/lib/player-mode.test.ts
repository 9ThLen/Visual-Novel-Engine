import {
  PLAYER_CONFIG_VERSION,
  __resetPlayerModeForTests,
  isCanonicalStoryShape,
  loadPlayerConfig,
  parsePlayerConfig,
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
