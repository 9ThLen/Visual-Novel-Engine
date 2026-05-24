const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Force CJS for zustand to avoid 'import.meta' issues on web
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'zustand': path.resolve(__dirname, 'node_modules/zustand/index.js'),
  'zustand/middleware': path.resolve(__dirname, 'node_modules/zustand/middleware.js'),
  'zustand/vanilla': path.resolve(__dirname, 'node_modules/zustand/vanilla.js'),
};

// Block server-side modules from being bundled into web
config.resolver.blockList = [
  /node_modules\/mysql2\/.*/,
  /server\/.*/,
];

// Apply NativeWind FIRST, then add asset extensions AFTER
// (withNativeWind can reset assetExts, so we patch after the call)
const finalConfig = withNativeWind(config, { input: "./global.css" });

const extraAssetExts = ['ogg', 'wav', 'mp3', 'm4a', 'aac'];
extraAssetExts.forEach(ext => {
  if (!finalConfig.resolver.assetExts.includes(ext)) {
    finalConfig.resolver.assetExts.push(ext);
  }
});

module.exports = finalConfig;
