const { themeColors } = require("./theme.config");
const plugin = require("tailwindcss/plugin");

function buildTailwindThemeColors(colors) {
  return Object.fromEntries(
    Object.keys(colors).map((name) => [name, `var(--color-${name})`]),
  );
}

const tailwindColors = buildTailwindThemeColors(themeColors);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // Scan all component and app files for Tailwind classes
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}", "./lib/**/*.{js,ts,tsx}", "./hooks/**/*.{js,ts,tsx}"],

  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: tailwindColors,
    },
  },
  corePlugins: {
    aspectRatio: true,
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("light", ':root:not([data-theme="dark"]) &');
      addVariant("dark", ':root[data-theme="dark"] &');
    }),
  ],
};
