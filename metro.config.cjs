const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Ensure assets are properly handled
config.resolver.assetExts.push(
  // Audio formats
  'mp3',
  'wav',
  'aac',
  'm4a',
  // Image formats (already included by default, but being explicit)
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp'
);

module.exports = withNativeWind(config, {
  input: "./global.css",
});
