function buildTailwindThemeColors(themeColors) {
  return Object.fromEntries(
    Object.keys(themeColors).map((name) => [name, `var(--color-${name})`]),
  );
}

module.exports = {
  buildTailwindThemeColors,
};
