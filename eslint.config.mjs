// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "import/no-duplicates": "warn",
      "no-duplicate-imports": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [
      "node_modules/*",
      ".expo/*",
      "dist/*",
      "**/dist/**",
      "dist-player*/**",
      ".gstack/**",
      "graphify-out/**",
      "e2e/player/.bundle/**",
      "e2e/player/.desktop/**",
      "wiki/*",
      "tools/qa/*",
      "metro.config.cjs",
      "scripts/load-env.mjs",
    ],
  },
]);
