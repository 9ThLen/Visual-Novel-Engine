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

  const publicAssets = [
    'vendor/weather-effects/rain/drop-alpha.png',
    'vendor/weather-effects/rain/drop-color.png',
    'vendor/weather-effects/fog/fog-element.png',
    'vendor/weather-effects/fog/dense-fog-element.png',
  ];
  for (const assetPath of publicAssets) {
    const assetUrl = new URL(assetPath, pageRoot);
    const assetResponse = await fetch(assetUrl, { cache: 'no-store' });
    if (!assetResponse.ok) {
      throw new Error(`Public runtime asset returned HTTP ${assetResponse.status}: ${assetUrl}`);
    }
  }
}

async function verifyInBrowser() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const routes = [
    '',
    'tabs',
    'reader?storyId=deployment-smoke',
    'document-editor?storyId=deployment-smoke&sceneId=deployment-smoke',
    'definitely-missing',
  ];
  // Every deep route is served by the SPA fallback, and Pages must answer it
  // with a 404 status for that to work at all — so the browser logs the
  // document's own status as a console error. Those are the routes we asked
  // for, so their document errors are the deployment working. A 404 on
  // anything else, a missing chunk or asset, is still a real failure.
  const requestedDocuments = new Set(routes.map((route) => new URL(route, pageRoot).toString()));
  try {
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const sourceUrl = message.location().url;
      // The generic editor intentionally probes for this optional player flag.
      if (sourceUrl.endsWith('/player-config.json')) return;
      if (requestedDocuments.has(sourceUrl)) return;
      runtimeErrors.push(`${message.text()} (${sourceUrl})`);
    });

    for (const route of routes) {
      await page.goto(new URL(route, pageRoot).toString(), { waitUntil: 'domcontentloaded' });
      // The fallback has to actually boot the app, not just return a document.
      await page.locator('#root > *').first().waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForTimeout(1_000);
    }

    if (runtimeErrors.length > 0) {
      throw new Error(`Deployed browser smoke reported runtime errors:\n${runtimeErrors.join('\n')}`);
    }
  } finally {
    await browser.close();
  }
}

let lastError;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    await verify();
    await verifyInBrowser();
    console.log(`Verified deployed web app: ${pageUrl}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 10) await wait(3_000);
  }
}
throw lastError;
