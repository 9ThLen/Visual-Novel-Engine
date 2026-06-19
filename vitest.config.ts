import { defineConfig } from 'vitest/config';
import path from 'path';

const rootDir = path.resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: {
      // Mock native/external packages for jsdom (must come before @ alias)
      'react-native': path.resolve(__dirname, '__mocks__/react-native.ts'),
      '@react-navigation/native': path.resolve(__dirname, '__mocks__/react-navigation-native.ts'),
      'expo-audio': path.resolve(__dirname, '__mocks__/expo-audio.ts'),
      'expo-file-system/legacy': path.resolve(__dirname, '__mocks__/expo-file-system-legacy.ts'),
      'expo-asset': path.resolve(__dirname, '__mocks__/expo-asset.ts'),
      'expo-linking': path.resolve(__dirname, '__mocks__/expo-linking.ts'),
      'expo-modules-core': path.resolve(__dirname, '__mocks__/expo-modules-core.ts'),
      'expo-router': path.resolve(__dirname, '__mocks__/expo-router.ts'),
      'expo-secure-store': path.resolve(__dirname, '__mocks__/expo-secure-store.ts'),
      // Mock project modules that tests need to control
      '@/stores/use-app-store': path.resolve(__dirname, '__mocks__/stores/use-app-store.ts'),
      '@/lib/asset-resolver': path.resolve(__dirname, '__mocks__/lib/asset-resolver.ts'),
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
    },
  },
  esbuild: {
    jsx: 'automatic',
    format: 'cjs',
  },
});