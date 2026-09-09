import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The config sits in `config/`, so every path here is anchored on the repository
 * root explicitly rather than on the config's own directory — Vitest would
 * otherwise take `config/` for the project root and find no tests at all.
 */
const rootDir = path.resolve(__dirname, '..');
const mock = (file: string) => path.join(rootDir, 'tests/mocks', file);

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      // Mock native/external packages for jsdom (must come before @ alias)
      'react-native': mock('react-native.ts'),
      'expo': mock('expo.ts'),
      'expo-video': mock('expo-video.ts'),
      '@react-navigation/native': mock('react-navigation-native.ts'),
      'expo-audio': mock('expo-audio.ts'),
      'expo-image': mock('expo-image.ts'),
      'expo-file-system/legacy': mock('expo-file-system-legacy.ts'),
      'expo-asset': mock('expo-asset.ts'),
      'expo-blur': mock('expo-blur.ts'),
      'expo-linking': mock('expo-linking.ts'),
      'expo-modules-core': mock('expo-modules-core.ts'),
      'expo-router': mock('expo-router.ts'),
      'expo-secure-store': mock('expo-secure-store.ts'),
      'react-native-reanimated': mock('react-native-reanimated.ts'),
      'react-native-safe-area-context': mock('react-native-safe-area-context.ts'),
      '@expo/vector-icons/MaterialIcons': mock('expo-vector-icons-material.tsx'),
      'expo-symbols': mock('expo-symbols.ts'),
      '@react-native-community/slider': mock('react-native-community-slider.tsx'),
      // Mock project modules that tests need to control
      '@/stores/use-app-store': mock('stores/use-app-store.ts'),
      '@/lib/asset-resolver': mock('lib/asset-resolver.ts'),
      '@/components/vn-plate-editor/PlateWebViewEditor': mock('components/vn-plate-editor/PlateWebViewEditor.tsx'),
      '@/lib/audio-manager-enhanced': mock('lib/audio-manager-enhanced.ts'),
      // `@/*` maps to `./src/*` first and the project root second (tsconfig.json).
      // Vite aliases have no fallback, so the five directories that moved under
      // `src/` are named before the catch-all that still answers for `@/app`,
      // `@/assets` and `@/global.css`. Longest prefix first.
      '@/components': path.join(rootDir, 'src/components'),
      '@/constants': path.join(rootDir, 'src/constants'),
      '@/hooks': path.join(rootDir, 'src/hooks'),
      '@/lib': path.join(rootDir, 'src/lib'),
      '@/stores': path.join(rootDir, 'src/stores'),
      // Must keep @ alias last as catch-all
      '@': rootDir,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.join(__dirname, 'vitest.setup.ts')],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.expo', 'tests/e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.{ts,tsx}', 'server/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
      thresholds: {
        statements: 60,
        branches: 75,
        functions: 70,
        lines: 60,
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
    format: 'cjs',
  },
});
