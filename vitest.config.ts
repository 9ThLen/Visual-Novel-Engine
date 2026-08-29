import { defineConfig } from 'vitest/config';
import path from 'path';

const rootDir = path.resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: {
      // Mock native/external packages for jsdom (must come before @ alias)
      'react-native': path.resolve(__dirname, '__mocks__/react-native.ts'),
      'expo': path.resolve(__dirname, '__mocks__/expo.ts'),
      'expo-video': path.resolve(__dirname, '__mocks__/expo-video.ts'),
      '@react-navigation/native': path.resolve(__dirname, '__mocks__/react-navigation-native.ts'),
      'expo-audio': path.resolve(__dirname, '__mocks__/expo-audio.ts'),
      'expo-image': path.resolve(__dirname, '__mocks__/expo-image.ts'),
      'expo-file-system/legacy': path.resolve(__dirname, '__mocks__/expo-file-system-legacy.ts'),
      'expo-asset': path.resolve(__dirname, '__mocks__/expo-asset.ts'),
      'expo-blur': path.resolve(__dirname, '__mocks__/expo-blur.ts'),
      'expo-linking': path.resolve(__dirname, '__mocks__/expo-linking.ts'),
      'expo-modules-core': path.resolve(__dirname, '__mocks__/expo-modules-core.ts'),
      'expo-router': path.resolve(__dirname, '__mocks__/expo-router.ts'),
      'expo-secure-store': path.resolve(__dirname, '__mocks__/expo-secure-store.ts'),
      'react-native-reanimated': path.resolve(__dirname, '__mocks__/react-native-reanimated.ts'),
      'react-native-safe-area-context': path.resolve(__dirname, '__mocks__/react-native-safe-area-context.ts'),
      '@expo/vector-icons/MaterialIcons': path.resolve(__dirname, '__mocks__/expo-vector-icons-material.tsx'),
      'expo-symbols': path.resolve(__dirname, '__mocks__/expo-symbols.ts'),
      '@react-native-community/slider': path.resolve(__dirname, '__mocks__/react-native-community-slider.tsx'),
      // Mock project modules that tests need to control
      '@/stores/use-app-store': path.resolve(__dirname, '__mocks__/stores/use-app-store.ts'),
      '@/lib/asset-resolver': path.resolve(__dirname, '__mocks__/lib/asset-resolver.ts'),
      '@/components/vn-plate-editor/PlateWebViewEditor': path.resolve(__dirname, '__mocks__/components/vn-plate-editor/PlateWebViewEditor.tsx'),
      '@/lib/audio-manager-enhanced': path.resolve(__dirname, '__mocks__/lib/audio-manager-enhanced.ts'),
      // Must keep @ alias last as catch-all
      '@': rootDir,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.expo', '__tests__/e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.{ts,tsx}', 'server/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
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
