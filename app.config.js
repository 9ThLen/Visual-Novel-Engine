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
    permissions: ["POST_NOTIFICATIONS", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  assetBundlePatterns: ["**/*"],
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-audio",
    "expo-document-picker",
    "expo-image-picker",
    "expo-video",
    "expo-splash-screen",
    "expo-build-properties",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    tsconfigPaths: true,
  },
  extra: {
    eas: {
      projectId: "1c9703fa-b3eb-4cac-ba94-536a07fa2443"
    }
  },
};

export default appConfig;
