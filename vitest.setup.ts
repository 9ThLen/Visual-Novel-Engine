// vitest setup — define React Native globals missing in Node.js test environment
(globalThis as Record<string, unknown>).__DEV__ = true;