import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  outfile: resolve(dist, 'cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});

await Promise.all([
  copyFile(resolve(root, 'src/system-prompt.md'), resolve(dist, 'system-prompt.md')),
  copyFile(resolve(root, 'src/codex-response-schema.json'), resolve(dist, 'codex-response-schema.json')),
]);
