import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  buildShelves,
  buildShowcaseStory,
  countBranches,
  countEndings,
  estimateReadMinutes,
  extractTeaser,
  fallbackColorForSeed,
  firstBackgroundAssetId,
  pickBannerEffect,
  type ShowcaseStory,
} from '@/lib/showcase/story-showcase';

function step(blockType: TimelineStep['blockType'], data: unknown, enabled = true): TimelineStep {
  return { id: `${blockType}-${Math.random()}`, blockType, data: data as never, collapsed: false, enabled };
}

function scene(id: string, overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id,
    storyId: 'story-1',
    name: id,
    description: '',
    tags: [],
    timeline: [],
    sceneState: {} as never,
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function dialogue(...texts: string[]) {
  return { entries: texts.map((text, i) => ({ id: `e${i}`, characterId: 'c', spriteId: 's', text })), currentEntryIndex: 0 };
}

describe('extractTeaser', () => {
  it('prefers the first dialogue line over later narration', () => {
    const scenes = [
      scene('start', {
        timeline: [step('text', { content: 'Narration' }), step('dialogue', dialogue('Spoken line'))],
      }),
    ];
    expect(extractTeaser(scenes, 'start')).toBe('Spoken line');
  });

  it('falls back to narration when no dialogue exists', () => {
    const scenes = [scene('start', { timeline: [step('text', { content: 'Narration' })] })];
    expect(extractTeaser(scenes, 'start')).toBe('Narration');
  });

  it('skips disabled steps and empty entries', () => {
    const scenes = [
      scene('start', {
        timeline: [
          step('dialogue', dialogue('Disabled voice'), false),
          step('dialogue', dialogue('   ')),
          step('dialogue', dialogue('Real voice')),
        ],
      }),
    ];
    expect(extractTeaser(scenes, 'start')).toBe('Real voice');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const long = `${'word '.repeat(40)}tail`;
    const scenes = [scene('start', { timeline: [step('text', { content: long })] })];
    const teaser = extractTeaser(scenes, 'start');

    expect(teaser?.endsWith('…')).toBe(true);
    expect(teaser?.length).toBeLessThanOrEqual(141);
    expect(teaser).not.toContain('wor…');
  });

  it('returns null when the start scene has nothing to say', () => {
    expect(extractTeaser([scene('start')], 'start')).toBeNull();
    expect(extractTeaser([], 'missing')).toBeNull();
  });
});

describe('estimateReadMinutes', () => {
  it('is at least one minute', () => {
    expect(estimateReadMinutes([scene('a', { timeline: [step('text', { content: 'Hi' })] })])).toBe(1);
  });

  it('counts dialogue, narration and choices but not disabled steps', () => {
    const words = (n: number) => 'word '.repeat(n).trim();
    const scenes = [
      scene('a', {
        timeline: [
          step('dialogue', dialogue(words(180))),
          step('text', { content: words(180) }),
          step('text', { content: words(900) }, false),
        ],
      }),
    ];
    expect(estimateReadMinutes(scenes)).toBe(2);
  });
});

describe('countEndings / countBranches', () => {
  it('counts scenes without connections as endings', () => {
    const scenes = [
      scene('a', { connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b'),
      scene('c'),
    ];
    expect(countEndings(scenes)).toBe(2);
  });

  it('reports one ending for a pure loop', () => {
    const scenes = [
      scene('a', { connections: [{ targetSceneId: 'b', outputPort: 'next' }] }),
      scene('b', { connections: [{ targetSceneId: 'a', outputPort: 'next' }] }),
    ];
    expect(countEndings(scenes)).toBe(1);
  });

  it('counts multi-connection scenes and choice steps as branches', () => {
    const scenes = [
      scene('a', {
        connections: [
          { targetSceneId: 'b', outputPort: 'choice_a' },
          { targetSceneId: 'c', outputPort: 'choice_b' },
        ],
      }),
      scene('b', { timeline: [step('choice', { options: [{ id: '1', text: 'Yes' }, { id: '2', text: 'No' }] })] }),
      scene('c', { timeline: [step('choice', { options: [{ id: '1', text: 'Only' }] })] }),
    ];
    expect(countBranches(scenes)).toBe(2);
  });
});

describe('pickBannerEffect / firstBackgroundAssetId', () => {
  it('picks only weather effects the banner can replay', () => {
    const scenes = [
      scene('start', {
        timeline: [step('effect', { effectType: 'glitch' }), step('effect', { effectType: 'rain' })],
      }),
    ];
    expect(pickBannerEffect(scenes, 'start')).toBe('rain');
  });

  it('returns null when the start scene has no weather', () => {
    const scenes = [scene('start', { timeline: [step('effect', { effectType: 'shake' })] })];
    expect(pickBannerEffect(scenes, 'start')).toBeNull();
  });

  it('finds the first background asset id', () => {
    const scenes = [
      scene('start', {
        timeline: [step('background', { assetId: null }), step('background', { assetId: 'asset-7' })],
      }),
    ];
    expect(firstBackgroundAssetId(scenes, 'start')).toBe('asset-7');
  });
});

describe('buildShowcaseStory', () => {
  const metadata: StoryMetadata = {
    id: 'story-1',
    title: 'Story',
    author: '  Ada  ',
    startSceneId: 'start',
    createdAt: 10,
    updatedAt: 20,
    sceneCount: 2,
    tags: ['drama'],
  };
  const scenes = [
    scene('start', { connections: [{ targetSceneId: 'end', outputPort: 'next' }] }),
    scene('end'),
  ];

  it('ignores endings that no longer exist', () => {
    const story = buildShowcaseStory(metadata, scenes, {
      latestSave: null,
      endingsReached: ['end', 'deleted-scene', 'end'],
    });

    expect(story.endingsSeen).toBe(1);
    expect(story.endingsTotal).toBe(1);
    expect(story.isFinished).toBe(true);
    expect(story.hasStarted).toBe(false);
    expect(story.author).toBe('Ada');
  });

  it('derives progress from the latest save', () => {
    const story = buildShowcaseStory(metadata, scenes, {
      latestSave: { sceneId: 'start', timestamp: 99 },
      endingsReached: [],
    });

    expect(story.hasStarted).toBe(true);
    expect(story.isFinished).toBe(false);
    expect(story.lastSceneId).toBe('start');
    expect(story.lastSaveTimestamp).toBe(99);
  });
});

describe('buildShelves', () => {
  const base: ShowcaseStory = {
    id: 'x',
    title: 'X',
    author: null,
    coverUri: null,
    teaser: null,
    tags: [],
    readMinutes: 5,
    endingsTotal: 2,
    endingsSeen: 0,
    branchCount: 0,
    bannerEffect: null,
    bannerBackgroundAssetId: null,
    hasStarted: false,
    isFinished: false,
    lastSaveTimestamp: null,
    lastSceneId: null,
    createdAt: 0,
    updatedAt: 0,
  };
  const story = (overrides: Partial<ShowcaseStory>): ShowcaseStory => ({ ...base, ...overrides });
  const NOW = 100_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  it('collapses a themed shelf that holds a single card', () => {
    const only = story({ id: 'a', createdAt: NOW - DAY });
    const shelves = buildShelves([only], NOW);

    expect(shelves.fresh).toEqual([]);
    expect(shelves.quickReads).toEqual([]);
    expect(shelves.all).toHaveLength(1);
    expect(shelves.hero?.id).toBe('a');
  });

  it('keeps a themed shelf once it has two cards', () => {
    const stories = [
      story({ id: 'a', createdAt: NOW - DAY }),
      story({ id: 'b', createdAt: NOW - 2 * DAY }),
    ];
    expect(buildShelves(stories, NOW).quickReads.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('places a story on at most one themed shelf, by priority', () => {
    const stories = [
      story({ id: 'reading-1', hasStarted: true, lastSaveTimestamp: 2, createdAt: NOW }),
      story({ id: 'reading-2', hasStarted: true, lastSaveTimestamp: 5, createdAt: NOW }),
      story({ id: 'done-1', isFinished: true, endingsSeen: 1, createdAt: NOW }),
      story({ id: 'done-2', isFinished: true, endingsSeen: 1, createdAt: NOW }),
    ];
    const shelves = buildShelves(stories, NOW);

    expect(shelves.continueReading.map((s) => s.id)).toEqual(['reading-2', 'reading-1']);
    expect(shelves.unexplored.map((s) => s.id)).toEqual(['done-1', 'done-2']);
    expect(shelves.fresh).toEqual([]);
    expect(shelves.all).toHaveLength(4);
  });

  it('excludes stories older than the fresh window', () => {
    const stories = [
      story({ id: 'a', createdAt: NOW - 13 * DAY, readMinutes: 90 }),
      story({ id: 'b', createdAt: NOW - 15 * DAY, readMinutes: 90 }),
      story({ id: 'c', createdAt: NOW - 1 * DAY, readMinutes: 90 }),
    ];
    expect(buildShelves(stories, NOW).fresh.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('prefers a resumable story as hero, else the newest', () => {
    const reading = story({ id: 'reading', hasStarted: true, lastSaveTimestamp: 1, createdAt: 0 });
    const newest = story({ id: 'newest', createdAt: NOW });

    expect(buildShelves([newest, reading], NOW).hero?.id).toBe('reading');
    expect(buildShelves([newest], NOW).hero?.id).toBe('newest');
    expect(buildShelves([], NOW).hero).toBeNull();
  });

  it('sorts all by most recently updated', () => {
    const stories = [story({ id: 'old', updatedAt: 1 }), story({ id: 'new', updatedAt: 9 })];
    expect(buildShelves(stories, NOW).all.map((s) => s.id)).toEqual(['new', 'old']);
  });
});

describe('fallbackColorForSeed', () => {
  it('is deterministic and stays in the palette', () => {
    expect(fallbackColorForSeed('story-1')).toBe(fallbackColorForSeed('story-1'));
    expect(fallbackColorForSeed('story-1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
