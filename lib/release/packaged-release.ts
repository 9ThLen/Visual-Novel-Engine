/**
 * The release a native player build carries inside it.
 *
 * On the web a published bundle is a folder: the boot config is inlined into
 * `index.html` and the media sits beside it as files, both reachable by relative
 * path. An APK has neither. Everything it ships has to be something Metro saw at
 * bundle time through a **static** `require`, which is why `tools/vne-build`
 * generates a module of them (`lib/generated/player-release.ts`) rather than
 * pointing the app at a path.
 *
 * This module is the other end of that: it turns those module references into
 * uris the reader's existing asset resolution already understands, so the native
 * player joins the same seam as the web one instead of growing a second
 * resolution path through the reader.
 *
 * It is the only part of the player boot that imports React Native, which is why
 * it is here and not in `lib/player-mode.ts` — that file is loaded by Node
 * scripts (`scripts/export-story-web.ts`) and has to stay free of them.
 */
import { Asset } from 'expo-asset';

import { setPackagedMediaMap } from '@/lib/asset-resolver';
import {
  parsePlayerConfig,
  registerPackagedReleaseLoader,
  type PlayerConfig,
} from '@/lib/player-mode';
import { PACKAGED_RELEASE } from '@/lib/generated/player-release';

export interface PackagedRelease {
  /** The same boot config the web exporter inlines, as a required JSON module. */
  config: unknown;
  /** `media/<sha256>.<ext>` → the module reference Metro assigned it. */
  media: Record<string, number | string>;
}

/** Injectable so the mapping can be tested without a device. */
export interface PackagedMediaResolver {
  (module: number | string): Promise<string | null>;
}

const resolveThroughExpoAsset: PackagedMediaResolver = async (module) => {
  const asset = Asset.fromModule(module as never);
  // Bundled assets in a release build are already on the device, but `localUri`
  // is only populated once the asset has been "downloaded" — which for a bundled
  // one is bookkeeping rather than a network call.
  if (!asset.localUri) {
    try {
      await asset.downloadAsync();
    } catch {
      // Fall back to whatever uri the asset already knows. A picture that fails
      // here is one missing picture, not a story that refuses to open.
    }
  }
  return asset.localUri ?? asset.uri ?? null;
};

/**
 * Resolve the packaged media and hand the boot config back.
 *
 * Returns `null` for a build that carries no release — every studio build, and
 * every web build, since the committed generated module exports `null`.
 */
export async function activatePackagedRelease(
  packaged: PackagedRelease | null = PACKAGED_RELEASE,
  resolve: PackagedMediaResolver = resolveThroughExpoAsset,
): Promise<PlayerConfig | null> {
  if (!packaged) return null;

  const config = parsePlayerConfig(packaged.config);
  if (!config) return null;

  const resolved: Record<string, string> = {};
  for (const [reference, file] of Object.entries(config.assets ?? {})) {
    const module = packaged.media[file];
    if (module === undefined) continue;
    const uri = await resolve(module);
    if (uri) resolved[reference] = uri;
  }
  setPackagedMediaMap(Object.keys(resolved).length > 0 ? resolved : null);

  return config;
}

/**
 * Tell `lib/player-mode.ts` where a native build finds its release.
 *
 * Registered rather than imported by it: the direction of the dependency is what
 * keeps the boot logic loadable outside React Native. Called from
 * `app-player/_layout.tsx`, which is the player root's own entry point.
 */
export function registerPackagedRelease(packaged: PackagedRelease | null = PACKAGED_RELEASE): void {
  if (!packaged) return;
  registerPackagedReleaseLoader(() => activatePackagedRelease(packaged));
}
