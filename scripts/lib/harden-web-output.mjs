import fs from 'node:fs';
import path from 'node:path';

export const WEB_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https: wss: ws:; frame-src 'self' https:;";

const SECURITY_MARKER = 'data-vne-web-security';

/**
 * The origin Tauri serves its IPC from, which the web CSP has no reason to know
 * about and every reason not to carry.
 *
 * `connect-src 'self' https: wss: ws:` does not cover `http://ipc.localhost`, so
 * in the installed studio Tauri's IPC is refused and it silently falls back to
 * the postMessage interface. Nothing registers a command today, so nothing is
 * visibly broken — the first thing to depend on IPC would be the first to find
 * out, which is the sort of failure that costs a day.
 *
 * Only the Windows origin is listed, because only it has been observed. Tauri
 * uses `ipc://localhost` elsewhere and the studio ships `nsis` alone; whoever
 * builds for another platform adds it after seeing it, the same rule
 * `src/lib/ai/studio-origins.ts` follows.
 */
export const TAURI_IPC_ORIGINS = ['http://ipc.localhost'];

/**
 * The web CSP with Tauri's IPC origin allowed to be connected to.
 *
 * Derived rather than written out, so the policy has one source and a future
 * tightening of `WEB_CSP` cannot leave this copy behind.
 */
export function desktopStudioCsp(csp = WEB_CSP) {
  const directive = /connect-src ([^;]*);/;
  if (!directive.test(csp)) {
    throw new Error('The web CSP has no connect-src directive to extend.');
  }
  return csp.replace(directive, (_match, sources) => {
    const present = new Set(String(sources).trim().split(/\s+/));
    const added = TAURI_IPC_ORIGINS.filter((origin) => !present.has(origin));
    return `connect-src ${String(sources).trim()}${added.length ? ` ${added.join(' ')}` : ''};`;
  });
}

/**
 * Rewrites an already-hardened `index.html` for the desktop studio.
 *
 * Applied while staging rather than while building, so `build:web` keeps
 * producing one bundle that the web channel and the player both use unchanged.
 * Only the studio's own copy is relaxed.
 *
 * @param {string} indexPath
 */
export function relaxCspForDesktopStudio(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const tag = new RegExp(`<meta ${SECURITY_MARKER} http-equiv="Content-Security-Policy" content="([^"]*)">`);
  const match = tag.exec(html);
  if (!match) throw new Error(`No hardened CSP to relax in ${indexPath}`);
  const relaxed = html.replace(match[0], match[0].replace(match[1], desktopStudioCsp(match[1])));
  fs.writeFileSync(indexPath, relaxed);
  return desktopStudioCsp(match[1]);
}
const FRAME_GUARD = "if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location=window.self.location}catch{}}";

/**
 * Let the router survive a page opened straight off the filesystem.
 *
 * A `file://` document has an opaque origin, and `history.replaceState` refuses
 * to run there — it throws a SecurityError. Expo Router calls it while working
 * out the initial route, the exception escapes before React mounts, and the
 * reader is left looking at the "You need to enable JavaScript" fallback with no
 * hint why.
 *
 * Swallowing it costs nothing that matters: the address bar of a double-clicked
 * file is not somewhere anyone navigates from, and the router keeps its own
 * state either way. Only the file protocol is touched, so a hosted bundle still
 * gets real history.
 *
 * This lives here rather than in `+html.tsx` because Expo ignores that file for
 * `web.output: 'single'` — which is also why the CSP is written here.
 */
const FILE_HISTORY_GUARD = "if(location.protocol==='file:'){var p=history.pushState.bind(history),r=history.replaceState.bind(history);history.pushState=function(){try{p.apply(history,arguments)}catch(e){}};history.replaceState=function(){try{r.apply(history,arguments)}catch(e){}}}";

/**
 * Add the production CSP and clickjacking guard to Expo's single-page output.
 *
 * `csp: false` writes only the frame guard. That is what a published player
 * bundle needs: `default-src 'self'` is unsatisfiable from a `file://` page, so
 * a reader who double-clicks `index.html` would get a blank screen. A bundle is
 * static files with one story inlined — no input, no third-party content — while
 * the clickjacking guard still earns its place, because bundles get hosted and
 * framed.
 *
 * `fileProtocol: true` adds the history guard a bundle needs to open from a
 * double-clicked `index.html`.
 *
 * @param {string} outputDir
 * @param {{ csp?: boolean, fileProtocol?: boolean }} [options]
 */
export function hardenWebOutput(outputDir, options = {}) {
  const withCsp = options.csp !== false;
  const withFileProtocol = options.fileProtocol === true;
  const indexPath = path.join(outputDir, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('</head>')) throw new Error(`Cannot harden web output without </head>: ${indexPath}`);

  // Re-harden idempotently so a changed policy cannot leave stale tags in a
  // reused export directory.
  html = html
    .replace(/<meta data-vne-web-security[^>]*>/g, '')
    .replace(/<script data-vne-web-security>[\s\S]*?<\/script>/g, '');
  const securityHtml = [
    ...(withCsp
      ? [`<meta ${SECURITY_MARKER} http-equiv="Content-Security-Policy" content="${WEB_CSP}">`]
      : []),
    // Before the frame guard and before the bundle: the router runs on load.
    ...(withFileProtocol ? [`<script ${SECURITY_MARKER}>${FILE_HISTORY_GUARD}</script>`] : []),
    `<script ${SECURITY_MARKER}>${FRAME_GUARD}</script>`,
  ].join('');
  html = html.replace('</head>', `${securityHtml}</head>`);
  fs.writeFileSync(indexPath, html);

  // GitHub Pages has no SPA rewrite rule. Its custom 404 page still runs the
  // client router, so direct links and refreshes remain usable.
  fs.writeFileSync(path.join(outputDir, '404.html'), html);
}
