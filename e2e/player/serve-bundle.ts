/**
 * A static server for the exported bundle, with no dependency on whatever
 * `npx serve` happens to do this week.
 *
 * It answers exactly like a plain static host: real files as themselves, and
 * anything else as `index.html` so the client router keeps working on a reload.
 * That fallback is the reason the boot config is inlined rather than fetched —
 * a host answering a missing `player-config.json` with an HTML page is the trap
 * this reproduces faithfully.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] ?? 'e2e/player/.bundle');
const port = Number(process.argv[3] ?? 8095);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function resolveFile(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.resolve(root, `.${decoded}`);
  // Never serve outside the bundle, whatever the request says.
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const indexed = path.join(candidate, 'index.html');
  if (existsSync(indexed)) return indexed;
  return null;
}

createServer((request, response) => {
  // Playwright starts this before the global setup has produced the bundle, so
  // readiness cannot be "index.html exists yet".
  if ((request.url ?? '').startsWith('/__health')) {
    response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }

  const file = resolveFile(request.url ?? '/') ?? path.join(root, 'index.html');
  if (!existsSync(file)) {
    response.writeHead(404).end('no bundle');
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
