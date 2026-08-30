const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { createBlockList, createPlayerBlockList } = require("./metro-blocklist");
const { isPlayerProfile, PLAYER_MODULE_SUBSTITUTIONS } = require("./player-profile");
const config = getDefaultConfig(__dirname);

const playerProfile = isPlayerProfile();

config.resolver.blockList = [
  ...createBlockList(__dirname),
  ...(playerProfile ? createPlayerBlockList(__dirname) : []),
];

if (playerProfile) {
  // Some modules the player needs are modules it must not have the *contents*
  // of: the store, whose authoring slices would come with it, and the
  // bundled-asset map, whose static requires put the whole demo art library in
  // every artifact. Blocking either would only break the build, so the player
  // profile swaps them. Matched on the resolved file rather than on the
  // specifier, so a relative import from inside the same directory is redirected
  // too. See `PLAYER_MODULE_SUBSTITUTIONS`.
  const substitutions = new Map(
    PLAYER_MODULE_SUBSTITUTIONS.map((entry) => [
      path.resolve(__dirname, entry.from),
      path.resolve(__dirname, entry.to),
    ]),
  );
  const defaultResolveRequest = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = defaultResolveRequest ?? context.resolveRequest;
    const resolved = resolve(context, moduleName, platform);
    if (resolved && resolved.type === "sourceFile") {
      const replacement = substitutions.get(path.resolve(resolved.filePath));
      if (replacement) return { type: "sourceFile", filePath: replacement };
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
