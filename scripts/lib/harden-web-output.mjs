import fs from 'node:fs';
import path from 'node:path';

export const WEB_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:;";

const SECURITY_MARKER = 'data-vne-web-security';
const FRAME_GUARD = "if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location=window.self.location}catch{}}";

/** Add the production CSP and clickjacking guard to Expo's single-page output. */
export function hardenWebOutput(outputDir) {
  const indexPath = path.join(outputDir, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  if (html.includes(SECURITY_MARKER)) return;
  if (!html.includes('</head>')) throw new Error(`Cannot harden web output without </head>: ${indexPath}`);

  const securityHtml = [
    `<meta ${SECURITY_MARKER} http-equiv="Content-Security-Policy" content="${WEB_CSP}">`,
    `<script ${SECURITY_MARKER}>${FRAME_GUARD}</script>`,
  ].join('');
  fs.writeFileSync(indexPath, html.replace('</head>', `${securityHtml}</head>`));
}
