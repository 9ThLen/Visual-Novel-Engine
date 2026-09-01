/**
 * What turns a player shell plus a release into a playable folder.
 *
 * Two places do this: `scripts/export-story-web.ts`, which unpacks a release
 * next to a fresh Expo build, and `lib/release/shell-build.ts`, which does it
 * inside the running app against a prebuilt shell. They must produce the same
 * bundle — an author who exports from the studio and an author who runs the
 * script are publishing the same story — so the parts that decide what a bundle
 * *is* live here rather than in either caller.
 *
 * Free of React Native imports on purpose: the script runs this under Node.
 */
import { PLAYER_CONFIG_GLOBAL, PLAYER_CONFIG_VERSION } from '@/lib/player-mode';
import { buildReleaseAssetMap, type ReleaseAssetMap } from '@/lib/release/asset-map';
import type { ReleaseManifestV1, ReleasePayloadV1 } from '@/lib/release/types';

// Defined by the side that reads them, re-exported so a producer never has to
// guess the name of the global it is writing into.
export { PLAYER_CONFIG_GLOBAL, PLAYER_CONFIG_VERSION };

/**
 * Every HTML entry point a bundle serves. `404.html` matters: hosts with no SPA
 * rewrite (GitHub Pages) answer a deep link with it, and a copy without the boot
 * config would open on an empty screen.
 */
export const PLAYER_BUNDLE_HTML_FILES = ['index.html', '404.html'] as const;

const CONFIG_SCRIPT_PATTERN = /<script data-vne-player-config>[\s\S]*?<\/script>/g;

export interface PlayerBootConfig {
  version: number;
  generatedAt: string;
  story: unknown;
  assets?: ReleaseAssetMap;
  release: { releaseId: string; version: string; releasedAt: string };
}

export interface BuildPlayerBootConfigInput {
  manifest: ReleaseManifestV1;
  payload: ReleasePayloadV1;
  /** Injectable so a bundle can be byte-identical across runs in a test. */
  generatedAt?: string;
}

function buildPlayerStory(manifest: ReleaseManifestV1, payload: ReleasePayloadV1): unknown {
  return {
    ...manifest.story,
    scenes: payload.scenes,
    characterLibrary: payload.characters,
    audioLibrary: payload.audioLibrary,
  };
}

/**
 * The canonical story shape the reader seeds from: frozen scenes and cast out of
 * the payload, everything else out of the manifest's story block.
 */
export function buildPlayerBootConfig(input: BuildPlayerBootConfigInput): PlayerBootConfig {
  const { manifest, payload } = input;
  const config: PlayerBootConfig = {
    version: PLAYER_CONFIG_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    story: buildPlayerStory(manifest, payload),
    release: {
      releaseId: manifest.release.releaseId,
      version: manifest.release.version,
      releasedAt: manifest.release.releasedAt,
    },
  };
  const assets = buildReleaseAssetMap(manifest);
  if (Object.keys(assets).length > 0) config.assets = assets;
  return config;
}

/**
 * The `<script>` tag that carries the config.
 *
 * `<` is escaped so the payload cannot close the surrounding tag, and the
 * paragraph separators because a bare U+2028 is a line terminator in a script
 * body but perfectly legal inside a JSON string — a story containing one would
 * otherwise produce a bundle that fails to parse.
 */
export function playerConfigScriptTag(config: PlayerBootConfig): string {
  const literal = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    // Written as escapes rather than literal characters: an invisible
    // separator in this source is exactly the kind of thing an editor or a
    // transfer silently normalises away.
    .replace(/[\u2028\u2029]/g, (character) =>
      (character === '\u2028' ? '\\u2028' : '\\u2029'));
  return `<script data-vne-player-config>window.${PLAYER_CONFIG_GLOBAL}=${literal}</script>`;
}

/**
 * Put the boot config into one HTML file, replacing any previous one so a shell
 * that already carries a config cannot end up with two.
 */
export function inlinePlayerConfig(html: string, config: PlayerBootConfig): string {
  const stripped = html.replace(CONFIG_SCRIPT_PATTERN, '');
  if (!stripped.includes('</head>')) {
    throw new Error('Cannot inline the player config: the shell has no </head>');
  }
  return stripped.replace('</head>', `${playerConfigScriptTag(config)}</head>`);
}

/**
 * `assets/…` strings in the frozen story that the release did not package.
 *
 * A player shell carries no `assets/assets/` directory (see `scripts/build-web.mjs`):
 * a release packages the media its own story uses, bundled art included, because
 * `lib/story-backup/capture.ts` resolves bundled references and stores their
 * bytes. Anything that slipped through would become a blank picture in a
 * stranger's copy — a defect the author never sees, because their own device
 * still has the file.
 *
 * Scan the exact story object the player boots, not only the payload. Fields
 * such as the cover live in the manifest and are merged into that object;
 * checking only scenes would approve a release whose launcher art disappears.
 */
export function findUnpackagedBundledReferences(
  payload: ReleasePayloadV1,
  manifest: ReleaseManifestV1,
): string[] {
  const answered = new Set<string>();
  for (const asset of manifest.assets) {
    answered.add(asset.assetId);
    for (const reference of asset.sourceReferences) answered.add(reference);
  }

  const playerStory = buildPlayerStory(manifest, payload);
  const missing = new Set<string>();
  for (const match of JSON.stringify(playerStory).matchAll(/"(assets\/[^"]+)"/g)) {
    if (!answered.has(match[1])) missing.add(match[1]);
  }
  return [...missing];
}

/** Read a config back out of a built page. Used by the smoke checks. */
export function readInlinedPlayerConfig(html: string): PlayerBootConfig | null {
  const match = html.match(
    new RegExp(`<script data-vne-player-config>window\\.${PLAYER_CONFIG_GLOBAL}=([\\s\\S]*?)</script>`),
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1].replace(/\\u003c/g, '<')) as PlayerBootConfig;
  } catch {
    return null;
  }
}
