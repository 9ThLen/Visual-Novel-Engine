import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import {
  FEATURED_MAX_AGE_MS,
  buildStudioProject,
  buildStudioProjects,
  describeUpdatedAt,
  filterStudioProjects,
  resolveResumeSceneId,
  shouldFeatureFirst,
  sortStudioProjects,
  summarizeStudioLibrary,
  type StudioProject,
} from '@/lib/editor/story-library';

function step(blockType: TimelineStep['blockType'], data: unknown): TimelineStep {
  return { id: `${blockType}-${Math.random()}`, blockType, data: data as never, collapsed: false, enabled: true };
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

function story(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
  return {
    id: 'story-1',
    title: 'A Story',
    startSceneId: 'start',
    createdAt: 1_000,
    updatedAt: 2_000,
    sceneCount: 1,
    ...overrides,
  };
}

/** A one-scene story that passes every graph check. */
function soundScenes(): SceneRecord[] {
  return [scene('start', { isStart: true, timeline: [step('text', { content: 'One two three' })] })];
}

describe('buildStudioProject', () => {
  it('counts the manuscript once the scenes are hydrated', () => {
    const scenes = [
      scene('start', {
        isStart: true,
        timeline: [
          step('text', { content: 'four words go here' }),
          step('choice', { options: [{ id: 'a' }, { id: 'b' }] }),
        ],
      }),
    ];
    const project = buildStudioProject(story(), scenes, { hydrated: true });

    expect(project.scenes).toBe(1);
    expect(project.words).toBe(4);
    expect(project.choices).toBe(2);
  });

  it('reports nothing it cannot know while the scenes are still loading', () => {
    const project = buildStudioProject(story({ sceneCount: 12 }), [], { hydrated: false });

    expect(project.status).toBe('pending');
    expect(project.words).toBeNull();
    expect(project.choices).toBeNull();
    // Scene count comes from metadata, so it is right even before the load.
    expect(project.scenes).toBe(12);
  });

  it('is ready only when the graph is sound and the story is presentable', () => {
    const ready = buildStudioProject(
      story({ thumbnailUri: 'cover', description: 'A description' }),
      soundScenes(),
      { hydrated: true },
    );
    expect(ready.status).toBe('ready');
    expect(ready.issueCount).toBe(0);
  });

  it('is a draft when the graph is sound but the cover or description is missing', () => {
    const noCover = buildStudioProject(story({ description: 'A description' }), soundScenes(), {
      hydrated: true,
    });
    const noDescription = buildStudioProject(story({ thumbnailUri: 'cover' }), soundScenes(), {
      hydrated: true,
    });
    const blankDescription = buildStudioProject(
      story({ thumbnailUri: 'cover', description: '   ' }),
      soundScenes(),
      { hydrated: true },
    );

    expect(noCover.status).toBe('draft');
    expect(noDescription.status).toBe('draft');
    expect(blankDescription.status).toBe('draft');
  });

  it('counts graph issues and lets them outrank a missing cover', () => {
    const scenes = [
      scene('start', {
        isStart: true,
        timeline: [step('text', { content: 'Hello' })],
        connections: [{ targetSceneId: 'ghost', outputPort: 'next' }] as never,
      }),
    ];
    const project = buildStudioProject(
      story({ thumbnailUri: 'cover', description: 'A description' }),
      scenes,
      { hydrated: true },
    );

    expect(project.status).toBe('issues');
    expect(project.issueCount).toBeGreaterThan(0);
  });
});

describe('resolveResumeSceneId', () => {
  it('reopens the scene the author last had in the editor', () => {
    const scenes = [scene('start', { isStart: true }), scene('chapter-2')];
    expect(resolveResumeSceneId(story(), scenes, 'chapter-2')).toBe('chapter-2');
  });

  it('falls back to the start scene when the remembered scene is gone', () => {
    const scenes = [scene('start', { isStart: true })];
    expect(resolveResumeSceneId(story(), scenes, 'deleted-scene')).toBe('start');
    expect(resolveResumeSceneId(story(), scenes, undefined)).toBe('start');
  });
});

describe('buildStudioProjects', () => {
  it('reads hydration and the remembered scene per story', () => {
    const projects = buildStudioProjects({
      storiesMetadata: [story({ id: 'a' }), story({ id: 'b', sceneCount: 7 })],
      sceneRecordsByStory: {
        a: { start: scene('start', { storyId: 'a', isStart: true }), two: scene('two', { storyId: 'a' }) },
        b: {},
      },
      sceneRecordHydration: { a: 'full', b: 'window' },
      lastEditedSceneByStory: { a: 'two' },
    });

    expect(projects[0].resumeSceneId).toBe('two');
    expect(projects[0].status).not.toBe('pending');
    expect(projects[1].status).toBe('pending');
    expect(projects[1].scenes).toBe(7);
  });
});

describe('sorting, search and totals', () => {
  const projects = [
    { id: 'a', title: 'Bravo', author: 'Olha', tags: ['drama'], scenes: 2, words: 100, updatedAt: 30 },
    { id: 'b', title: 'alpha', author: null, tags: [], scenes: 9, words: 20, updatedAt: 10 },
    { id: 'c', title: 'Charlie', author: null, tags: ['1941'], scenes: 1, words: 400, updatedAt: 20 },
  ].map((partial) => ({ ...partial, choices: 0, status: 'ready', issueCount: 0 }) as unknown as StudioProject);

  it('puts the most recently edited story first by default', () => {
    expect(sortStudioProjects(projects, 'recent').map((p) => p.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts titles case-insensitively', () => {
    expect(sortStudioProjects(projects, 'title').map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by manuscript size, falling back to scenes', () => {
    expect(sortStudioProjects(projects, 'size').map((p) => p.id)).toEqual(['c', 'a', 'b']);
    const unhydrated = projects.map((p) => ({ ...p, words: null }));
    expect(sortStudioProjects(unhydrated, 'size').map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not reorder the caller’s array', () => {
    const original = [...projects];
    sortStudioProjects(projects, 'title');
    expect(projects).toEqual(original);
  });

  it('searches title, author and tags', () => {
    expect(filterStudioProjects(projects, 'brav').map((p) => p.id)).toEqual(['a']);
    expect(filterStudioProjects(projects, 'olha').map((p) => p.id)).toEqual(['a']);
    expect(filterStudioProjects(projects, '1941').map((p) => p.id)).toEqual(['c']);
    expect(filterStudioProjects(projects, '   ')).toHaveLength(3);
    expect(filterStudioProjects(projects, 'nothing')).toHaveLength(0);
  });

  it('totals scenes across the shelf', () => {
    expect(summarizeStudioLibrary(projects)).toEqual({ stories: 3, scenes: 12 });
  });
});

describe('shouldFeatureFirst', () => {
  const now = 1_000_000_000;
  const recent = [
    { updatedAt: now - 1_000 },
    { updatedAt: now - 2_000 },
  ] as unknown as StudioProject[];

  it('features the first card under the default order', () => {
    expect(shouldFeatureFirst(recent, 'recent', now)).toBe(true);
  });

  it('does not feature under any other order', () => {
    expect(shouldFeatureFirst(recent, 'title', now)).toBe(false);
    expect(shouldFeatureFirst(recent, 'size', now)).toBe(false);
  });

  it('does not feature a single card or a stale one', () => {
    expect(shouldFeatureFirst(recent.slice(0, 1), 'recent', now)).toBe(false);
    const stale = [
      { updatedAt: now - FEATURED_MAX_AGE_MS - 1 },
      { updatedAt: now - FEATURED_MAX_AGE_MS - 2 },
    ] as unknown as StudioProject[];
    expect(shouldFeatureFirst(stale, 'recent', now)).toBe(false);
  });

  it('features nothing on an empty shelf', () => {
    expect(shouldFeatureFirst([], 'recent', now)).toBe(false);
  });
});

describe('describeUpdatedAt', () => {
  const now = 10_000_000_000;
  const minute = 60_000;

  it('walks the thresholds from seconds to a plain date', () => {
    expect(describeUpdatedAt(now - 5_000, now)).toEqual({ unit: 'justNow' });
    expect(describeUpdatedAt(now - 5 * minute, now)).toEqual({ unit: 'minutes', count: 5 });
    expect(describeUpdatedAt(now - 3 * 60 * minute, now)).toEqual({ unit: 'hours', count: 3 });
    expect(describeUpdatedAt(now - 30 * 60 * minute, now)).toEqual({ unit: 'yesterday' });
    expect(describeUpdatedAt(now - 4 * 24 * 60 * minute, now)).toEqual({ unit: 'days', count: 4 });
    expect(describeUpdatedAt(now - 40 * 24 * 60 * minute, now)).toEqual({ unit: 'date' });
  });

  it('treats a timestamp from the future as just now rather than a negative age', () => {
    expect(describeUpdatedAt(now + minute, now)).toEqual({ unit: 'justNow' });
  });
});

describe('publication state on the shelf', () => {
  const published = { version: '1.2.0', releasedAt: 5_000 };

  function project(storyUpdatedAt: number, withRelease = true) {
    return buildStudioProject(
      {
        id: 'story_1',
        title: 'A Novel',
        description: 'Described.',
        thumbnailUri: 'idb-media://cover',
        startSceneId: 'start',
        createdAt: 1,
        updatedAt: storyUpdatedAt,
        sceneCount: 1,
      },
      [{ id: 'start', isStart: true, timeline: [], connections: [], createdAt: 1 } as never],
      { hydrated: true, published: withRelease ? published : undefined },
    );
  }

  it('reports nothing for a story that was never published', () => {
    expect(project(9_000, false).publication).toBeNull();
  });

  it('reports the published version', () => {
    expect(project(4_000).publication).toEqual({
      version: '1.2.0',
      releasedAt: 5_000,
      hasUnreleasedChanges: false,
    });
  });

  // Compared against the release date rather than a saved flag: updatedAt is
  // the only thing that knows about every edit path into the story.
  it('notices edits made after the release', () => {
    expect(project(6_000).publication?.hasUnreleasedChanges).toBe(true);
  });

  it('does not call the release itself an unreleased change', () => {
    expect(project(5_000).publication?.hasUnreleasedChanges).toBe(false);
  });

  it('still reports publication before the scenes are hydrated', () => {
    const pending = buildStudioProject(
      {
        id: 'story_1',
        title: 'A Novel',
        startSceneId: 'start',
        createdAt: 1,
        updatedAt: 4_000,
        sceneCount: 3,
      },
      [],
      { hydrated: false, published },
    );
    expect(pending.status).toBe('pending');
    expect(pending.publication?.version).toBe('1.2.0');
  });
});
