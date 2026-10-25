/**
 * A release for measuring the comic frame's memory on a device: a long strip
 * of the demo's full-size art read as one comic (docs/plans/
 * COMIC-RENDERER-SPIKE.md, section 9).
 *
 * The spike's strip was 24 pages of the six demo backgrounds (2508×1672) and
 * the demo sprites. This is its match through the real reader: 24 scenes read
 * as comics one after another, which the reading session keeps as one strip.
 * Each has its own background (a scene has one), two of the four 1024×1536
 * demo characters, and three sentences — 72 panels — and the last ends on a
 * choice. The characters come as a library, which is what a comic's sprites
 * are resolved through.
 *
 * Usage:
 *   pnpm exec tsx tools/comic-measure/long-comic-story.ts --out comic-measure.vnerelease
 *
 * Writes the story JSON beside the release and makes the release with
 * scripts/make-demo-release.ts, every scene set to be a comic.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const LONG_COMIC_STORY_ID = 'comic-measure';

const BACKGROUNDS = [
  'bg-grand-hall',
  'bg-ancient-library',
  'bg-hall-mirrors',
  'bg-museum-entrance',
  'bg-treasure-chamber',
  'bg-upper-library',
].map((name) => `assets/background/${name}.png`);

const CHARACTERS = ['analyst', 'curator', 'maker', 'oracle'].map((name) => ({
  id: `char_demo_${name}`,
  name: name[0].toUpperCase() + name.slice(1),
  sprite: `assets/charakters/char-demo-${name}.png`,
}));

const SCENES = 24;

const sceneId = (index: number) => `comic_${String(index + 1).padStart(2, '0')}`;

function step(id: string, blockType: string, data: Record<string, unknown>) {
  return { id, blockType, data, enabled: true, collapsed: false };
}

export function longComicStory() {
  const scenes: Record<string, unknown> = {};
  for (let index = 0; index < SCENES; index += 1) {
    const id = sceneId(index);
    const background = BACKGROUNDS[index % BACKGROUNDS.length];
    const left = CHARACTERS[index % CHARACTERS.length];
    const right = CHARACTERS[(index + 1) % CHARACTERS.length];
    scenes[id] = {
      id,
      text: '',
      backgroundImageUri: background,
      characters: [],
      choices: [],
      blocks: [
        step(`${id}_bg`, 'background', { assetId: background, transition: 'fade', duration: 0 }),
        ...([[left, 'left'], [right, 'right']] as const).map(([character, position]) =>
          step(`${id}_${character.id}`, 'character', {
            action: 'show',
            characterId: character.id,
            spriteId: character.sprite,
            position,
            transition: 'fade',
          })),
        step(`${id}_text`, 'text', {
          content: `Room ${index + 1} opens onto another gallery. The lamps hum along the walls.`,
          typewriterSpeed: 0.5,
          anchorTo: 'background',
        }),
        step(`${id}_line`, 'dialogue', {
          entries: [{ id: `${id}_line_a`, characterId: left.id, text: `We have walked through ${index + 1} rooms now.` }],
          currentEntryIndex: 0,
        }),
        // The strip waits at its end on a choice, so taps past the last panel
        // change nothing and the whole strip stays to be scrolled.
        ...(index + 1 < SCENES ? [] : [step(`${id}_again`, 'choice', {
          options: [{ id: `${id}_again_option`, text: 'Walk the rooms again', targetSceneId: sceneId(0) }],
        })]),
      ],
      ...(index + 1 < SCENES ? { autoAdvance: { enabled: true, delay: 0, nextSceneId: sceneId(index + 1) } } : {}),
    };
  }

  return {
    id: LONG_COMIC_STORY_ID,
    title: 'Comic memory measure',
    description: 'A long comic strip of the demo art, for measuring the comic frame on a device.',
    author: 'Visual Novel Engine',
    startSceneId: sceneId(0),
    scenes,
    characters: CHARACTERS.map((character) => ({
      id: character.id,
      name: character.name,
      sprites: [{ id: character.sprite, name: 'Default', uri: character.sprite, createdAt: 0 }],
      defaultSpriteId: character.sprite,
      createdAt: 0,
    })),
  };
}

function main(): void {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  if (!out) {
    console.error('Usage: tsx tools/comic-measure/long-comic-story.ts --out <file.vnerelease>');
    process.exit(1);
  }
  const story = longComicStory();
  const storyFile = out.replace(/\.vnerelease$/i, '') + '.story.json';
  fs.mkdirSync(path.dirname(path.resolve(storyFile)), { recursive: true });
  fs.writeFileSync(storyFile, `${JSON.stringify(story, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
    path.join(process.cwd(), 'scripts/make-demo-release.ts'),
    '--story', storyFile,
    '--out', out,
    ...Object.keys(story.scenes).flatMap((id) => ['--comic', id]),
  ], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

main();
