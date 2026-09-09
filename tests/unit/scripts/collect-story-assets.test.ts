import {
  classifyAssetRef,
  collectStoryAssetRefs,
} from '../../../scripts/lib/collect-story-assets.mjs';

describe('classifyAssetRef', () => {
  it('classifies bundled asset paths', () => {
    expect(classifyAssetRef('assets/background/bg.png')).toBe('bundled');
    expect(classifyAssetRef('assets/sounds-sample/music.mp3')).toBe('bundled');
  });

  it('classifies inline data URIs', () => {
    expect(classifyAssetRef('data:image/png;base64,AAAA')).toBe('inline');
    expect(classifyAssetRef('data:audio/mpeg;base64,AAAA')).toBe('inline');
  });

  it('classifies remote media URLs', () => {
    expect(classifyAssetRef('https://cdn.example.com/a.png')).toBe('remote');
  });

  it('classifies device-local references as external', () => {
    expect(classifyAssetRef('file:///var/media-library/x.png')).toBe('external');
    expect(classifyAssetRef('blob:abc')).toBe('external');
    expect(classifyAssetRef('content://media/1')).toBe('external');
  });

  it('ignores non-asset strings', () => {
    expect(classifyAssetRef('scene_2')).toBeNull();
    expect(classifyAssetRef('Some dialogue text')).toBeNull();
    expect(classifyAssetRef('https://example.com/page')).toBeNull();
    expect(classifyAssetRef('')).toBeNull();
    expect(classifyAssetRef(42)).toBeNull();
  });
});

describe('collectStoryAssetRefs — canonical shape', () => {
  const story = {
    id: 'canon-1',
    title: 'Canonical',
    startSceneId: 's1',
    scenes: {
      s1: {
        id: 's1',
        timeline: [
          { id: 'b1', blockType: 'background', data: { assetId: 'assets/background/bg.png' } },
          { id: 'b2', blockType: 'character', data: { characterId: 'c1', spriteId: 'sp1' } },
          { id: 'b3', blockType: 'music', data: { mode: 'track', assetId: 'assets/sounds-sample/music.mp3' } },
          { id: 'b4', blockType: 'sound', data: { mode: 'track', assetId: 'assets/sounds-sample/sfx.mp3' } },
          {
            id: 'b5',
            blockType: 'interactive_object',
            data: {
              assetId: 'assets/objects/obj.png',
              actions: [{ type: 'sound', soundUri: 'assets/sounds-sample/door.mp3' }],
            },
          },
        ],
      },
    },
    characterLibrary: [
      { id: 'c1', name: 'C', sprites: [{ id: 'sp1', name: 'happy', uri: 'assets/charakters/char.png' }] },
    ],
  };

  it('collects an asset from every block type plus character sprites', () => {
    const uris = collectStoryAssetRefs(story).map((r) => r.uri).sort();
    expect(uris).toEqual(
      [
        'assets/background/bg.png',
        'assets/charakters/char.png',
        'assets/objects/obj.png',
        'assets/sounds-sample/door.mp3',
        'assets/sounds-sample/music.mp3',
        'assets/sounds-sample/sfx.mp3',
      ].sort(),
    );
  });

  it('classes them all as bundled', () => {
    for (const ref of collectStoryAssetRefs(story)) {
      expect(ref.class).toBe('bundled');
    }
  });
});

describe('collectStoryAssetRefs — legacy shape', () => {
  const story = {
    id: 'legacy-1',
    title: 'Legacy',
    startSceneId: 's1',
    scenes: {
      s1: {
        id: 's1',
        text: 'go to scene_2',
        backgroundImageUri: 'assets/background/bg.png',
        musicUri: 'assets/sounds-sample/music.mp3',
        voiceAudioUri: 'assets/sounds-sample/voice.mp3',
        characters: [{ id: 'g', uri: 'assets/charakters/char.png' }],
        choices: [{ id: 'c', text: 'next', nextSceneId: 'scene_2' }],
        interactiveObjects: [
          { id: 'o', actions: [{ type: 'sound', soundUri: 'assets/sounds-sample/door.mp3' }] },
        ],
      },
    },
  };

  it('collects assets from legacy scene fields', () => {
    const uris = collectStoryAssetRefs(story).map((r) => r.uri).sort();
    expect(uris).toEqual(
      [
        'assets/background/bg.png',
        'assets/charakters/char.png',
        'assets/sounds-sample/door.mp3',
        'assets/sounds-sample/music.mp3',
        'assets/sounds-sample/voice.mp3',
      ].sort(),
    );
  });

  it('does not treat scene ids or dialogue as assets', () => {
    const uris = collectStoryAssetRefs(story).map((r) => r.uri);
    expect(uris).not.toContain('scene_2');
  });
});

describe('collectStoryAssetRefs — dedup and mixed classes', () => {
  it('de-duplicates repeated references and preserves class', () => {
    const story = {
      scenes: {
        a: { timeline: [{ data: { assetId: 'assets/x.png' } }] },
        b: { timeline: [{ data: { assetId: 'assets/x.png' } }] },
        c: { timeline: [{ data: { assetId: 'data:image/png;base64,ZZ' } }] },
      },
    };
    const refs = collectStoryAssetRefs(story);
    expect(refs).toHaveLength(2);
    expect(refs.find((r) => r.uri === 'assets/x.png')?.class).toBe('bundled');
    expect(refs.find((r) => r.uri.startsWith('data:'))?.class).toBe('inline');
  });
});
