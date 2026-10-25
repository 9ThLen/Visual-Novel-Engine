/**
 * Display-size copies an Android release carries for the comic frame.
 *
 * The frame is a WebView and decodes what it is given at full size, so
 * staging makes a copy of each picture a comic can show and the player hands
 * the frame that (src/lib/comic/comic-picture-size.ts). What is decided here
 * is which pictures get one and how large it is; a picture left out is one
 * the frame gets whole, which is how a phone runs out of memory mid-scroll.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp, { type Sharp } from 'sharp';

import {
  comicPictureFiles,
  comicSceneIds,
  isCopyablePicture,
  makeDisplayCopyWithSharp,
} from '../../../tools/vne-build/display-copies';
import type { ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';

function step(id: string, blockType: string, data: Record<string, unknown>) {
  return { id, blockType, data, enabled: true, collapsed: false };
}

function scene(id: string, options: { comic?: boolean; background?: string; timeline?: unknown[] } = {}) {
  return {
    id,
    name: id,
    timeline: options.timeline ?? [],
    sceneState: { backgroundAssetId: options.background ?? null, characters: [] },
    ...(options.comic ? { comic: { presentation: 'comic' } } : {}),
  };
}

function manifest(references: Record<string, string>): ReleaseManifestV1 {
  return {
    assets: Object.entries(references).map(([reference, sha]) => ({
      assetId: `asset-${sha}`,
      sourceReferences: [reference],
      sha256: sha,
      size: 1,
      kind: 'image',
      mimeType: 'image/png',
      originalExtension: '.png',
    })),
  } as unknown as ReleaseManifestV1;
}

const MANIFEST = manifest({
  'idb-media://hall': 'hall',
  'idb-media://library': 'library',
  'idb-media://novel-only': 'novel',
  'idb-media://ann-smile': 'annsmile',
  'idb-media://ann-sad': 'annsad',
  'idb-media://bob': 'bob',
  'idb-media://theme': 'theme',
});

const CHARACTERS = [
  { id: 'ann', sprites: [{ id: 'smile', uri: 'idb-media://ann-smile' }, { id: 'sad', uri: 'idb-media://ann-sad' }] },
  { id: 'bob', sprites: [{ id: 'plain', uri: 'idb-media://bob' }] },
];

function payload(scenes: ReturnType<typeof scene>[]): ReleasePayloadV1 {
  return {
    scenes: Object.fromEntries(scenes.map((item) => [item.id, item])),
    characters: CHARACTERS,
    audioLibrary: [],
  } as unknown as ReleasePayloadV1;
}

describe('the scenes a release reads as a comic', () => {
  it('are the ones set to be a comic that a comic page can show', () => {
    const release = payload([
      scene('auto'),
      scene('comic', { comic: true }),
      scene('blocked', { comic: true, timeline: [step('obj', 'interactive_object', {})] }),
    ]);
    expect(comicSceneIds(release)).toEqual(['comic']);
  });
});

describe('the pictures a comic can show', () => {
  it('are none in a story read all as the novel, which ships what it did before', () => {
    const release = payload([scene('s1', { background: 'idb-media://hall' })]);
    expect(comicPictureFiles(release, MANIFEST).size).toBe(0);
  });

  it('are a comic scene\'s backgrounds and the sprites of its characters, by media file', () => {
    const release = payload([
      scene('s1', {
        comic: true,
        background: 'idb-media://hall',
        timeline: [
          step('bg', 'background', { assetId: 'idb-media://library' }),
          step('ann', 'character', { characterId: 'ann', spriteId: 'smile', action: 'show' }),
        ],
      }),
      scene('s2', {
        background: 'idb-media://novel-only',
        timeline: [step('bob', 'character', { characterId: 'bob', action: 'show' })],
      }),
    ]);

    expect(Object.fromEntries(comicPictureFiles(release, MANIFEST))).toEqual({
      'media/hall.png': ['background'],
      'media/library.png': ['background'],
      // Every expression: a panel draws the one of its moment.
      'media/annsmile.png': ['sprite'],
      'media/annsad.png': ['sprite'],
    });
  });

  it('finds a character that only speaks in a dialogue line', () => {
    const release = payload([
      scene('s1', {
        comic: true,
        timeline: [step('line', 'dialogue', { entries: [{ id: 'e1', characterId: 'bob', text: 'Hi.' }] })],
      }),
    ]);
    expect([...comicPictureFiles(release, MANIFEST).keys()]).toEqual(['media/bob.png']);
  });

  it('remembers both ways a picture is drawn', () => {
    const release = payload([
      scene('s1', {
        comic: true,
        background: 'idb-media://bob',
        timeline: [step('bob', 'character', { characterId: 'bob', action: 'show' })],
      }),
    ]);
    expect(comicPictureFiles(release, MANIFEST).get('media/bob.png')).toEqual(['background', 'sprite']);
  });

  it('skips a reference the release did not package', () => {
    const release = payload([scene('s1', { comic: true, background: 'idb-media://elsewhere' })]);
    expect(comicPictureFiles(release, MANIFEST).size).toBe(0);
  });
});

describe('what a copy can be made from', () => {
  it('is a still picture the scaler reads', () => {
    for (const file of ['a.png', 'a.JPG', 'a.jpeg', 'a.webp', 'a.avif', 'a.tiff']) expect(isCopyablePicture(file)).toBe(true);
    // A GIF may move, an SVG is drawn at the size it needs, a sound is not a picture.
    for (const file of ['a.gif', 'a.svg', 'a.bmp', 'a.mp3', 'noextension']) expect(isCopyablePicture(file)).toBe(false);
  });
});

describe('a display copy made with sharp', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vne-display-copy-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function picture(name: string, image: Sharp): Promise<string> {
    const file = path.join(dir, name);
    fs.writeFileSync(file, new Uint8Array(await image.toBuffer()));
    return file;
  }

  const solid = (width: number, height: number, channels: 3 | 4 = 3) =>
    sharp({ create: { width, height, channels, background: { r: 120, g: 80, b: 40, alpha: 0.5 } } });

  it('is a WebP just large enough to cover a panel, from a demo-sized background', async () => {
    const file = await picture('hall.png', solid(2508, 1672).png());
    const copy = await makeDisplayCopyWithSharp(file, ['background']);
    const metadata = await sharp(copy as Uint8Array).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 1600, height: 1067 });
  });

  it('keeps a sprite\'s transparency', async () => {
    const file = await picture('ann.png', solid(1024, 1536, 4).png());
    const metadata = await sharp(await makeDisplayCopyWithSharp(file, ['sprite']) as Uint8Array).metadata();
    expect(metadata).toMatchObject({ width: 800, height: 1200, hasAlpha: true });
  });

  it('is drawn upright from a photo its EXIF turns on its side', async () => {
    // Stored 1672×2508, shown 2508×1672.
    const file = await picture('photo.jpg', solid(1672, 2508).jpeg().withMetadata({ orientation: 6 }));
    const metadata = await sharp(await makeDisplayCopyWithSharp(file, ['background']) as Uint8Array).metadata();
    expect(metadata).toMatchObject({ width: 1600, height: 1067 });
    expect(metadata.orientation ?? 1).toBe(1);
  });

  it('is not made of a picture already about the size it is drawn', async () => {
    const file = await picture('small.png', solid(1254, 1254).png());
    expect(await makeDisplayCopyWithSharp(file, ['background'])).toBeNull();
  });

  it('is not made of a picture that moves', async () => {
    const frame = (red: number) => sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: red, g: 0, b: 0 } } }).png().toBuffer();
    const file = await picture('moving.webp', sharp([await frame(255), await frame(0)], { join: { animated: true } }).webp());
    expect(await makeDisplayCopyWithSharp(file, ['background'])).toBeNull();
  });

  it('fails on a picture that is not one, for staging to name', async () => {
    const file = path.join(dir, 'broken.png');
    fs.writeFileSync(file, 'not a picture');
    await expect(makeDisplayCopyWithSharp(file, ['background'])).rejects.toThrow();
  });
});
