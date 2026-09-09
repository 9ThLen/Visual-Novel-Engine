// @ts-nocheck — vitest setup
(globalThis as Record<string, unknown>).__DEV__ = true;

const Module = require('module');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

/**
 * `@/*` maps to `./src/*` before the project root (tsconfig.json). These five
 * directories are what moved under `src/`; `@/app`, `@/assets` and `@/global.css`
 * still answer from the root, so the head of the specifier decides which.
 */
const SRC_DIRS = new Set(['components', 'constants', 'hooks', 'lib', 'stores']);

function aliasPath(rest) {
  const head = rest.split('/')[0];
  return SRC_DIRS.has(head) ? path.join(rootDir, 'src', rest) : path.join(rootDir, rest);
}

// Map Vite aliases for CJS require() — maps import specifier → mock file path
const aliases = {
  'react-native': path.join(rootDir, 'tests/mocks/react-native.ts'),
  'expo': path.join(rootDir, 'tests/mocks/expo.ts'),
  'expo-video': path.join(rootDir, 'tests/mocks/expo-video.ts'),
  '@react-navigation/native': path.join(rootDir, 'tests/mocks/react-navigation-native.ts'),
  'expo-audio': path.join(rootDir, 'tests/mocks/expo-audio.ts'),
  'expo-image': path.join(rootDir, 'tests/mocks/expo-image.ts'),
  'expo-file-system/legacy': path.join(rootDir, 'tests/mocks/expo-file-system-legacy.ts'),
  'expo-asset': path.join(rootDir, 'tests/mocks/expo-asset.ts'),
  'expo-blur': path.join(rootDir, 'tests/mocks/expo-blur.ts'),
  'expo-linking': path.join(rootDir, 'tests/mocks/expo-linking.ts'),
  'expo-modules-core': path.join(rootDir, 'tests/mocks/expo-modules-core.ts'),
  'expo-router': path.join(rootDir, 'tests/mocks/expo-router.ts'),
  'expo-secure-store': path.join(rootDir, 'tests/mocks/expo-secure-store.ts'),
  'react-native-reanimated': path.join(rootDir, 'tests/mocks/react-native-reanimated.ts'),
  'react-native-safe-area-context': path.join(rootDir, 'tests/mocks/react-native-safe-area-context.ts'),
  '@expo/vector-icons/MaterialIcons': path.join(rootDir, 'tests/mocks/expo-vector-icons-material.tsx'),
  'expo-symbols': path.join(rootDir, 'tests/mocks/expo-symbols.ts'),
  '@react-native-community/slider': path.join(rootDir, 'tests/mocks/react-native-community-slider.tsx'),
  '@/stores/use-app-store': path.join(rootDir, 'tests/mocks/stores/use-app-store.ts'),
  '@/lib/asset-resolver': path.join(rootDir, 'tests/mocks/lib/asset-resolver.ts'),
  '@/components/vn-plate-editor/PlateWebViewEditor': path.join(rootDir, 'tests/mocks/components/vn-plate-editor/PlateWebViewEditor.tsx'),
  '@/lib/audio-manager-enhanced': path.join(rootDir, 'tests/mocks/lib/audio-manager-enhanced.ts'),
  '@/lib/audio-library': path.join(rootDir, 'tests/mocks/lib/audio-library.ts'),
};

// Build a map of resolved real paths → mock paths for relative import interception
const resolvedAliasPaths = {};
for (const [specifier, mockPath] of Object.entries(aliases)) {
  if (specifier.startsWith('@/')) {
    const realPath = aliasPath(specifier.slice(2));
    resolvedAliasPaths[realPath] = mockPath;
  }
}

// Files that should NOT get the mocked version for matching aliases
const mockExemptFiles = [
  path.join(rootDir, 'tests/unit/lib/audio-library.test.ts'),
  path.join(rootDir, 'tests/unit/lib/audio-manager-enhanced.test.ts'),
  path.join(rootDir, 'tests/unit/lib/asset-resolver.test.ts'),
  // Exercises the real packaged-media hook, which is the point of the file.
  path.join(rootDir, 'tests/unit/lib/packaged-media-resolution.test.ts'),
  path.join(rootDir, 'tests/mocks/lib/audio-library.ts'),
];

function shouldExempt(parent) {
  if (!parent || !parent.filename) return false;
  const normalized = parent.filename.replace(/\\/g, '/');
  return mockExemptFiles.some((f) => normalized === f.replace(/\\/g, '/'));
}

// Use TypeScript compiler API for .ts loader
let _ts = null;
function getTs() {
  if (!_ts) _ts = require('typescript');
  return _ts;
}

Module._extensions['.ts'] = function (mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = getTs().transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: getTs().ModuleKind.CommonJS,
      target: getTs().ScriptTarget.ES2020,
      // Automatic runtime, matching esbuild in vitest.config.ts and the app
      // build. With the classic runtime any component that does not import
      // React itself throws "React is not defined" the moment it renders.
      jsx: getTs().JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  });
  mod._compile(result.outputText, filename);
};

Module._extensions['.tsx'] = Module._extensions['.ts'];

// Override Module._resolveFilename to handle aliases and .ts resolution
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  // Handle exact alias specifiers (for npm packages)
  if (aliases[request] && !shouldExempt(parent)) {
    return aliases[request];
  }

  // Handle @ prefix (project modules)
  if (request.startsWith('@/')) {
    const realPath = aliasPath(request.slice(2));
    return resolveWithTs(realPath, parent);
  }

  // Resolve the original path to check if it matches an aliased project module
  try {
    const resolved = origResolve.call(this, request, parent, isMain, options);
    if (shouldExempt(parent)) return resolved;
    const normalized = resolved.replace(/\\/g, '/');
    for (const [realPath, mockPath] of Object.entries(resolvedAliasPaths)) {
      if (normalized === realPath.replace(/\\/g, '/') || normalized === realPath.replace(/\\/g, '/') + '.ts') {
        return mockPath;
      }
    }
    return resolved;
  } catch (e) {
    // Try .ts/.tsx extensions
    if (request.startsWith('.')) {
      const parentDir = path.dirname(parent?.filename || rootDir);
      const resolved = path.resolve(parentDir, request);
      return resolveWithTs(resolved, parent);
    }
    throw e;
  }
};

function resolveWithTs(basePath, parent) {
  // A directory here means a package-style import like '@/components/ui';
  // returning the directory itself makes require() fail with EISDIR, so fall
  // through to its index file below.
  const isDirectory = fs.existsSync(basePath) && fs.statSync(basePath).isDirectory();
  if (fs.existsSync(basePath) && !isDirectory) {
    if (shouldExempt(parent)) return basePath;
    const normalized = basePath.replace(/\\/g, '/');
    for (const [realPath, mockPath] of Object.entries(resolvedAliasPaths)) {
      if (normalized === realPath.replace(/\\/g, '/') || normalized === realPath.replace(/\\/g, '/') + '.ts') {
        return mockPath;
      }
    }
    return basePath;
  }
  const tryPaths = isDirectory
    ? [path.join(basePath, 'index.ts'), path.join(basePath, 'index.tsx'), path.join(basePath, 'index.js')]
    : [basePath + '.js', basePath + '.ts', basePath + '.tsx'];
  for (const p of tryPaths) {
    if (fs.existsSync(p)) {
      if (shouldExempt(parent)) return p;
      const normalized = p.replace(/\\/g, '/');
      for (const [realPath, mockPath] of Object.entries(resolvedAliasPaths)) {
        if (normalized === realPath.replace(/\\/g, '/') + '.ts' || normalized === realPath.replace(/\\/g, '/') + '.tsx') {
          return mockPath;
        }
      }
      return p;
    }
  }
  throw new Error(`Cannot find module '${basePath}'`);
}
