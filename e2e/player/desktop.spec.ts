import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * What the staged desktop project has to be, checked against a project that was
 * actually staged (see `global-setup.ts`).
 *
 * The build itself is not here, and cannot be: `tauri build` needs a Rust
 * toolchain, and nothing about it is checkable on a machine without one. What
 * *is* checkable is everything that decides whether the resulting installer is
 * the right application containing a playable story — and those are the failures
 * that would otherwise be found by a reader, since a build of the wrong thing
 * succeeds exactly as loudly as a build of the right one.
 *
 * The page is opened from `file://` rather than from the suite's static host.
 * Tauri serves the frontend from the root of its own origin, which is strictly
 * easier than a filesystem page — so a staged bundle that plays from a
 * double-click plays under Tauri, and one that needs a server plays under
 * neither.
 */

const DESKTOP_DIR = path.join(process.cwd(), 'e2e/player/.desktop');
const SRC_TAURI = path.join(DESKTOP_DIR, 'src-tauri');

interface TauriConfig {
  productName: string;
  version: string;
  identifier: string;
  build: { frontendDist: string };
  app: { windows: { title: string }[]; security: { csp: unknown } };
  bundle: { targets: string[]; icon: string[] };
}

function readConfig(): TauriConfig {
  return JSON.parse(fs.readFileSync(path.join(SRC_TAURI, 'tauri.conf.json'), 'utf8')) as TauriConfig;
}

function frontendDir(config: TauriConfig): string {
  return path.resolve(SRC_TAURI, config.build.frontendDist);
}

async function waitForReader(page: Page): Promise<void> {
  await expect(page.locator('body')).toContainText(/Welcome to the Enchanted Museum/i, {
    timeout: 60_000,
  });
}

test('is named after the story rather than after the template', () => {
  const config = readConfig();

  expect(config.productName).toBe('The Enchanted Museum');
  expect(config.version).toBe('1.0.0');
  // Derived from the story id, so it survives a rename. Two novels sharing one
  // identifier would install over each other and share saved games.
  expect(config.identifier).toMatch(/^com\.vne\.story\.demoadvanced001\./);
  expect(config.app.windows[0].title).toBe('The Enchanted Museum');
});

test('points at a frontend that is really there', () => {
  const config = readConfig();
  const frontend = frontendDir(config);

  expect(fs.existsSync(path.join(frontend, 'index.html'))).toBe(true);
  // Tauri resolves `frontendDist` only at the end of the Rust build, so a wrong
  // path costs a full compile before it is reported.
  expect(fs.existsSync(path.join(frontend, 'media'))).toBe(true);
});

/**
 * The staged copy, not the source bundle. A copy is where files quietly go
 * missing, and a missing background three chapters in is invisible to whoever
 * ran the build.
 */
test('carries every media file the bundle had', () => {
  const config = readConfig();
  const source = path.join(process.cwd(), 'e2e/player/.bundle/media');
  const staged = path.join(frontendDir(config), 'media');

  const sourceFiles = fs.readdirSync(source).sort();
  expect(sourceFiles.length).toBeGreaterThan(0);
  expect(fs.readdirSync(staged).sort()).toEqual(sourceFiles);

  for (const file of sourceFiles) {
    expect(fs.statSync(path.join(staged, file)).size, file)
      .toBe(fs.statSync(path.join(source, file)).size);
  }
});

test('leaves the page to declare its own policy, and asks for no permissions', () => {
  const config = readConfig();
  // Tauri would otherwise inject a CSP of its own over the bundle's, which the
  // player deliberately ships without: `default-src 'self'` is unsatisfiable
  // from a page with an opaque origin, and this same folder must also work
  // double-clicked.
  expect(config.app.security.csp).toBeNull();

  const capability = JSON.parse(
    fs.readFileSync(path.join(SRC_TAURI, 'capabilities', 'default.json'), 'utf8'),
  );
  expect(capability.permissions).toEqual(['core:default']);
});

/**
 * The claim the whole channel rests on: the staged frontend is a playable story
 * and needs nothing from the network.
 */
test('plays the story it staged, offline', async ({ page }) => {
  const failures: string[] = [];
  const networkRequests: string[] = [];
  page.on('request', (request: Request) => {
    if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
  });
  page.on('requestfailed', (request: Request) => {
    failures.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });

  const index = path.join(frontendDir(readConfig()), 'index.html');
  await page.goto(pathToFileURL(index).href);
  await waitForReader(page);

  const config = await page.evaluate(() => (window as never as {
    __VNE_PLAYER_CONFIG__?: { story: Record<string, never>; assets?: Record<string, string> };
  }).__VNE_PLAYER_CONFIG__);
  expect(config?.story).toBeTruthy();

  const story = config?.story as unknown as {
    id: string;
    startSceneId: string;
    scenes: Record<string, { sceneState: { backgroundAssetId: string } }>;
  };
  const background = story.scenes[story.startSceneId].sceneState.backgroundAssetId;
  const packaged = config?.assets?.[background];
  expect(packaged).toBeTruthy();

  // Drawn, not merely served: an asset map that resolves against a server root
  // returns a broken image from a file page without failing a request.
  await expect
    .poll(() => page.evaluate((file) => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.some((image) => image.currentSrc.includes(file) && image.naturalWidth > 0);
    }, packaged as string), { timeout: 30_000 })
    .toBe(true);

  expect(failures).toEqual([]);
  expect(networkRequests).toEqual([]);
});
