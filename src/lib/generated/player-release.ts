/**
 * The release a native player build carries — empty in this repository.
 *
 * `tools/vne-build/stage-android.ts` overwrites this file in the *staged* copy
 * of the project with one static `require` per media object, which is the only
 * form Metro can see. Here it stays null: the studio is not a player, and a
 * committed release would be a story checked into an engine.
 */
import type { PackagedRelease } from '@/lib/release/packaged-release';

export const PACKAGED_RELEASE: PackagedRelease | null = null;
