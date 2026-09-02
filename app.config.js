import {
  isPlayerProfile,
  PLAYER_BLOCKED_PERMISSIONS,
  PLAYER_EXCLUDED_PLUGINS,
  PLAYER_ROUTER_ROOT,
} from "./player-profile.js";

const rawBundleId = "space.manus.visual.novel.engine.t20260331092519";
const bundleId = rawBundleId
  .replace(/[-_]/g, ".")
  .replace(/[^a-zA-Z0-9.]/g, "")
  .replace(/\.+/g, ".")
  .replace(/^\.+|\.+$/g, "")
  .toLowerCase()
  .split(".")
  .map((segment) => /^[a-zA-Z]/.test(segment) ? segment : "x" + segment)
  .join(".") || "space.manus.app";

const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;
const webBaseUrl = process.env.VNE_WEB_BASE_URL?.trim();

/**
 * A staged player project passes its identity in as environment variables — the
 * same seam `VNE_WEB_BASE_URL` already uses, and the one `eas.json` can carry
 * per build profile, so the values that decide what the app *is* sit in a file
 * anyone can open rather than in a generated config nobody reads.
 *
 * Read only under the player profile. An identity variable that could rename the
 * studio, or repackage it, would be a stray export away from a build that
 * installs over someone's editor.
 */
const env = (name) => process.env[name]?.trim() || undefined;


/**
 * The player build (`VNE_PROFILE=player`) is the same app with the studio taken
 * out: a different router root, no file pickers, and no permissions a reader has
 * no use for. See `player-profile.js` and `app-player/README.md`.
 *
 * `blockedPermissions` is real here — the Android config is applied at prebuild,
 * and it strips a permission even when a transitive dependency declares it.
 * Autolinking is **not**: it reads `package.json`, never this file, so the
 * native module cut belongs to R9's staged project. An `autolinking` key used to
 * sit here and did nothing at all.
 */
const playerProfile = isPlayerProfile();

const playerAppId = playerProfile ? env("VNE_PLAYER_APP_ID") : undefined;
const playerAppName = playerProfile ? env("VNE_PLAYER_APP_NAME") : undefined;
const playerVersion = playerProfile ? env("VNE_PLAYER_VERSION") : undefined;
const playerVersionCode = playerProfile ? env("VNE_PLAYER_VERSION_CODE") : undefined;
const playerSlug = playerProfile ? env("VNE_PLAYER_SLUG") : undefined;
const playerScheme = playerProfile ? env("VNE_PLAYER_SCHEME") : undefined;
const playerIcon = playerProfile ? env("VNE_PLAYER_ICON") : undefined;
const playerSplash = playerProfile ? env("VNE_PLAYER_SPLASH") : undefined;

/**
 * The engine's own EAS project is a default, not a constant: an author's builds
 * belong to the author's account, which is also who should own the signing
 * credentials Android will hold them to for the life of the story.
 */
export const ENGINE_EAS_PROJECT_ID = "1c9703fa-b3eb-4cac-ba94-536a07fa2443";
const easProjectId = env("VNE_EAS_PROJECT_ID") ?? ENGINE_EAS_PROJECT_ID;

const appConfig = {
  name: playerAppName ?? "Visual Novel Engine",
  slug: playerSlug ?? "visual-novel-engine",
  version: playerVersion ?? "1.0.0",
  orientation: "default",
  icon: playerIcon ?? "./assets/images/icon.png",
  // A player build gets its own, derived from its application id. Every build
  // used to carry the engine's, so two novels on one phone registered the same
  // custom scheme — and the OS picks between duplicate registrations
  // arbitrarily, which is a link for one novel opening another, or a player
  // sitting in front of the studio's own OAuth redirect.
  scheme: playerScheme ?? schemeFromBundleId,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: playerAppId ?? bundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#1E293B",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: playerAppId ?? bundleId,
    ...(playerVersionCode ? { versionCode: Number(playerVersionCode) } : {}),
    permissions: playerProfile ? [] : ["POST_NOTIFICATIONS"],
    ...(playerProfile ? { blockedPermissions: PLAYER_BLOCKED_PERMISSIONS } : {}),
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  assetBundlePatterns: ["**/*"],
  plugins: [
    playerProfile ? ["expo-router", { root: PLAYER_ROUTER_ROOT }] : "expo-router",
    "expo-asset",
    "expo-audio",
    "expo-document-picker",
    "expo-image-picker",
    "expo-video",
    // The engine splash is the fixed first frame of every native player build:
    // it is the attribution, and the author's own title card plays after it.
    playerSplash
      ? ["expo-splash-screen", { image: playerSplash, resizeMode: "contain", backgroundColor: "#1E293B" }]
      : "expo-splash-screen",
    "expo-build-properties",
  ].filter((plugin) => !playerProfile || !PLAYER_EXCLUDED_PLUGINS.includes(plugin)),
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    tsconfigPaths: true,
    ...(webBaseUrl ? { baseUrl: webBaseUrl } : {}),
  },
  extra: {
    eas: {
      projectId: easProjectId
    }
  },
};

export default appConfig;
