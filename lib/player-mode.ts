/**
 * Player mode — the boot flag that turns a generic web build into a
 * single-story player.
 *
 * A published bundle (see `scripts/export-story-web.mjs`) is the ordinary Expo
 * web build plus a `player-config.json` dropped next to `index.html`. When that
 * file is present the app skips the library/editor UI and launches straight into
 * the reader for the bundled story.
 *
 * This module owns the *decision* logic and stays free of store / React Native
 * imports so the parsing can be unit-tested in isolation. Runtime wiring
 * (seeding the store, routing) lives in `components/PlayerModeGate` and
 * `components/PlayerModeRouteGuard`.
 */
import type { Story } from '@/lib/scene-operations';
import type { CanonicalStory } from '@/lib/story-domain';

/** Path of the boot flag, resolved relative to the served `index.html`. */
export const PLAYER_CONFIG_PATH = 'player-config.json';
export const PLAYER_CONFIG_VERSION = 1;

/** A bundled story is either the legacy `Story` or the canonical shape. */
export type PlayerStory = Story | CanonicalStory;

export interface PlayerConfig {
  version: number;
  story: PlayerStory;
  generatedAt?: string;
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
  };
}

// ── Runtime state (web only) ────────────────────────────────────────────────
// The active config is cached module-side so the boot gate and the route guard
// share one source of truth without re-fetching. These do not affect the pure
// helpers above and are inert on native (no `fetch` of a local file).

let configPromise: Promise<PlayerConfig | null> | undefined;
let activeConfig: PlayerConfig | null = null;

function playerConfigUrl(): string {
  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      return new URL(PLAYER_CONFIG_PATH, document.baseURI).toString();
    } catch {
      /* fall through */
    }
  }
  return PLAYER_CONFIG_PATH;
}

/**
 * Fetch and parse the boot flag once. Resolves `null` when not running as a
 * published bundle (native, dev server, or no `player-config.json` present).
 */
export function loadPlayerConfig(): Promise<PlayerConfig | null> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
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
}
