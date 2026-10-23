import {
  resolveScenePresentation,
  sanitizeSceneComicSettings,
  sceneComicCapabilities,
  type ReadAs,
  type StoryReadingFormat,
} from '@/lib/comic/comic-presentation';
import { createTextStep } from '@/lib/engine/event-factory';
import type { ScenePresentation, TimelineStep } from '@/lib/engine/types';

const comicPage = { novelOnly: null };

function step(blockType: TimelineStep['blockType'], data: Record<string, unknown>, extra: Partial<TimelineStep> = {}): TimelineStep {
  return { id: `step-${blockType}`, blockType, data, collapsed: false, enabled: true, ...extra } as TimelineStep;
}

const video = (mode: 'play' | 'stop', layer: 'background' | 'cutscene') =>
  step('video', { mode, layer, assetId: 'clip', loop: false, muted: false, volume: 1, fit: 'cover', skippable: true });
const hotspot = step('interactive_object', { objectId: 'door' });

describe('how a scene is read', () => {
  // docs/plans/COMIC-MODE-PLAN.md, section 2: story format × the scene's setting.
  it.each<[StoryReadingFormat | undefined, ScenePresentation | undefined, ReadAs]>([
    [undefined, undefined, 'novel'],
    ['novel', 'auto', 'novel'],
    ['novel', 'comic', 'comic'],
    ['novel', 'novel', 'novel'],
    ['comic', 'auto', 'comic'],
    ['comic', 'comic', 'comic'],
    ['comic', 'novel', 'novel'],
    ['both', 'comic', 'comic'],
    ['both', 'novel', 'novel'],
  ])('a story read as %s, a scene set to %s → %s', (format, presentation, readAs) => {
    const comic = presentation ? { presentation } : undefined;
    expect(resolveScenePresentation(format, null, comic, comicPage).readAs).toBe(readAs);
  });

  it('reads a scene set to Auto in a story that offers both as the reader chose, and as the novel until they have', () => {
    expect(resolveScenePresentation('both', 'comic', undefined, comicPage)).toEqual({ readAs: 'comic', reason: 'reader-choice' });
    expect(resolveScenePresentation('both', 'novel', undefined, comicPage)).toEqual({ readAs: 'novel', reason: 'reader-choice' });
    expect(resolveScenePresentation('both', null, undefined, comicPage)).toEqual({ readAs: 'novel', reason: 'story-format' });
  });

  it('lets the scene setting stand over the reader choice', () => {
    expect(resolveScenePresentation('both', 'comic', { presentation: 'novel' }, comicPage)).toEqual({ readAs: 'novel', reason: 'scene-setting' });
  });

  it('ignores the reader choice in a story that does not offer both', () => {
    expect(resolveScenePresentation('novel', 'comic', undefined, comicPage).readAs).toBe('novel');
  });

  it('reads an unreadable scene setting as Auto', () => {
    expect(resolveScenePresentation('comic', null, { presentation: 'manga' } as never, comicPage))
      .toEqual({ readAs: 'comic', reason: 'story-format' });
  });

  it.each<StoryReadingFormat>(['novel', 'comic', 'both'])(
    'reads a scene a comic page cannot show yet as the novel, even set to always be a comic (%s)',
    (format) => {
      expect(resolveScenePresentation(format, 'comic', { presentation: 'comic' }, { novelOnly: 'video' }))
        .toEqual({ readAs: 'novel', reason: 'video' });
      expect(resolveScenePresentation(format, 'comic', { presentation: 'comic' }, { novelOnly: 'interactive_object' }))
        .toEqual({ readAs: 'novel', reason: 'interactive_object' });
    },
  );
});

describe('what keeps a scene a novel', () => {
  it('is nothing in a scene of words', () => {
    expect(sceneComicCapabilities([createTextStep({ content: 'Words.' })])).toEqual({ novelOnly: null });
    expect(sceneComicCapabilities([])).toEqual({ novelOnly: null });
  });

  it('is a video that plays, on either layer', () => {
    expect(sceneComicCapabilities([video('play', 'background')])).toEqual({ novelOnly: 'video' });
    expect(sceneComicCapabilities([video('play', 'cutscene')])).toEqual({ novelOnly: 'video' });
  });

  it('is not a video step that only stops one', () => {
    expect(sceneComicCapabilities([video('stop', 'background')])).toEqual({ novelOnly: null });
  });

  it('is an interactive object', () => {
    expect(sceneComicCapabilities([createTextStep({ content: 'Look.' }), hotspot])).toEqual({ novelOnly: 'interactive_object' });
  });

  it('counts a step with conditions, since they may hold, and not a switched-off step', () => {
    const conditions: TimelineStep['conditions'] = [{ variableName: 'seen', operator: '==', value: true }];
    expect(sceneComicCapabilities([{ ...video('play', 'cutscene'), conditions }])).toEqual({ novelOnly: 'video' });
    expect(sceneComicCapabilities([{ ...video('play', 'cutscene'), enabled: false }, { ...hotspot, enabled: false }]))
      .toEqual({ novelOnly: null });
  });
});

describe('a scene comic setting as it is kept', () => {
  it('keeps Always comic and Always novel', () => {
    expect(sanitizeSceneComicSettings({ presentation: 'comic' })).toEqual({ presentation: 'comic' });
    expect(sanitizeSceneComicSettings({ presentation: 'novel' })).toEqual({ presentation: 'novel' });
  });

  it.each([
    ['Auto', { presentation: 'auto' }], ['an unknown presentation', { presentation: 'manga' }], ['no presentation', {}],
    ['a string', 'comic'], ['an array', ['comic']], ['null', null], ['undefined', undefined],
  ])('keeps nothing for %s', (_label, value) => {
    expect(sanitizeSceneComicSettings(value)).toBeUndefined();
  });

  it('keeps only what it knows', () => {
    expect(sanitizeSceneComicSettings({ presentation: 'comic', panels: [{ anchor: 'x/p0/s0' }] })).toEqual({ presentation: 'comic' });
  });
});
