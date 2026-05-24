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
    ignores: ["dist/*", "wiki/*", "tools/qa/*", "metro.config.cjs", "scripts/load-env.mjs"],
  },
]);
