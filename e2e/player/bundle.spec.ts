import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * What an exported bundle has to do, checked against a bundle that was actually
 * exported (see `global-setup.ts`).
 *
 * The claim under test is the one R5 exists for: a story whose art came from the
 * media library plays. On the author's machine that art is an `idb-media://`
 * uri naming a browser database; in the bundle it is a file in `media/`, and
 * only the packaged asset map connects the two. If that map is wrong the reader
 * still renders — silently, with no pictures — which is why these assertions are
 * about network responses rather than about pixels.
 */

interface RequestLog {
  failures: string[];
  media: string[];
  playerConfigFetches: string[];
}

function watchRequests(page: Page): RequestLog {
  const log: RequestLog = { failures: [], media: [], playerConfigFetches: [] };

  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/media/')) log.media.push(url);
    if (url.includes('player-config.json')) log.playerConfigFetches.push(url);
    if (response.status() >= 400) log.failures.push(`${response.status()} ${url}`);
  });
  page.on('requestfailed', (request: Request) => {
    log.failures.push(`failed ${request.url()}`);
  });

  return log;
}

async function waitForReader(page: Page): Promise<void> {
  // The dialogue box is the first thing that proves the story is running rather
  // than the boot screen still being up.
  await expect(page.locator('body')).toContainText(/Welcome to the Enchanted Museum/i, {
    timeout: 60_000,
  });
}

test('boots into the reader from the inlined config', async ({ page }) => {
  const log = watchRequests(page);

  await page.goto('/');
  await waitForReader(page);

  // A fetched config would mean the inlining silently did nothing and the bundle
  // is relying on a file whose content type the next host may get wrong.
  expect(log.playerConfigFetches).toEqual([]);
});

test('serves the media-library art the release packaged', async ({ page }) => {
  const log = watchRequests(page);

  await page.goto('/');
  await waitForReader(page);

  const config = await page.evaluate(() => (window as any).__VNE_PLAYER_CONFIG__);
  const packaged = Object.values(config.assets ?? {}) as string[];
  expect(packaged.length).toBeGreaterThan(0);

  // Every packaged file the opening scene needs was actually fetched, and the
  // reference the story stored is one the map answers.
  const startScene = config.story.scenes[config.story.startSceneId];
  const background = startScene.sceneState.backgroundAssetId as string;
  expect(background).toMatch(/^idb-media:/);
  expect(config.assets[background]).toBeTruthy();

  await expect
    .poll(() => log.media.some((url) => url.endsWith(config.assets[background])), { timeout: 30_000 })
    .toBe(true);
  expect(log.failures).toEqual([]);
});

/**
 * Every packaged file, not only the one the opening scene happens to show.
 *
 * Driving the reader deep enough to touch each asset would mean scripting a
 * particular path through a branching demo, which breaks whenever the demo is
 * edited and proves less: what matters is that each file the map names is
 * actually there, served as itself. A missing one shows up as a scene with no
 * background three chapters in, long after anyone would connect it to the
 * export.
 */
test('serves every file its asset map names', async ({ page, request }) => {
  await page.goto('/');
  await waitForReader(page);

  const assets = await page.evaluate(
    () => ((window as any).__VNE_PLAYER_CONFIG__?.assets ?? {}) as Record<string, string>,
  );
  const files = [...new Set(Object.values(assets))];
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const response = await request.get(`/${file}`);
    expect(response.status(), file).toBe(200);
    // A static host reads the type off the extension; octet-stream here is how
    // packaged audio silently stops playing.
    expect(response.headers()['content-type'], file).not.toContain('octet-stream');
    expect(Number(response.headers()['content-length'] ?? '1'), file).toBeGreaterThan(0);
  }
});

test('has no editor route to reach', async ({ page }) => {
  await page.goto('/document-editor');
  // The player's router root has no such file, so the app's own not-found
  // screen is the correct answer — an editor rendering here would mean the
  // build profile leaked.
  await expect(page.locator('body')).not.toContainText(/timeline|inspector|scene manager/i);
});
