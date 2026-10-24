import { expect, test, type Page } from '@playwright/test';

/**
 * A comic insert, by clicking (docs/plans/COMIC-STAGE-2-PLAN.md, 2.7): the
 * author sets a scene to always be a comic on its page in the editor, and the
 * web reader reads it as one — after a reload, so the setting went through
 * storage and not only through memory.
 */

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Studio', exact: true }).first()).toBeVisible();
}

/** Waits until a stored scene record holds `text`; a reload before that loses the write. */
async function persisted(page: Page, text: string): Promise<void> {
  await expect.poll(() => page.evaluate((needle) => new Promise<boolean>((resolve) => {
    const open = indexedDB.open('vne-storage');
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      let found = false;
      const cursor = db.transaction('kv', 'readonly').objectStore('kv').openCursor();
      cursor.onerror = () => { db.close(); resolve(false); };
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry || found) {
          db.close();
          resolve(found);
          return;
        }
        if (String(entry.key).startsWith('vne_scene_record_') && typeof entry.value === 'string' && entry.value.includes(needle)) found = true;
        entry.continue();
      };
    };
  }), text), { timeout: 30_000 }).toBe(true);
}

/** Sets the first scene on the editor's page to always be read as a comic. */
async function setFirstSceneToComic(page: Page, storyId: string, sceneId: string): Promise<void> {
  await page.goto(`/document-editor?storyId=${storyId}&sceneId=${sceneId}`);
  const pill = page.getByTestId('scene-comic-switch').first();
  await expect(pill).toHaveAttribute('aria-label', 'How this scene is read: Auto', { timeout: 60_000 });

  await pill.click();
  await page.getByTestId('scene-comic-comic').click();

  await expect(pill).toHaveAttribute('aria-label', 'How this scene is read: Always a comic');
  await expect(page.getByTestId(`scene-comic-badge-${sceneId}`).first()).toBeVisible();
  await persisted(page, '"comic":{"presentation":"comic"}');
}

test('an author sets a scene to always be a comic, and the reader reads it as one', async ({ page }) => {
  await openApp(page);
  await setFirstSceneToComic(page, 'demo-story-001', 'scene_1');

  await page.goto('/reader?storyId=demo-story-001');
  const comic = page.frameLocator('iframe[title="Comic"]');
  await expect(comic.locator('#strip')).toContainText('You wake up in a vast, dimly lit library.', { timeout: 60_000 });

  const option = comic.locator('button.choice', { hasText: 'Explore the shelves to your left' });
  for (let attempt = 0; attempt < 30 && !(await option.isVisible()); attempt += 1) {
    await comic.locator('#strip').click({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(200);
  }
  await option.click();

  // The next scene is left on Auto, so the story goes back to the novel.
  await expect(page.locator('body')).toContainText('You approach the towering shelves', { timeout: 30_000 });
  await expect(page.locator('iframe[title="Comic"]')).toHaveCount(0, { timeout: 10_000 });
});

test('a scene with interactive objects stays the novel, and the editor says why', async ({ page }) => {
  await openApp(page);
  await setFirstSceneToComic(page, 'demo-advanced-001', 'scene_1');

  const pill = page.getByTestId('scene-comic-switch').first();
  await expect(pill).toContainText('⚠');
  await pill.click();
  await expect(page.getByTestId('scene-comic-novel-only')).toContainText('interactive object');
  await expect(page.getByTestId(`scene-comic-badge-scene_1`).first())
    .toHaveAttribute('aria-label', 'Set to be a comic, read as the novel');

  await page.goto('/reader?storyId=demo-advanced-001');
  await expect(page.locator('body')).toContainText(/Welcome to the Enchanted Museum/i, { timeout: 60_000 });
  // Give a comic frame every chance to appear before saying it did not.
  await page.waitForTimeout(1500);
  await expect(page.locator('iframe[title="Comic"]')).toHaveCount(0);
});
