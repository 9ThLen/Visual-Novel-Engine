import {
  MAX_STORY_CONTENT_WARNINGS,
  MAX_STORY_CREDITS,
  MAX_STORY_LANGUAGES,
  MAX_STORY_LICENCE_LENGTH,
  sanitizeContentRating,
  sanitizeContentWarnings,
  sanitizeStoryCredits,
  sanitizeStoryLanguages,
  sanitizeStoryLicence,
  sanitizeStoryPublication,
} from '@/lib/story-publication';
import { normalizeStoryMetadata, type StoryMetadata } from '@/lib/story-domain';

describe('sanitizeContentRating', () => {
  it.each(['everyone', 'teen', 'mature'])('accepts %s', (rating) => {
    expect(sanitizeContentRating(rating)).toBe(rating);
  });

  it.each([['adults'], [''], [null], [undefined], [3], [{}]])('rejects %o', (value) => {
    expect(sanitizeContentRating(value)).toBeUndefined();
  });
});

describe('sanitizeStoryLanguages', () => {
  it('keeps well-formed tags', () => {
    expect(sanitizeStoryLanguages(['uk', 'en-GB', 'zh-Hans-CN'])).toEqual(['uk', 'en-GB', 'zh-Hans-CN']);
  });

  it('trims surrounding space', () => {
    expect(sanitizeStoryLanguages([' uk '])).toEqual(['uk']);
  });

  it('drops malformed tags rather than the whole list', () => {
    expect(sanitizeStoryLanguages(['uk', 'en_GB', 'u', 'ukrainian!', 42])).toEqual(['uk']);
  });

  it('deduplicates case-insensitively, keeping the first spelling', () => {
    expect(sanitizeStoryLanguages(['en-GB', 'en-gb', 'EN-GB'])).toEqual(['en-GB']);
  });

  it('returns undefined rather than an empty array', () => {
    expect(sanitizeStoryLanguages([])).toBeUndefined();
    expect(sanitizeStoryLanguages(['nope!'])).toBeUndefined();
    expect(sanitizeStoryLanguages('uk')).toBeUndefined();
  });

  it('caps the list', () => {
    const many = Array.from(
      { length: MAX_STORY_LANGUAGES + 5 },
      (_, i) => `en-${String(i).padStart(2, '0')}`,
    );
    expect(sanitizeStoryLanguages(many)).toHaveLength(MAX_STORY_LANGUAGES);
  });
});

describe('sanitizeContentWarnings', () => {
  it('trims, deduplicates and drops blanks', () => {
    expect(sanitizeContentWarnings([' violence ', 'Violence', '', '  '])).toEqual(['violence']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_STORY_CONTENT_WARNINGS + 5 }, (_, i) => `warning ${i}`);
    expect(sanitizeContentWarnings(many)).toHaveLength(MAX_STORY_CONTENT_WARNINGS);
  });

  it('returns undefined for nothing usable', () => {
    expect(sanitizeContentWarnings([])).toBeUndefined();
    expect(sanitizeContentWarnings(null)).toBeUndefined();
  });
});

describe('sanitizeStoryLicence', () => {
  it('trims', () => {
    expect(sanitizeStoryLicence('  CC-BY-4.0 ')).toBe('CC-BY-4.0');
  });

  it('truncates rather than rejecting', () => {
    expect(sanitizeStoryLicence('x'.repeat(MAX_STORY_LICENCE_LENGTH + 50)))
      .toHaveLength(MAX_STORY_LICENCE_LENGTH);
  });

  it('returns undefined for a blank licence', () => {
    expect(sanitizeStoryLicence('   ')).toBeUndefined();
    expect(sanitizeStoryLicence(7)).toBeUndefined();
  });
});

describe('sanitizeStoryCredits', () => {
  it('keeps a complete credit', () => {
    expect(sanitizeStoryCredits([
      { role: 'art', name: 'An Artist', source: 'commission', licence: 'CC-BY-4.0' },
    ])).toEqual([{ role: 'art', name: 'An Artist', source: 'commission', licence: 'CC-BY-4.0' }]);
  });

  it('omits empty optional fields instead of storing them blank', () => {
    expect(sanitizeStoryCredits([{ role: 'art', name: 'An Artist', source: '  ' }]))
      .toEqual([{ role: 'art', name: 'An Artist' }]);
  });

  it('drops a credit missing a role or a name', () => {
    expect(sanitizeStoryCredits([
      { role: 'art' },
      { name: 'An Artist' },
      { role: '  ', name: 'An Artist' },
    ])).toBeUndefined();
  });

  it('ignores entries that are not objects', () => {
    expect(sanitizeStoryCredits(['art', null, [], { role: 'music', name: 'A Composer' }]))
      .toEqual([{ role: 'music', name: 'A Composer' }]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_STORY_CREDITS + 5 }, (_, i) => ({
      role: 'art',
      name: `Artist ${i}`,
    }));
    expect(sanitizeStoryCredits(many)).toHaveLength(MAX_STORY_CREDITS);
  });
});

describe('sanitizeStoryPublication', () => {
  it('returns only the fields that survived', () => {
    expect(sanitizeStoryPublication({
      contentRating: 'nope' as never,
      languages: ['uk'],
      credits: [],
    })).toEqual({ languages: ['uk'] });
  });

  it('treats only an explicit true as an AI disclosure', () => {
    expect(sanitizeStoryPublication({ aiAssisted: true }).aiAssisted).toBe(true);
    expect(sanitizeStoryPublication({ aiAssisted: false }).aiAssisted).toBeUndefined();
    expect(sanitizeStoryPublication({}).aiAssisted).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = sanitizeStoryPublication({
      contentRating: 'teen',
      languages: ['uk', 'uk'],
      contentWarnings: [' blood '],
      licence: ' CC0 ',
      credits: [{ role: 'art', name: 'A' }],
      aiAssisted: true,
    });
    expect(sanitizeStoryPublication(once)).toEqual(once);
  });
});

describe('normalizeStoryMetadata with publication fields', () => {
  function metadata(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
    return {
      id: 'story_1',
      title: 'A Novel',
      startSceneId: 'scene_1',
      createdAt: 1,
      updatedAt: 2,
      sceneCount: 1,
      ...overrides,
    };
  }

  it('leaves a story without publication fields untouched', () => {
    const source = metadata();
    expect(normalizeStoryMetadata(source)).toEqual(source);
  });

  it('cleans publication fields at the normalization boundary', () => {
    const normalized = normalizeStoryMetadata(metadata({
      contentRating: 'adults' as never,
      languages: ['uk', 'en_GB'],
      licence: '   ',
    }));
    expect(normalized.contentRating).toBeUndefined();
    expect(normalized.languages).toEqual(['uk']);
    expect(normalized).not.toHaveProperty('licence');
  });

  it('deletes rather than nulls the keys it drops', () => {
    const normalized = normalizeStoryMetadata(metadata({ contentRating: 'bad' as never }));
    expect('contentRating' in normalized).toBe(false);
  });

  it('is idempotent over publication fields', () => {
    const once = normalizeStoryMetadata(metadata({
      contentRating: 'mature',
      languages: ['uk'],
      credits: [{ role: 'art', name: 'A' }],
    }));
    expect(normalizeStoryMetadata(once)).toEqual(once);
  });
});
