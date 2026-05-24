function removeImportMetaPlugin() {
  return {
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
          path.replaceWithSourceString('({})');
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  plugins.push("react-native-reanimated/plugin");
  plugins.push(removeImportMetaPlugin);

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins,
  };
};
