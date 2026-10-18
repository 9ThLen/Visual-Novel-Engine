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
      // Browser globals that read like local state. A component that forgets
      // to take `status` from its props or a hook still compiles, and then
      // compares `window.status` — an empty string — with its states.
      "no-restricted-globals": ["error", "status", "name", "event", "length", "closed"],
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
      "tests/e2e/player/.bundle/**",
      "tests/e2e/player/.desktop/**",
      "docs/technical/*",
      "tools/qa/*",
      "metro.config.cjs",
      "scripts/load-env.mjs",
    ],
  },
]);
