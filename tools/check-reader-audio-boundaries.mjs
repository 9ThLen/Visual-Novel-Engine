import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'lib/reader-runtime.ts',
  'hooks/useReaderInitialization.ts',
  'hooks/useReaderAudio.ts',
  'hooks/useAutoSave.ts',
  'lib/audio-types.ts',
  'lib/bundled-story-sync.ts',
];

let hasViolations = false;

console.log('Checking reader/audio SceneRecord boundaries...');

for (const file of files) {
  const path = resolve(repoRoot, file);
  if (!existsSync(path)) continue;

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('SceneRecord')) {
      console.log(`${file}:${index + 1}: ${line.trim()}`);
      hasViolations = true;
    }
  });
}

if (hasViolations) {
  console.log('');
  console.log('FAIL: reader/audio boundary violation(s) found');
  console.log('Use lib/reader-scene.ts or lib/audio-scene.ts projections at canonical boundaries.');
  process.exit(1);
}

console.log('Reader/audio boundary check passed.');
