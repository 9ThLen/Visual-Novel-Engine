import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';

const validToken = 'ai-e2e-token';

async function openStoryFromStudio(page: Page, title: string): Promise<void> {
  // Wait for the shelf before looking for a card: the showcase we came from
  // also labels its posters with story titles, so querying too early matches a
  // poster clipped inside a horizontal rail and then times out clicking it.
  // «New story» exists on the shelf in every state and nowhere on the showcase.
  await expect(page.getByRole('button', { name: 'New story', exact: true }).first()).toBeVisible();

  // A card is one button named after its story, and it opens the project page —
  // no per-card «Edit» button any more. `visible: true` keeps us off any poster
  // the previous screen left mounted underneath; the wide featured card splits
  // its tap target between cover and body, hence `.first()`.
  const card = page
    .getByRole('button', { name: title, exact: true })
    .filter({ visible: true })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole('button', { name: 'Edit novel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit novel', exact: true }).click();
}

/**
 * Leave a story and come back to the shelf.
 *
 * `Exit` out of the AI panel lands on the story's own project page, which has a
 * «Studio» button and no web sidebar. This used to reach for the sidebar's
 * «Story Editor» item, which stopped existing on this screen when `/editor`
 * became the shelf — a stale step that only surfaced once the unit-test stage
 * stopped failing first and CI finally reached this suite.
 *
 * The control was named «Back» until the editor stopped leaving by walking
 * history: scene navigation pushes `/document-editor` entries, so going back
 * retraced scenes instead of leaving. It now pops to the project page, which is
 * where this helper always wanted to land, and says «Exit» because that is what
 * it does.
 */
async function backToStudio(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Studio', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Studio', exact: true }).first().click();
}

async function openStoryEditor(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Studio', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Studio', exact: true }).first().click();
  await openStoryFromStudio(page, title);
}

async function openAi(page: Page): Promise<void> {
  await openStoryEditor(page, 'The Forgotten Library');
  await page.getByText('AI', { exact: true }).click();
  await expect(page.getByText(/Ask the assistant|Попросіть асистента/)).toBeVisible();
}

async function pair(page: Page, token = validToken): Promise<void> {
  await page.getByText('Claude Code', { exact: true }).click();
  await page.getByLabel(/Pairing token|Токен підключення/).fill(token);
  await page.getByRole('button', { name: /Connect|Підключити/ }).click();
}

test('pairs with the real bridge, streams a reply, and resets provider + transcript', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();

  const composer = page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/);
  await composer.fill('hello bridge');
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
  await expect(page.getByText('Deterministic reply: hello bridge')).toBeVisible();

  await page.getByRole('button', { name: /AI settings|Налаштування AI/ }).click();
  await page.getByRole('button', { name: /Reset provider conversation|Скинути розмову провайдера/ }).click();
  await page.getByRole('button', { name: /Close|Закрити/ }).click();
  await expect(page.getByText('Deterministic reply: hello bridge')).toHaveCount(0);
  await expect(page.getByText(/Ask the assistant|Попросіть асистента/)).toBeVisible();
});

test('wrong token stops at unauthorized and keeps the composer disabled', async ({ page }) => {
  await openAi(page);
  await pair(page, 'wrong-token');
  await expect(page.getByText(/pairing token is invalid|Токен підключення недійсний/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Send|Надіслати/ })).toBeDisabled();
  await page.waitForTimeout(1_000);
  await expect(page.getByText(/pairing token is invalid|Токен підключення недійсний/)).toBeVisible();
});

test('second tab receives stable session-active guidance', async ({ page, context }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();

  const second = await context.newPage();
  await openAi(second);
  await expect(second.getByText(/already connected in another tab|в іншій вкладці/i)).toBeVisible();
  await second.waitForTimeout(1_000);
  await expect(second.getByText(/already connected in another tab|в іншій вкладці/i)).toBeVisible();
});

test('Stop interrupts a long fake turn and returns the composer to idle', async ({ page }) => {
  await openAi(page);
  await pair(page);
  const composer = page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/);
  await composer.fill('[long]');
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
  await expect(page.getByRole('button', { name: /Stop|Зупинити/ })).toBeVisible();
  await page.getByRole('button', { name: /Stop|Зупинити/ }).click();
  await expect(composer).toBeEnabled();
  await expect(page.getByText('This tail must not appear after Stop.')).toHaveCount(0);
});

test('a pending proposal does not leak across stories', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill('[proposal]');
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toBeVisible();

  await backToStudio(page);
  await openStoryFromStudio(page, 'The Enchanted Museum');
  await page.getByText('AI', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toHaveCount(0);

  await backToStudio(page);
  await openStoryFromStudio(page, 'The Forgotten Library');
  await page.getByText('AI', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toHaveCount(0);
});

test('a delivered image survives reload and imports exactly once', async ({ page, request }) => {
  await openAi(page);
  await pair(page);
  await request.get('http://127.0.0.1:18788/emit-image');
  await expect(page.getByText('Deterministic one pixel')).toBeVisible();

  await page.reload();
  await page.goto('/');
  await openStoryEditor(page, 'The Forgotten Library');
  await page.getByText('AI', { exact: true }).click();
  await expect(page.getByText('Deterministic one pixel')).toHaveCount(1);
  await page.getByRole('button', { name: /Add to story images|Додати до зображень історії/ }).click();
  await expect(page.getByText(/Added as|Додано як/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Add to story images|Додати до зображень історії/ })).toHaveCount(0);
});

test('manual editing after an AI change requires cancel or explicit force undo', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill('[proposal]');
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
  await page.getByRole('button', { name: /Apply|Застосувати/ }).click();
  await expect(page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ })).toBeVisible();

  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  await editable.click();
  await editable.press('End');
  await editable.type(' manual edit');
  await page.getByRole('button', { name: /Save|Зберегти/ }).click();
  await page.waitForTimeout(1_200);

  await page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ }).click();
  await expect(page.getByText(/Newer manual work may be overwritten|може перезаписати новіші ручні зміни/)).toBeVisible();
  await page.getByRole('button', { name: /Cancel|Скасувати/ }).click();
  await expect(page.getByText(/Newer manual work may be overwritten|може перезаписати новіші ручні зміни/)).toHaveCount(0);

  await page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ }).click();
  await page.getByRole('button', { name: /Undo anyway|Все одно скасувати/ }).click();
  await expect(page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ })).toHaveCount(0);
});

/**
 * An editor frame is built once and takes no content from props afterwards, so
 * a scene rewritten in the store used to stay invisible in the open editor —
 * and the next manual save wrote the old text back over the applied change.
 * `[rewrite]` changes text the editor is showing; `[proposal]` does not.
 */
async function applyRewrite(page: Page): Promise<void> {
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill('[rewrite]');
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
  await page.getByRole('button', { name: /Apply|Застосувати/ }).click();
}

/** Where the document is scrolled to and how tall it is; pass a number to scroll first. */
async function documentScroll(page: Page, scrollTo?: number): Promise<{ top: number; height: number }> {
  return page.evaluate((target) => {
    let node: HTMLElement | null = document.querySelector('iframe[title="VN Plate editor"]');
    while (node && !(node.scrollHeight > node.clientHeight + 4 && getComputedStyle(node).overflowY !== 'visible')) {
      node = node.parentElement;
    }
    if (!node) return { top: -1, height: -1 };
    if (typeof target === 'number') node.scrollTop = target;
    return { top: Math.round(node.scrollTop), height: node.scrollHeight };
  }, scrollTo);
}

test('an applied AI change shows in the open editor and survives the next manual save', async ({ page }) => {
  await openAi(page);
  await pair(page);
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  await expect(editable).toBeVisible();
  await expect(editable).not.toContainText('AI rewrote this line.');
  expect((await documentScroll(page, 300)).top).toBe(300);

  await applyRewrite(page);
  await expect(editable).toContainText('AI rewrote this line.');
  // The author stays where they were reading, not thrown back to the top of
  // the scene. The offset may shift by however much the rewritten text shrank.
  expect((await documentScroll(page)).top).toBeGreaterThan(0);

  // The editor's own save must leave the frame alone: rebuilding it would drop
  // the caret on every save. A mark on the frame's window dies with the frame.
  await editable.evaluate(() => {
    (window as unknown as { keptAcrossSave?: boolean }).keptAcrossSave = true;
  });
  // Keys go through the page: pressing them on the line's locator would focus
  // that element first, which takes the caret out of the editable.
  await editable.getByText('AI rewrote this line.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' manual edit');
  await expect(editable).toContainText('AI rewrote this line. manual edit');
  // The frame reports an edit on a debounce, and a save only collects what has
  // been reported: the sidebar's star is the editor saying it has heard.
  await expect(page.getByText('* scene_1', { exact: true })).toBeVisible();
  const scrollBeforeSave = await documentScroll(page);
  await page.getByRole('button', { name: /Save|Зберегти/ }).click();
  await expect(page.getByText('* scene_1', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1_200);
  expect(await editable.evaluate(() =>
    (window as unknown as { keptAcrossSave?: boolean }).keptAcrossSave === true)).toBe(true);
  // Nor may it move the page: a save used to re-pin the scroll to the top of
  // the scene, and scenes below a merge point grew taller on every render.
  await expect.poll(() => documentScroll(page)).toEqual(scrollBeforeSave);

  await page.reload();
  await expect(editable).toContainText('AI rewrote this line. manual edit');
});

test('undoing an AI change puts the old text back in the open editor', async ({ page }) => {
  await openAi(page);
  await pair(page);
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  await expect(editable).toBeVisible();
  const before = await editable.innerText();

  await applyRewrite(page);
  await expect(editable).toContainText('AI rewrote this line.');

  await page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ }).click();
  await expect(editable).not.toContainText('AI rewrote this line.');
  expect(await editable.innerText()).toBe(before);
});

/**
 * Scene-to-scene navigation stacks editor screens, and a covered one stays in
 * the DOM with its frames and its sidebar. These reach only the screen in front.
 */
async function sceneEditable(page: Page, sceneName: string): Promise<Locator> {
  // By frame, not by position: frames mount and unmount around the scene in
  // view, so the nth visible iframe is a different scene a moment later.
  const find = async (): Promise<Frame | null> => {
    for (const frame of page.frames()) {
      const element = await frame.frameElement().catch(() => null);
      if (!element || await element.getAttribute('title') !== 'VN Plate editor') continue;
      if (!(await element.isVisible())) continue;
      const name = await frame.locator('#title').inputValue({ timeout: 1_000 }).catch(() => null);
      if (name === sceneName) return frame;
    }
    return null;
  };
  await expect.poll(async () => Boolean(await find())).toBe(true);
  return ((await find()) as Frame).locator('#editor');
}

/** The sidebar's mark on a scene the editor in front holds unsaved work for. */
function unsavedMark(page: Page, sceneName: string): Locator {
  return page.getByText(`* ${sceneName}`, { exact: true }).filter({ visible: true });
}

async function typeAtEndOf(page: Page, line: Locator, text: string): Promise<void> {
  await line.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

/**
 * The frame's «new scene» command saves the scene it was typed in and opens the
 * new scene's editor on top of the one it came from. That one used to go on
 * believing its scene was unsaved, and an editor with unsaved work takes nothing
 * from the store: after the browser's Back button it still held every scene as
 * it had loaded it, and its next save wrote those copies over whatever had been
 * saved in between.
 */
test('an editor left through the frame’s «new scene» command does not undo what was saved after it', async ({ page }) => {
  await openStoryEditor(page, 'The Forgotten Library');
  const opening = await sceneEditable(page, 'scene_1');
  await typeAtEndOf(page, opening.getByText('You wake up in a vast'), ' Typed before the new scene.');
  await expect(unsavedMark(page, 'scene_1')).toBeVisible();

  // No pause before Enter: the command runs while the frame is still waiting
  // to report this typing, and that report must not arrive after the save.
  await page.keyboard.type(' /newScene');
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('sceneId') !== 'scene_1');

  // In the new scene's editor, rewrite a scene the first editor holds too.
  await page.getByText('scene_2', { exact: true }).filter({ visible: true }).first().click();
  const above = await sceneEditable(page, 'scene_2');
  await typeAtEndOf(page, above.getByText('You approach the towering shelves'), ' Saved from the screen above.');
  await expect(unsavedMark(page, 'scene_2')).toBeVisible();
  await page.getByRole('button', { name: /Save|Зберегти/ }).click();
  await expect(unsavedMark(page, 'scene_2')).toHaveCount(0);

  await page.goBack();
  await page.waitForURL((url) => url.searchParams.get('sceneId') === 'scene_1');
  // The editor underneath has caught up with the store while it was covered.
  await expect(await sceneEditable(page, 'scene_2')).toContainText('Saved from the screen above.');

  const returned = await sceneEditable(page, 'scene_1');
  await typeAtEndOf(page, returned.getByText('Typed before the new scene.'), ' And after coming back.');
  await expect(unsavedMark(page, 'scene_1')).toBeVisible();
  await page.getByRole('button', { name: /Save|Зберегти/ }).click();
  await expect(unsavedMark(page, 'scene_1')).toHaveCount(0);
  // The store reaches IndexedDB a beat after the save.
  await page.waitForTimeout(1_200);

  await page.reload();
  await expect(await sceneEditable(page, 'scene_1')).toContainText('Typed before the new scene. And after coming back.');
  await expect(await sceneEditable(page, 'scene_2')).toContainText('Saved from the screen above.');
});
