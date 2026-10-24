import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

/**
 * A comic scene in a published story (docs/plans/COMIC-STAGE-2-PLAN.md, 2.7),
 * read in a bundle that was actually exported (see `global-setup.ts`): the
 * story's scene setting has to survive the release and the export, and the
 * comic frame has to run under what a published player runs under — the
 * bundle's CSP when it is served, nothing at all when it is opened from disk.
 *
 * The route: the entrance (set to be a comic, but it holds interactive
 * objects, so it is read as the novel) → "Read the sign first" → the sign
 * (a comic) → "Enter the museum" → the Grand Hall (the novel again).
 */

const COMIC_BUNDLE = path.join(process.cwd(), 'tests/e2e/player/.comic-bundle');
const COMIC_PORT = 8096;
const comicOrigin = `http://127.0.0.1:${COMIC_PORT}`;

interface Trouble {
  failures: string[];
  /** Requests that left the page's own origin, or any at all from a file page. */
  outside: string[];
}

function watch(page: Page, allowedOrigin: string | null): Trouble {
  const trouble: Trouble = { failures: [], outside: [] };
  page.on('request', (request) => {
    const url = request.url();
    if (!/^https?:/i.test(url)) return;
    if (!allowedOrigin || !url.startsWith(allowedOrigin)) trouble.outside.push(url);
  });
  page.on('requestfailed', (request) => {
    trouble.failures.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) trouble.failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') trouble.failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => trouble.failures.push(`page: ${error.message}`));
  return trouble;
}

/** Advances the novel until `option` is offered, then takes it. */
async function chooseInNovel(page: Page, option: string): Promise<void> {
  const choice = page.getByRole('button', { name: `Choice: ${option}`, exact: true });
  const advance = page.getByRole('button', { name: 'Continue reading' }).first();
  for (let attempt = 0; attempt < 30 && !(await choice.isVisible()); attempt += 1) {
    // High on the right, in the sky: the entrance's interactive objects sit
    // in the middle band and the choices come up in the dialogue box, so a
    // tap here reaches the reader and nothing else. Playwright refuses the
    // click if anything covers the control there.
    const box = await advance.boundingBox();
    if (!box) throw new Error('No "Continue reading" control on screen');
    await advance.click({ position: { x: box.width * 0.85, y: box.height * 0.12 } });
    await page.waitForTimeout(150);
  }
  await choice.click();
}

async function readTheComicRoute(page: Page): Promise<void> {
  await expect(page.locator('body')).toContainText(/Welcome to the Enchanted Museum/i, { timeout: 60_000 });
  // Set to be a comic, read as the novel: the entrance has interactive objects.
  await expect(page.locator('iframe[title="Comic"]')).toHaveCount(0);

  await chooseInNovel(page, 'Read the sign first');

  const comic = page.frameLocator('iframe[title="Comic"]');
  await expect(page.locator('iframe[title="Comic"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(comic.locator('#strip')).toContainText('You approach the ornate sign', { timeout: 30_000 });

  // A tap opens the next panel; the choice waits at the end of the strip.
  const enter = comic.locator('button.choice', { hasText: 'Enter the museum' });
  for (let attempt = 0; attempt < 30 && !(await enter.isVisible()); attempt += 1) {
    await comic.locator('#strip').click({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(200);
  }
  await expect(comic.locator('.panel').first()).toBeVisible();
  // Words are drawn as text, and every panel the reader opened is there.
  expect(await comic.locator('.panel').count()).toBeGreaterThan(1);
  await enter.click();

  // Back to the novel: the strip slides away and ends.
  await expect(page.locator('body')).toContainText(/You step into the Grand Hall/i, { timeout: 30_000 });
  await expect(page.locator('iframe[title="Comic"]')).toHaveCount(0, { timeout: 10_000 });
}

test.describe('a comic scene in a published story', () => {
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    server = spawn(
      process.execPath,
      [path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'tests/e2e/player/serve-bundle.ts', COMIC_BUNDLE, String(COMIC_PORT)],
      { cwd: process.cwd(), stdio: 'ignore' },
    );
    await expect
      .poll(async () => {
        try {
          return (await fetch(`${comicOrigin}/__health`)).ok;
        } catch {
          return false;
        }
      }, { timeout: 30_000 })
      .toBe(true);
  });

  test.afterAll(() => {
    server?.kill();
  });

  test('reads as a comic in the served bundle, under its CSP', async ({ page }) => {
    const trouble = watch(page, comicOrigin);
    await page.goto(`${comicOrigin}/`);

    await readTheComicRoute(page);

    expect(trouble.failures).toEqual([]);
    expect(trouble.outside).toEqual([]);
  });

  test('reads as a comic from a double-clicked index.html, with no network', async ({ page }) => {
    const trouble = watch(page, null);
    await page.goto(pathToFileURL(path.join(COMIC_BUNDLE, 'index.html')).href);

    await readTheComicRoute(page);

    expect(trouble.failures).toEqual([]);
    expect(trouble.outside).toEqual([]);
  });
});
