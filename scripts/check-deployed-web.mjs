import process from 'node:process';

const pageUrl = process.argv[2];
if (!pageUrl) throw new Error('Usage: node scripts/check-deployed-web.mjs <page-url>');
const pageRoot = new URL(pageUrl);
if (!pageRoot.pathname.endsWith('/')) pageRoot.pathname += '/';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function verify() {
  const response = await fetch(pageRoot, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Page returned HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes('data-vne-web-security')) throw new Error('Hardened production HTML was not deployed');

  const scriptSrc = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  if (!scriptSrc) throw new Error('Production JavaScript bundle was not referenced');
  const scriptUrl = new URL(scriptSrc, pageRoot);
  const scriptResponse = await fetch(scriptUrl, { cache: 'no-store' });
  if (!scriptResponse.ok) throw new Error(`JavaScript bundle returned HTTP ${scriptResponse.status}: ${scriptUrl}`);

  const fallbackResponse = await fetch(new URL('404.html', pageRoot), { cache: 'no-store' });
  if (!fallbackResponse.ok) throw new Error(`SPA fallback returned HTTP ${fallbackResponse.status}`);
}

let lastError;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    await verify();
    console.log(`Verified deployed web app: ${pageUrl}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 10) await wait(3_000);
  }
}
throw lastError;
