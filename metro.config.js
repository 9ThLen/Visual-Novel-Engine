const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { createBlockList } = require("./metro-blocklist");
const config = getDefaultConfig(__dirname);

config.resolver.blockList = createBlockList(__dirname);

const finalConfig = withNativeWind(config, { input: "./global.css" });

const extraAssetExts = ['ogg', 'wav', 'mp3', 'm4a', 'aac'];
extraAssetExts.forEach(ext => {
  if (!finalConfig.resolver.assetExts.includes(ext)) {
    finalConfig.resolver.assetExts.push(ext);
  }
});

module.exports = finalConfig;
