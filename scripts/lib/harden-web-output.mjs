import fs from 'node:fs';
import path from 'node:path';

export const WEB_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:;";

const SECURITY_MARKER = 'data-vne-web-security';
const FRAME_GUARD = "if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location=window.self.location}catch{}}";

/** Add the production CSP and clickjacking guard to Expo's single-page output. */
export function hardenWebOutput(outputDir) {
  const indexPath = path.join(outputDir, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('</head>')) throw new Error(`Cannot harden web output without </head>: ${indexPath}`);

  // Re-harden idempotently so a changed policy cannot leave stale tags in a
  // reused export directory.
  html = html
    .replace(/<meta data-vne-web-security[^>]*>/g, '')
    .replace(/<script data-vne-web-security>[\s\S]*?<\/script>/g, '');
  const securityHtml = [
    `<meta ${SECURITY_MARKER} http-equiv="Content-Security-Policy" content="${WEB_CSP}">`,
    `<script ${SECURITY_MARKER}>${FRAME_GUARD}</script>`,
  ].join('');
  html = html.replace('</head>', `${securityHtml}</head>`);
  fs.writeFileSync(indexPath, html);

  // GitHub Pages has no SPA rewrite rule. Its custom 404 page still runs the
  // client router, so direct links and refreshes remain usable.
  fs.writeFileSync(path.join(outputDir, '404.html'), html);
}
