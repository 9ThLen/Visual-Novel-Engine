const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { createBlockList, createPlayerBlockList } = require("./metro-blocklist");
const { isPlayerProfile, PLAYER_STORE_SUBSTITUTION } = require("./player-profile");
const config = getDefaultConfig(__dirname);

const playerProfile = isPlayerProfile();

config.resolver.blockList = [
  ...createBlockList(__dirname),
  ...(playerProfile ? createPlayerBlockList(__dirname) : []),
];

if (playerProfile) {
  // Every reader screen imports `@/stores/use-app-store`. Blocking it would only
  // break the build, so the player profile substitutes the reader-only store
  // instead — which is what keeps the authoring slices, and everything they pull
  // in, out of the bundle. Matched on the resolved file rather than the
  // specifier so the relative import inside `stores/` is redirected too.
  const studioStore = path.resolve(__dirname, PLAYER_STORE_SUBSTITUTION.from);
  const playerStore = path.resolve(__dirname, PLAYER_STORE_SUBSTITUTION.to);
  const defaultResolveRequest = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = defaultResolveRequest ?? context.resolveRequest;
    const resolved = resolve(context, moduleName, platform);
    if (resolved && resolved.type === "sourceFile" && path.resolve(resolved.filePath) === studioStore) {
      return { type: "sourceFile", filePath: playerStore };
    }
    return resolved;
  };
}

const finalConfig = withNativeWind(config, { input: "./global.css" });

const extraAssetExts = ['ogg', 'wav', 'mp3', 'm4a', 'aac'];
extraAssetExts.forEach(ext => {
  if (!finalConfig.resolver.assetExts.includes(ext)) {
    finalConfig.resolver.assetExts.push(ext);
  }
});

module.exports = finalConfig;
