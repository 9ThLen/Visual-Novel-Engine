/**
 * Whether a picture can be an application icon.
 *
 * Both native channels ask the same question of the same file and must give the
 * same answer: a story cover is used when it is square and large enough, and the
 * engine icon stands in when it is not. Two copies of "square and at least
 * 512px" would eventually be two different numbers, and the symptom — one
 * channel showing the cover, the other showing the engine logo, for the same
 * novel — reads as a bug in whichever one the author looked at second.
 */
import fs from 'node:fs';
import path from 'node:path';

/** What the icon generators need of a source: a square PNG, big enough to shrink. */
export const MIN_ICON_SIZE = 512;

export interface PngSize { width: number; height: number }

/**
 * Read a PNG's dimensions from its header.
 *
 * Just the IHDR chunk, which is always the first one and always at the same
 * offset. Enough to answer the only question asked here, and it avoids a decoder
 * dependency for a check that runs once per build.
 */
export function readPngSize(file: string): PngSize | null {
  let handle: number;
  try {
    handle = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const header = new Uint8Array(24);
    const read = fs.readSync(handle, header, 0, 24, 0);
    if (read < 24) return null;
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (signature.some((byte, index) => header[index] !== byte)) return null;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  } finally {
    fs.closeSync(handle);
  }
}

/** Why this file cannot be an application icon, or `null` when it can. */
export function iconSourceProblem(file: string, label: string): string | null {
  const size = readPngSize(file);
  if (!size) return `${label} is not a PNG`;
  if (size.width !== size.height) {
    return `${label} is ${size.width}x${size.height} and an app icon must be square`;
  }
  if (size.width < MIN_ICON_SIZE) {
    return `${label} is only ${size.width}px and an app icon needs at least ${MIN_ICON_SIZE}px`;
  }
  return null;
}

export interface IconChoice {
  file: string;
  /** Said out loud, because a silent fallback to the engine icon looks like a bug. */
  reason: string;
}

export interface IconCandidate {
  file: string;
  /** How to name it in the reason, e.g. "the story cover". */
  label: string;
}

/**
 * The first candidate that can be an icon, or the fallback with the reason it
 * came to that.
 *
 * Covers are usually portrait, so most stories land on the fallback. That is
 * fine, and it is *reported*: an author who wonders why their installer shows
 * the engine logo deserves the actual reason.
 */
export function chooseIconSource(
  candidates: IconCandidate[],
  fallbackIcon: string,
): IconChoice {
  for (const candidate of candidates) {
    const problem = iconSourceProblem(path.resolve(candidate.file), candidate.label);
    if (!problem) return { file: path.resolve(candidate.file), reason: `icons generated from ${candidate.label}` };
    return { file: fallbackIcon, reason: `${problem}, so the engine icon is used instead` };
  }
  return { file: fallbackIcon, reason: 'the story has no cover, so the engine icon is used' };
}
