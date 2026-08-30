/**
 * One description of the player build profile, shared by everything that has to
 * agree about it: `app.config.js` (router root, plugins, native modules,
 * permissions), `metro.config.js` (what the bundler refuses to serve and which
 * store it substitutes) and `tools/check-player-bundle.mjs` (what must not be
 * reachable). They drifted apart in every draft of this that kept three copies.
 *
 * CommonJS because `metro.config.js` is CommonJS; `app.config.js` imports it
 * through Expo's transpiler and the checker through `createRequire`.
 */

/** The value of `VNE_PROFILE` that selects the player build. */
const PLAYER_PROFILE = 'player';

/** Whether a given environment asks for the player profile. */
function isPlayerProfile(env = process.env) {
  return env.VNE_PROFILE === PLAYER_PROFILE;
}

/** Router root for the player build — see `app-player/README.md`. */
const PLAYER_ROUTER_ROOT = './app-player';

/**
 * The studio store, and the reader-only store Metro puts in its place.
 * Substituted rather than blocked: every reader screen imports
 * `@/stores/use-app-store`, and blocking it would only break the build.
 */
const PLAYER_STORE_SUBSTITUTION = {
  from: 'stores/use-app-store.ts',
  to: 'stores/use-app-store.player.ts',
};

/**
 * Whole trees the player bundler refuses to resolve. Coarse on purpose: every
 * entry here is authoring UI or authoring logic with no reader caller, so a
 * failed resolve is a real mistake rather than a false alarm.
 *
 * Modules that are *shared* but happen to sit under an authoring-sounding path
 * — `lib/document-editor/scene-graph-*`, which the reader's coverage code walks,
 * and `lib/ai/permissions.ts`, which `lib/user-settings.ts` reads — are handled
 * by `tools/check-player-bundle.mjs` instead, which can name individual files.
 */
const PLAYER_BLOCKED_TREES = [
  'components/editor',
  'components/document-editor',
  'components/ai-chat',
  'components/theme-studio',
  'components/story-home',
  'components/vn-plate-editor',
  'components/media-library',
  'lib/editor',
  'lib/vn-plate-editor',
  'lib/story-home',
  'lib/scene-document',
];

/**
 * Individual authoring modules that must not be reachable from the player root.
 * Enforced by the checker, not the bundler: some sit beside shared code in the
 * same directory.
 */
const PLAYER_FORBIDDEN_MODULES = [
  'stores/use-app-store.ts',
  'stores/app-store-slices/story-slice.ts',
  'stores/app-store-slices/snapshots-slice.ts',
  'stores/app-store-slices/scene-write-slice.ts',
  'stores/app-store-slices/scene-slice.ts',
  'stores/app-store-slices/libraries-slice.ts',
  'lib/story-snapshots.ts',
  'lib/ai/change-set.ts',
  'lib/release/compile.ts',
  'lib/release/service.ts',
  'lib/story-backup/capture.ts',
  'lib/story-backup/import.ts',
  'lib/story-backup/service.ts',
];

/**
 * Expo config plugins the player build drops. Autolinking reads the config, not
 * the Metro graph, so a picker excluded here is what actually keeps the native
 * module — and the permission it declares — out of the app.
 */
const PLAYER_EXCLUDED_PLUGINS = ['expo-document-picker', 'expo-image-picker'];

/** Native modules autolinking must skip. Mirrors {@link PLAYER_EXCLUDED_PLUGINS}. */
const PLAYER_AUTOLINKING_EXCLUDE = [
  'expo-document-picker',
  'expo-image-picker',
  'expo-secure-store',
];

/**
 * Permissions stripped from the merged manifest even if a transitive dependency
 * declares them. A player reads a story; it does not pick files, take photos or
 * post notifications.
 */
const PLAYER_BLOCKED_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.POST_NOTIFICATIONS',
];

module.exports = {
  PLAYER_PROFILE,
  isPlayerProfile,
  PLAYER_ROUTER_ROOT,
  PLAYER_STORE_SUBSTITUTION,
  PLAYER_BLOCKED_TREES,
  PLAYER_FORBIDDEN_MODULES,
  PLAYER_EXCLUDED_PLUGINS,
  PLAYER_AUTOLINKING_EXCLUDE,
  PLAYER_BLOCKED_PERMISSIONS,
};
