import { chromium } from '@playwright/test';

/**
 * Warm the Metro bundle before the first test runs.
 *
 * Playwright's `webServer.url` check only proves the Expo dev server answers
 * HTTP — it responds with `index.html` long before Metro has finished building
 * the bundle that page asks for. Without this, the first `page.goto('/')` of the
 * suite pays the whole cold build (~34s on CI) and then races the app's own
 * boot, which is what made the suite fail on a blank page.
 *
 * Failing here is not fatal: the tests still run, they just start cold.
 */
async function globalSetup(): Promise<void> {
  const appOrigin = process.env.AI_E2E_APP_ORIGIN ?? 'http://127.0.0.1:8081';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const started = Date.now();
  try {
    await page.goto(appOrigin, { waitUntil: 'load', timeout: 180_000 });
    // `/` redirects to the showcase home; wait for real content, not just load.
    await page
      .getByRole('button', { name: 'Studio', exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 120_000 });
    console.log(`[global-setup] bundle warm after ${Date.now() - started}ms`);
  } catch (error) {
    console.warn(`[global-setup] warm-up did not complete: ${String(error)}`);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
