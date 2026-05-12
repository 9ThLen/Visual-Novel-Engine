// vitest setup — define React Native globals missing in Node.js test environment
(globalThis as any).__DEV__ = true;