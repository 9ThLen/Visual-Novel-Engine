// @ts-nocheck — vitest setup
(globalThis as Record<string, unknown>).__DEV__ = true;

const Module = require('module');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname);

// Map Vite aliases for CJS require() — maps import specifier → mock file path
const aliases = {
  'react-native': path.join(rootDir, '__mocks__/react-native.ts'),
  '@react-navigation/native': path.join(rootDir, '__mocks__/react-navigation-native.ts'),
  'expo-audio': path.join(rootDir, '__mocks__/expo-audio.ts'),
  'expo-image': path.join(rootDir, '__mocks__/expo-image.ts'),
  'expo-file-system/legacy': path.join(rootDir, '__mocks__/expo-file-system-legacy.ts'),
  'expo-asset': path.join(rootDir, '__mocks__/expo-asset.ts'),
  'expo-linking': path.join(rootDir, '__mocks__/expo-linking.ts'),
  'expo-modules-core': path.join(rootDir, '__mocks__/expo-modules-core.ts'),
  'expo-router': path.join(rootDir, '__mocks__/expo-router.ts'),
  'expo-secure-store': path.join(rootDir, '__mocks__/expo-secure-store.ts'),
  'react-native-reanimated': path.join(rootDir, '__mocks__/react-native-reanimated.ts'),
  '@/stores/use-app-store': path.join(rootDir, '__mocks__/stores/use-app-store.ts'),
  '@/lib/asset-resolver': path.join(rootDir, '__mocks__/lib/asset-resolver.ts'),
  '@/lib/audio-manager-enhanced': path.join(rootDir, '__mocks__/lib/audio-manager-enhanced.ts'),
  '@/lib/audio-library': path.join(rootDir, '__mocks__/lib/audio-library.ts'),
};

// Build a map of resolved real paths → mock paths for relative import interception
const resolvedAliasPaths = {};
for (const [specifier, mockPath] of Object.entries(aliases)) {
  if (specifier.startsWith('@/')) {
    const realPath = path.join(rootDir, specifier.slice(2));
    resolvedAliasPaths[realPath] = mockPath;
  }
}

// Files that should NOT get the mocked version for matching aliases
const mockExemptFiles = [
  path.join(rootDir, '__tests__/unit/lib/audio-library.test.ts'),
  path.join(rootDir, '__tests__/unit/lib/audio-manager-enhanced.test.ts'),
  path.join(rootDir, '__tests__/unit/lib/asset-resolver.test.ts'),
  path.join(rootDir, '__mocks__/lib/audio-library.ts'),
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
      jsx: getTs().JsxEmit.React,
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
    const realPath = path.join(rootDir, request.slice(2));
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
  if (fs.existsSync(basePath)) {
    if (shouldExempt(parent)) return basePath;
    const normalized = basePath.replace(/\\/g, '/');
    for (const [realPath, mockPath] of Object.entries(resolvedAliasPaths)) {
      if (normalized === realPath.replace(/\\/g, '/') || normalized === realPath.replace(/\\/g, '/') + '.ts') {
        return mockPath;
      }
    }
    return basePath;
  }
  const tryPaths = [basePath + '.js', basePath + '.ts', basePath + '.tsx'];
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
