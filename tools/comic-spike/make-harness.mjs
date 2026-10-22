/**
 * Builds the comic spike's browser harness into <out>:
 *   index.html, host.js (harness-host.ts with the real renderer modules),
 *   img/<key>.png — the demo art the spike strip names, copied as shipped.
 *
 *   node tools/comic-spike/make-harness.mjs <out>
 *
 * measure-web.mjs serves <out> from disk, so nothing in it needs a server.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('usage: node tools/comic-spike/make-harness.mjs <out>');
  process.exit(1);
}

const IMAGE_FILES = {
  'bg-ancient-library': 'assets/background/bg-ancient-library.png',
  'bg-grand-hall': 'assets/background/bg-grand-hall.png',
  'bg-hall-mirrors': 'assets/background/bg-hall-mirrors.png',
  'bg-museum-entrance': 'assets/background/bg-museum-entrance.png',
  'bg-treasure-chamber': 'assets/background/bg-treasure-chamber.png',
  'bg-upper-library': 'assets/background/bg-upper-library.png',
  'char-librarian': 'assets/charakters/char-librarian.png',
  'char-guide': 'assets/charakters/char-guide.png',
  'char-reflection': 'assets/charakters/char-reflection.png',
  'char-demo-curator': 'assets/charakters/char-demo-curator.png',
};

fs.mkdirSync(path.join(out, 'img'), { recursive: true });
for (const [key, file] of Object.entries(IMAGE_FILES)) {
  fs.copyFileSync(path.join(repoRoot, file), path.join(out, 'img', `${key}.png`));
}

await build({
  entryPoints: [path.join(repoRoot, 'tools/comic-spike/harness-host.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2019',
  outfile: path.join(out, 'host.js'),
  alias: { '@': path.join(repoRoot, 'src') },
  logLevel: 'warning',
});

fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Comic spike harness</title><style>html,body{margin:0;background:#141417}</style></head>
<body><script src="host.js"></script></body></html>
`);
console.log(`harness written to ${out}`);
