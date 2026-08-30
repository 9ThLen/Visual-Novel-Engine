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

const appConfig = {
  name: "Visual Novel Engine",
  slug: "visual-novel-engine",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: schemeFromBundleId,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
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
    package: bundleId,
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
    "expo-splash-screen",
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
      projectId: "1c9703fa-b3eb-4cac-ba94-536a07fa2443"
    }
  },
};

export default appConfig;
