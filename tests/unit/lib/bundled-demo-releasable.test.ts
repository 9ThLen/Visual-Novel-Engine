/**
 * The stories the engine ships must be publishable.
 *
 * This had never been true. Every bundled demo failed the release gate, so the
 * publish flow could only ever be exercised by injecting a release into storage
 * by hand — the one path an author actually takes was the one path nothing
 * tested. Two separate reasons, both fixed, both worth keeping fixed:
 *
 * - A legacy scene names its cast inline (`{ id, uri, name, expression }`) and
 *   the conversion turns each into a sprite reference. Nothing built the
 *   character library those references point at, so the doctor reported
 *   `asset.missingCharacterSprite` on every scene with a character in it. The
 *   story played — the uri was right there — but nothing could confirm the
 *   sprite existed.
 * - The demo JSONs carried no cover, content rating or languages, which a
 *   storefront release requires and an author would have had to invent.
 *
 * Asserting `ready` rather than an empty blocker list on purpose: warnings are
 * allowed to appear and change, and a demo that must be warning-free would be a
 * demo nobody could edit.
 */
import demoStory from '@/assets/demo-story.json';
import demoStoryAdvanced from '@/assets/demo-story-advanced.json';
import { runReleasePreflight } from '@/lib/release/preflight';
import {
  buildCanonicalSceneRecordsFromLegacyScenes,
  deriveCharacterLibraryFromLegacyStory,
  type Story,
} from '@/lib/scene-operations';
import { normalizeStoryMetadata } from '@/lib/story-domain';

const BUNDLED: [string, unknown][] = [
  ['demo-story.json', demoStory],
  ['demo-story-advanced.json', demoStoryAdvanced],
];

function gate(raw: unknown) {
  const story = raw as Story & { startSceneId: string; id: string };
  const scenes = Object.values(
    buildCanonicalSceneRecordsFromLegacyScenes(story.id, story.scenes ?? {}, story.startSceneId),
  );
  return runReleasePreflight({
    metadata: normalizeStoryMetadata({ ...(raw as object), sceneCount: scenes.length } as never),
    scenes,
    characters: deriveCharacterLibraryFromLegacyStory(story),
    channel: 'both',
    version: '1.0.0',
    previousVersion: null,
  });
}

describe('the stories the engine ships', () => {
  it.each(BUNDLED)('%s passes the release gate', (name, raw) => {
    const report = gate(raw);
    expect(
      report.blockers.map((blocker) => `${blocker.code}${blocker.sceneId ? ` @${blocker.sceneId}` : ''}`),
      name,
    ).toEqual([]);
    expect(report.ready, name).toBe(true);
  });

  it.each(BUNDLED)('%s declares the cast its scenes use', (name, raw) => {
    const story = raw as Story;
    const cast = deriveCharacterLibraryFromLegacyStory(story);
    expect(cast.length, name).toBeGreaterThan(0);

    for (const character of cast) {
      expect(character.name, `${name}: ${character.id} has no name`).toBeTruthy();
      expect(character.sprites.length, `${name}: ${character.id} has no sprite`).toBeGreaterThan(0);
      // The sprite id has to be the uri: that is what the scene conversion
      // writes, and what the doctor matches on. A prettier id would produce a
      // library that looks right and answers nothing.
      for (const sprite of character.sprites) expect(sprite.id, name).toBe(sprite.uri);
      expect(character.defaultSpriteId, name).toBe(character.sprites[0].id);
    }
  });

  /**
   * The gate is worth having only if it still refuses something. Take the
   * publication metadata away and it must object again.
   */
  it('still refuses a story that is missing what a storefront needs', () => {
    const stripped = { ...(demoStory as object) } as Record<string, unknown>;
    delete stripped.thumbnailUri;
    delete stripped.contentRating;
    delete stripped.languages;

    const codes = gate(stripped).blockers.map((blocker) => blocker.code);
    expect(codes).toContain('release.missingCover');
    expect(codes).toContain('release.missingContentRating');
    expect(codes).toContain('release.missingLanguages');
  });
});
