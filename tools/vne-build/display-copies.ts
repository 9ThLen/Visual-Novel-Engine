/**
 * Display-size copies of a release's pictures, for the comic frame in an
 * Android build (src/lib/comic/comic-picture-size.ts says why, and how large).
 *
 * The frame is a WebView, and a WebView decodes a picture at its full size
 * whatever size it draws it at. On the web the host makes a copy in a canvas
 * before handing a picture over (src/lib/display-copies.ts); a phone has no
 * such canvas outside the WebView, and making copies there would decode every
 * original on the very device that cannot afford it. So the copies are made
 * here, when a release is staged, and travel in the APK beside the originals,
 * which the novel keeps drawing.
 *
 * Only pictures a comic can show get one — the backgrounds and the
 * characters' sprites of the scenes the reader reads as a comic — so a story
 * that is all novel ships exactly what it did before.
 */
import fs from 'node:fs';

import { resolveScenePresentation, sceneComicCapabilities } from '@/lib/comic/comic-presentation';
import { comicDisplaySize, type ComicPictureRole } from '@/lib/comic/comic-picture-size';
import { buildReleaseAssetMap } from '@/lib/release/asset-map';
import type { ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';

/**
 * What a copy can be made from. Not GIF, which may move and would be frozen;
 * not SVG, which the WebView draws at the size it needs; not BMP, which the
 * scaler cannot read.
 */
const COPYABLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff']);

/** The copies' format: WebP keeps the opaque backgrounds and the sprites' alpha both small. */
export const DISPLAY_COPY_EXTENSION = '.webp';

/** The scenes the reader reads as a comic, decided the way the reader decides (app/reader.tsx). */
export function comicSceneIds(payload: ReleasePayloadV1): string[] {
  return Object.values(payload.scenes)
    .filter((scene) => resolveScenePresentation(
      undefined,
      null,
      scene.comic,
      sceneComicCapabilities(scene.timeline ?? []),
    ).readAs === 'comic')
    .map((scene) => scene.id);
}

function characterIdsIn(value: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) characterIdsIn(item, found);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'characterId' && typeof item === 'string' && item) found.add(item);
      else characterIdsIn(item, found);
    }
  }
  return found;
}

/**
 * The media files a comic can show (as the boot config's asset map names
 * them, `media/<sha256>.<ext>`), each with every way it is drawn.
 *
 * A scene's backgrounds are its opening one and every one a step sets. A
 * character's sprite is any of its sprites: a panel draws the expression of
 * its moment, and the copies of the others cost a little APK, not memory.
 */
export function comicPictureFiles(
  payload: ReleasePayloadV1,
  manifest: ReleaseManifestV1,
): Map<string, ComicPictureRole[]> {
  const assetMap = buildReleaseAssetMap(manifest);
  const roles = new Map<string, Set<ComicPictureRole>>();
  const add = (reference: unknown, role: ComicPictureRole) => {
    if (typeof reference !== 'string' || !reference) return;
    const file = assetMap[reference] ?? assetMap[reference.replace('bundle://', '')];
    if (!file) return;
    const known = roles.get(file);
    if (known) known.add(role);
    else roles.set(file, new Set([role]));
  };

  const characterIds = new Set<string>();
  for (const sceneId of comicSceneIds(payload)) {
    const scene = payload.scenes[sceneId];
    add(scene.sceneState?.backgroundAssetId, 'background');
    for (const step of scene.timeline ?? []) {
      if (step.blockType === 'background') add((step.data as { assetId?: unknown }).assetId, 'background');
    }
    characterIdsIn(scene, characterIds);
  }
  for (const character of payload.characters ?? []) {
    if (!characterIds.has(character.id)) continue;
    for (const sprite of character.sprites ?? []) {
      add(sprite.uri, 'sprite');
      add(sprite.assetUri, 'sprite');
    }
  }

  return new Map([...roles].map(([file, used]) => [file, [...used].sort()]));
}

/** Whether a file can have a copy made of it at all, by its name. */
export function isCopyablePicture(file: string): boolean {
  const dot = file.lastIndexOf('.');
  return dot >= 0 && COPYABLE_EXTENSIONS.has(file.slice(dot).toLowerCase());
}

/**
 * Makes the copy of the picture in `file` for the given roles, or answers null
 * when the original will do: it is small enough already, or it moves.
 */
export type DisplayCopyMaker = (file: string, roles: readonly ComicPictureRole[]) => Promise<Uint8Array | null>;

/**
 * The maker the staging uses: sharp, loaded only when a release has comics
 * to make copies for.
 */
export const makeDisplayCopyWithSharp: DisplayCopyMaker = async (file, roles) => {
  const { default: sharp } = await import('sharp');
  const input = fs.readFileSync(file);
  const metadata = await sharp(input).metadata();
  // A moving picture keeps its original: a copy would be its first frame.
  if ((metadata.pages ?? 1) > 1) return null;
  // Sized and drawn upright, as the WebView draws a picture an EXIF orientation turns.
  const { width, height } = metadata.autoOrient;
  const size = comicDisplaySize(roles, width, height);
  if (!size) return null;
  const copy = await sharp(input)
    .autoOrient()
    .resize({ width: size.width, height: size.height, fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality: 85, alphaQuality: 90, effort: 5 })
    .toBuffer();
  return new Uint8Array(copy);
};
