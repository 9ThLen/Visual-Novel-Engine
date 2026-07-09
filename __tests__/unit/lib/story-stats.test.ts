import { computeStoryStats } from '@/lib/story-stats';
import type { SceneRecord } from '@/lib/engine/types';

function scene(id: string, timeline: SceneRecord['timeline']): SceneRecord {
  return { id, timeline } as unknown as SceneRecord;
}

describe('computeStoryStats', () => {
  it('counts scenes, words, and choice options across blocks', () => {
    const scenes = [
      scene('s1', [
        { id: 't1', blockType: 'text', data: { content: 'Hello there friend' }, collapsed: false, enabled: true },
        {
          id: 'd1',
          blockType: 'dialogue',
          data: { entries: [{ id: 'e1', characterId: 'c', spriteId: 's', text: 'Two words' }], currentEntryIndex: 0 },
          collapsed: false,
          enabled: true,
        },
      ] as unknown as SceneRecord['timeline']),
      scene('s2', [
        {
          id: 'ch1',
          blockType: 'choice',
          data: { options: [{ id: 'o1', text: 'A', targetSceneId: null }, { id: 'o2', text: 'B', targetSceneId: null }] },
          collapsed: false,
          enabled: true,
        },
      ] as unknown as SceneRecord['timeline']),
    ];

    expect(computeStoryStats(scenes)).toEqual({ scenes: 2, words: 5, choices: 2 });
  });

  it('handles empty and missing timelines', () => {
    expect(computeStoryStats([])).toEqual({ scenes: 0, words: 0, choices: 0 });
    expect(computeStoryStats([scene('s1', undefined as unknown as SceneRecord['timeline'])])).toEqual({
      scenes: 1,
      words: 0,
      choices: 0,
    });
  });

  it('does not count inline markup characters as words', () => {
    const plain = [
      scene('s1', [
        { id: 't1', blockType: 'text', data: { content: 'Hello brave world' }, collapsed: false, enabled: true },
      ] as unknown as SceneRecord['timeline']),
    ];
    const marked = [
      scene('s1', [
        {
          id: 't1',
          blockType: 'text',
          data: { content: 'Hello **brave** [color=#ff0000]world[/color]' },
          collapsed: false,
          enabled: true,
        },
      ] as unknown as SceneRecord['timeline']),
    ];
    expect(computeStoryStats(marked).words).toBe(3);
    expect(computeStoryStats(marked).words).toBe(computeStoryStats(plain).words);
  });

  it('ignores whitespace-only text', () => {
    const scenes = [
      scene('s1', [
        { id: 't1', blockType: 'text', data: { content: '   ' }, collapsed: false, enabled: true },
      ] as unknown as SceneRecord['timeline']),
    ];
    expect(computeStoryStats(scenes).words).toBe(0);
  });
});
