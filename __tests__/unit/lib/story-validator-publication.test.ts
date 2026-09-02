/**
 * What survives the story validator.
 *
 * It rebuilds a story from an explicit list of fields, which is the right shape
 * for a boundary that takes untrusted JSON — and the reason this went wrong. The
 * list did not include the publication metadata, so a content rating and a
 * language declaration were dropped by the one funnel every story passes
 * through: bundled demos at boot, and anything imported.
 *
 * The loss was silent and surfaced far away. Both fields are release blockers,
 * so what an author saw was a story that could not be published and a gate that
 * would not say why they had lost the answer they had already given.
 */
import { StoryValidator } from '@/lib/story-validator';

function story(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'story_1',
    title: 'Rain',
    startSceneId: 'scene_1',
    scenes: { scene_1: { id: 'scene_1', text: 'Hello.' } },
    ...overrides,
  };
}

describe('the story validator and publication metadata', () => {
  it('keeps a content rating and the declared languages', () => {
    const validated = StoryValidator.validateStory(
      story({ contentRating: 'teen', languages: ['en', 'uk'] }),
    ) as unknown as Record<string, unknown>;

    expect(validated.contentRating).toBe('teen');
    expect(validated.languages).toEqual(['en', 'uk']);
  });

  it('keeps the rest of what a storefront asks for', () => {
    const validated = StoryValidator.validateStory(story({
      contentWarnings: ['Flashing images'],
      licence: 'CC BY 4.0',
      aiAssisted: true,
    })) as unknown as Record<string, unknown>;

    expect(validated.contentWarnings).toEqual(['Flashing images']);
    expect(validated.licence).toBe('CC BY 4.0');
    expect(validated.aiAssisted).toBe(true);
  });

  /**
   * Carried through the same sanitizer the editor uses, not copied. A validator
   * that accepted whatever it was handed would be a hole in the boundary it
   * exists to be.
   */
  it('refuses values it would not accept from an author', () => {
    const validated = StoryValidator.validateStory(story({
      contentRating: 'catastrophic',
      languages: ['en', 42, 'not a language tag at all'],
    })) as unknown as Record<string, unknown>;

    expect(validated.contentRating).toBeUndefined();
    expect(validated.languages).toEqual(['en']);
  });

  it('leaves a story that declares nothing alone', () => {
    const validated = StoryValidator.validateStory(story()) as unknown as Record<string, unknown>;

    expect(validated.contentRating).toBeUndefined();
    expect(validated.languages).toBeUndefined();
    expect(validated.title).toBe('Rain');
  });
});
