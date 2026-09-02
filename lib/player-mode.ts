/**
 * Player mode — the boot flag that turns a generic web build into a
 * single-story player.
 *
 * A published bundle (see `scripts/export-story-web.ts`) is the ordinary Expo
 * web build plus a boot config — inlined into `index.html` as
 * `window.__VNE_PLAYER_CONFIG__`, or dropped beside it as `player-config.json`.
 * When one is present the app skips the library/editor UI and launches straight
 * into the reader for the bundled story, resolving its media from the files the
 * bundle carries.
 *
 * This module owns the *decision* logic and stays free of store / React Native
 * imports so the parsing can be unit-tested in isolation. Runtime wiring
 * (seeding the store, routing) lives in `components/PlayerModeGate` and
 * `components/PlayerModeRouteGuard`.
 */
import type { Story } from '@/lib/scene-operations';
import type { CanonicalStory } from '@/lib/story-domain';
import { resolveWebUrl } from '@/lib/web-base-url';

/** Path of the boot flag, resolved relative to the served `index.html`. */
export const PLAYER_CONFIG_PATH = 'player-config.json';
export const PLAYER_CONFIG_VERSION = 1;

/**
 * Global the exporter writes into `index.html`.
 *
 * Preferred over fetching `player-config.json`. The fetch has three ways to
 * fail on a folder that looks perfectly fine: the host serves the file with the
 * wrong content type, the host answers a missing file with `index.html` (every
 * SPA fallback does), or the bundle is served from a sub-path the relative url
 * does not survive. Inlined, the config is simply there before the first paint,
 * and one round trip disappears with it.
 *
 * Not a promise that `file://` works: the production CSP written by
 * `scripts/lib/harden-web-output.mjs` is `default-src 'self'`, and a file
 * origin satisfies that nowhere. Opening a bundle from the filesystem needs
 * that policy relaxed, which is a separate decision.
 */
export const PLAYER_CONFIG_GLOBAL = '__VNE_PLAYER_CONFIG__';

/** A bundled story is either the legacy `Story` or the canonical shape. */
export type PlayerStory = Story | CanonicalStory;

/** Which release a bundle was cut from, for the reader's own save stamps. */
export interface PlayerReleaseInfo {
  releaseId: string;
  version: string;
  releasedAt?: string;
}

export interface PlayerConfig {
  version: number;
  story: PlayerStory;
  generatedAt?: string;
  /**
   * Story reference → file inside the bundle. See
   * `lib/release/asset-map.ts`; absent for a bundle whose art is all bundled
   * with the app.
   */
  assets?: Record<string, string>;
  release?: PlayerReleaseInfo;
}

/**
 * Keep the asset map to relative paths inside the bundle.
 *
 * The config ships inside the bundle, so it is as trusted as the code around
 * it — this is not a security boundary. It is a statement of what the field
 * means: a file this bundle carries. An absolute or protocol-relative value
 * would silently turn a self-contained folder into one that phones somewhere,
 * and that should be a visible decision, not a typo in an asset map.
 */
function sanitizePackagedAssets(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const assets: Record<string, string> = {};
  for (const [reference, target] of Object.entries(raw as Record<string, unknown>)) {
    if (!reference || typeof target !== 'string' || !target) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('/')) continue;
    if (target.split('/').includes('..')) continue;
    assets[reference] = target;
  }
  return Object.keys(assets).length > 0 ? assets : undefined;
}

function parsePlayerRelease(raw: unknown): PlayerReleaseInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.releaseId !== 'string' || !record.releaseId) return undefined;
  if (typeof record.version !== 'string' || !record.version) return undefined;
  const release: PlayerReleaseInfo = { releaseId: record.releaseId, version: record.version };
  if (typeof record.releasedAt === 'string') release.releasedAt = record.releasedAt;
  return release;
}

/**
 * True when the story uses the canonical `SceneRecord + TimelineStep` shape
 * (scenes carry a `timeline` array) rather than the legacy `Story` shape.
 */
export function isCanonicalStoryShape(story: unknown): boolean {
  if (!story || typeof story !== 'object') return false;
  const scenes = (story as { scenes?: unknown }).scenes;
  if (!scenes || typeof scenes !== 'object') return false;
  return Object.values(scenes as Record<string, unknown>).some(
    (scene) =>
      !!scene &&
      typeof scene === 'object' &&
      Array.isArray((scene as { timeline?: unknown }).timeline),
  );
}

/**
 * Validate and normalize a raw parsed `player-config.json`. Returns `null` for
 * anything that is not a usable config so callers can silently fall back to the
 * normal library UI.
 */
export function parsePlayerConfig(raw: unknown): PlayerConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const story = record.story;
  if (!story || typeof story !== 'object') return null;

  const s = story as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id.trim()) return null;
  if (typeof s.title !== 'string' || !s.title.trim()) return null;
  if (typeof s.startSceneId !== 'string' || !s.startSceneId.trim()) return null;
  if (!s.scenes || typeof s.scenes !== 'object') return null;
  if (Object.keys(s.scenes as Record<string, unknown>).length === 0) return null;

  const version = typeof record.version === 'number' ? record.version : PLAYER_CONFIG_VERSION;
  return {
    version,
    story: story as PlayerStory,
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : undefined,
    assets: sanitizePackagedAssets(record.assets),
    release: parsePlayerRelease(record.release),
  };
}

/** The config the exporter inlined into `index.html`, if this is a bundle. */
export function readInlinePlayerConfig(): PlayerConfig | null {
  const globalScope = globalThis as Record<string, unknown>;
  const raw = globalScope[PLAYER_CONFIG_GLOBAL];
  return raw ? parsePlayerConfig(raw) : null;
}

// ── Runtime state (web only) ────────────────────────────────────────────────
// The active config is cached module-side so the boot gate and the route guard
// share one source of truth without re-fetching. These do not affect the pure
// helpers above and are inert on native (no `fetch` of a local file).

let configPromise: Promise<PlayerConfig | null> | undefined;
let activeConfig: PlayerConfig | null = null;
let packagedLoader: (() => Promise<PlayerConfig | null>) | null = null;

/**
 * Where a native build finds its release.
 *
 * A registration rather than an import, because the module that knows how —
 * `lib/release/packaged-release.ts` — needs `expo-asset`, and this file is
 * loaded by Node scripts that have no React Native to give it. The player root
 * calls it; nothing else does, and a studio build never registers anything.
 */
export function registerPackagedReleaseLoader(
  loader: (() => Promise<PlayerConfig | null>) | null,
): void {
  packagedLoader = loader;
}

function playerConfigUrl(): string {
  return resolveWebUrl(PLAYER_CONFIG_PATH);
}

/**
 * Fetch and parse the boot flag once. Resolves `null` when not running as a
 * published bundle (native, dev server, or no `player-config.json` present).
 */
export function loadPlayerConfig(): Promise<PlayerConfig | null> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    // The inlined config wins: it is present before the first paint, and it is
    // the only form that survives being opened from the filesystem.
    const inline = readInlinePlayerConfig();
    if (inline) {
      activeConfig = inline;
      return inline;
    }
    // A native player build has no page to inline into and no file to fetch:
    // its release is a module Metro bundled. Nothing registers this on web.
    if (packagedLoader) {
      const packaged = await packagedLoader();
      if (packaged) {
        activeConfig = packaged;
        return packaged;
      }
    }
    if (typeof fetch !== 'function' || typeof document === 'undefined') return null;
    try {
      const response = await fetch(playerConfigUrl(), { cache: 'no-store' });
      if (!response.ok) return null;
      // A SPA fallback host may answer a missing file with index.html; only
      // trust an actual JSON response.
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) return null;
      const config = parsePlayerConfig(await response.json());
      activeConfig = config;
      return config;
    } catch {
      return null;
    }
  })();
  return configPromise;
}

/** The config resolved by {@link loadPlayerConfig}, or `null` before/without it. */
export function getActivePlayerConfig(): PlayerConfig | null {
  return activeConfig;
}

/** Whether the app is running as a published single-story bundle. */
export function isPlayerModeActive(): boolean {
  return activeConfig !== null;
}

/** Test-only: reset the module-level cache between cases. */
export function __resetPlayerModeForTests(): void {
  configPromise = undefined;
  activeConfig = null;
  packagedLoader = null;
}
