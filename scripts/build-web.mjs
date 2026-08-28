import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hardenWebOutput } from './lib/harden-web-output.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [path.join(repoRoot, 'node_modules', 'expo', 'bin', 'cli'), 'export', '--platform', 'web'],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
hardenWebOutput(path.join(repoRoot, 'dist'));
console.log('Applied production CSP and clickjacking guard to dist/index.html');
