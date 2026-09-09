import {
  applyAiAppearancePatch,
  computeAppearanceRevision,
  describeAiAppearancePatch,
  validateAiAppearancePatch,
  type AiReaderAppearancePatch,
} from '@/lib/ai/appearance-patch';
import type { StoryMetadata } from '@/lib/story-domain';

function story(theme?: StoryMetadata['theme']): StoryMetadata {
  return {
    id: 'story-1',
    title: 'Story',
    startSceneId: 'scene-1',
    createdAt: 1,
    updatedAt: 1,
    sceneCount: 1,
    theme,
  };
}

function patch(metadata: StoryMetadata, overrides: Partial<AiReaderAppearancePatch> = {}): AiReaderAppearancePatch {
  return {
    storyId: metadata.id,
    expectedRevision: computeAppearanceRevision(metadata),
    theme: { dialogueBg: '#000000', dialogueText: '#ffffff' },
    explanation: 'Darken the dialogue box',
    ...overrides,
  };
}

describe('computeAppearanceRevision', () => {
  it('is stable across key order and changes when a color changes', () => {
    const a = story({ dialogueBg: '#111111', dialogueText: '#eeeeee' });
    const b = story({ dialogueText: '#eeeeee', dialogueBg: '#111111' });
    expect(computeAppearanceRevision(a)).toBe(computeAppearanceRevision(b));

    const changed = story({ dialogueBg: '#222222', dialogueText: '#eeeeee' });
    expect(computeAppearanceRevision(changed)).not.toBe(computeAppearanceRevision(a));
  });

  it('is unaffected by non-theme metadata', () => {
    const base = story({ dialogueBg: '#111111' });
    const renamed: StoryMetadata = { ...base, title: 'Renamed', updatedAt: 999 };
    expect(computeAppearanceRevision(renamed)).toBe(computeAppearanceRevision(base));
  });

  it('changes when only the reader layout preset changes', () => {
    const base = story();
    expect(computeAppearanceRevision({ ...base, readerLayoutPreset: 'compact' }))
      .not.toBe(computeAppearanceRevision(base));
  });
});

describe('validateAiAppearancePatch', () => {
  it('accepts a well-formed patch', () => {
    const metadata = story();
    expect(validateAiAppearancePatch(metadata, patch(metadata))).toMatchObject({ ok: true });
  });

  it('accepts a preset-only patch', () => {
    const metadata = story();
    expect(validateAiAppearancePatch(metadata, patch(metadata, { theme: undefined, layoutPreset: 'top' })))
      .toMatchObject({ ok: true });
  });

  it('rejects a stale revision', () => {
    const metadata = story({ dialogueBg: '#123456' });
    const stale = patch(metadata, { expectedRevision: 'outdated' });
    expect(validateAiAppearancePatch(metadata, stale)).toMatchObject({ ok: false, code: 'STALE_REVISION' });
  });

  it('rejects a non-hex color', () => {
    const metadata = story();
    const bad = patch(metadata, { theme: { dialogueBg: 'rgb(0,0,0)' } as never });
    const result = validateAiAppearancePatch(metadata, bad);
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('rejects a patch that changes nothing', () => {
    const metadata = story();
    const empty = patch(metadata, { theme: {} });
    expect(validateAiAppearancePatch(metadata, empty)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('rejects a patch aimed at another story', () => {
    const metadata = story();
    const wrong = patch(metadata, { storyId: 'other-story' });
    expect(validateAiAppearancePatch(metadata, wrong)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('warns — but does not block — on low contrast', () => {
    const metadata = story();
    const lowContrast = patch(metadata, { theme: { dialogueBg: '#bbbbbb', dialogueText: '#aaaaaa' } });
    const result = validateAiAppearancePatch(metadata, lowContrast);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/contrast/i);
    }
  });
});

describe('applyAiAppearancePatch', () => {
  it('merges over the existing theme without touching untouched keys', () => {
    const metadata = story({ dialogueBg: '#111111', nameText: '#abcdef' });
    const result = applyAiAppearancePatch(metadata, patch(metadata));

    expect(result).toEqual({ dialogueBg: '#000000', dialogueText: '#ffffff', nameText: '#abcdef' });
    expect(metadata.theme).toEqual({ dialogueBg: '#111111', nameText: '#abcdef' });
  });

  it('normalizes shorthand hex through the theme sanitizer', () => {
    const metadata = story();
    const shorthand = patch(metadata, { theme: { dialogueBg: '#ABC' } });
    expect(applyAiAppearancePatch(metadata, shorthand).dialogueBg).toBe('#aabbcc');
  });
});

describe('describeAiAppearancePatch', () => {
  it('lists only the colors that actually change, with before and after', () => {
    const metadata = story({ dialogueBg: '#111111', dialogueText: '#ffffff' });
    const description = describeAiAppearancePatch(metadata, patch(metadata));

    // dialogueText is already #ffffff, so only dialogueBg is a change.
    expect(description.colors).toEqual([{ key: 'dialogueBg', before: '#111111', after: '#000000' }]);
  });

  it('reports a previously unset color as null', () => {
    const metadata = story();
    const description = describeAiAppearancePatch(metadata, patch(metadata));
    expect(description.colors).toContainEqual({ key: 'dialogueBg', before: null, after: '#000000' });
  });

  it('describes a preset-only before and after row', () => {
    const metadata = story();
    const description = describeAiAppearancePatch(metadata, patch(metadata, { theme: undefined, layoutPreset: 'top' }));
    expect(description.colors).toEqual([]);
    expect(description.layoutPreset).toEqual({ before: 'classic', after: 'top' });
  });
});
