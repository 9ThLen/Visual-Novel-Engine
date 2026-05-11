// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    rules: {
      "import/no-duplicates": "warn",
      "no-duplicate-imports": "warn",
    },
  },
  {
    ignores: ["dist/*"],
  },
]);
