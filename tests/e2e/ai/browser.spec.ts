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

  await persisted(page, 'AI rewrote this line. manual edit');
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
async function sceneEditable(page: Page, sceneName: string, timeout?: number): Promise<Locator> {
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
  await expect.poll(async () => Boolean(await find()), { timeout }).toBe(true);
  return ((await find()) as Frame).locator('#editor');
}

/**
 * Opens a scene from the sidebar of the editor in front. An editor that has
 * just been pushed scrolls to its own scene as it mounts, and a click that
 * lands before that is overridden; on a slow machine the test got there
 * first. The author would click again, and so does this.
 */
async function openFromSidebar(page: Page, sceneName: string): Promise<Locator> {
  await expect(async () => {
    // A scene the editor holds unsaved work for is listed as `* name`.
    await page.getByText(new RegExp(`^(\\* )?${sceneName}$`)).filter({ visible: true }).first().click();
    await sceneEditable(page, sceneName, 5_000);
  }).toPass({ timeout: 90_000 });
  return sceneEditable(page, sceneName);
}

/**
 * Waits until a scene record in IndexedDB holds `text`. The store writes
 * there a beat after a save, and on a slow machine the beat is long: a reload
 * taken before it brings back what was there before the save.
 */
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
  const above = await openFromSidebar(page, 'scene_2');
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
  await persisted(page, 'Typed before the new scene. And after coming back.');
  await persisted(page, 'Saved from the screen above.');

  await page.reload();
  await expect(await sceneEditable(page, 'scene_1')).toContainText('Typed before the new scene. And after coming back.');
  await expect(await sceneEditable(page, 'scene_2')).toContainText('Saved from the screen above.');
});

/**
 * The assistant is told what the author is pointing at: the fake bridge reads
 * the context block the real bridge appended and answers from it alone.
 */
async function send(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill(text);
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
}

test('a request about the selection changes the selected line and no other', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  const selected = editable.locator('p[data-kind="text"]').first();
  const neighbour = editable.locator('.choice-block').first();
  const untouched = await neighbour.innerText();
  expect((await selected.innerText()).trim().length).toBeGreaterThan(0);

  // Typed a moment before sending: the capture has to save it for the address to be exact.
  await selected.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Fresh words.');
  await selected.click({ clickCount: 3 });
  await expect(page.getByText(/Selected text|Виділений текст/)).toBeVisible();

  await send(page, '[rewrite-selection]');
  await page.getByRole('button', { name: /Apply|Застосувати/ }).click();

  await expect(editable).toContainText('AI rewrote the selected line.');
  await expect(editable).not.toContainText('Fresh words.');
  expect(await neighbour.innerText()).toBe(untouched);
  await expect(page.getByText(/↳ «/)).toBeVisible();
});

/**
 * Two things that used to make a change unusable for a scene the author had
 * just typed a new paragraph into.
 *
 * Enter splits a line by cloning it, and both halves were saved under the step
 * id of the paragraph that was loaded; a scene with two steps under one id
 * fails validation, so no change to it could even be proposed.
 *
 * And the frame reports an edit a quarter of a second after it is made, while
 * the capture on send takes it sooner. That later report must not turn the
 * scene unsaved again: the next save would give the new paragraph a new step
 * id, and the change waiting to be applied would be for a revision that no
 * longer exists.
 */
test('a paragraph typed a moment before sending does not make the proposal stale', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');

  // Written first, so one click is all that stands between the last key and the send.
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill('[proposal]');
  await editable.locator('p[data-kind="text"]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('A paragraph typed just now.');
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();

  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toBeVisible();
  // Long enough for the frame's own report to have come and gone.
  await page.waitForTimeout(600);
  await expect(page.getByText('* scene_1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Apply|Застосувати/ }).click();
  await expect(page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ })).toBeVisible();

  await persisted(page, 'A paragraph typed just now.');
  await page.reload();
  await expect(editable).toContainText('A paragraph typed just now.');
});

/**
 * The frame tells the host about a keystroke a quarter of a second later. A
 * change applied inside that quarter second used to go into the store over a
 * scene the host believed was saved, and the frame was then rebuilt from the
 * store: the words just typed were gone. The barrier in front of the change
 * now asks the frames themselves, saves what they hold, and the change — made
 * for the text as it was before — is refused as out of date.
 */
test('a change applied a moment after a keystroke does not cost the author that keystroke', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  await send(page, '[rewrite]');
  const apply = page.getByRole('button', { name: /Apply|Застосувати/ });
  await expect(apply).toBeVisible();

  await editable.locator('p[data-kind="text"]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Typed late.');
  await apply.click();

  await expect(page.getByText(/scene changed since this patch|Сцена змінилася відтоді/)).toBeVisible();
  await expect(editable).toContainText('Typed late.');
  await expect(editable).not.toContainText('AI rewrote this line.');
  await persisted(page, 'Typed late.');
  await page.reload();
  await expect(editable).toContainText('Typed late.');
});

/**
 * The rail unmounts the chat when the author opens the inspector. The session
 * used to live in the chat, so that one click closed the connection and threw
 * away a proposal the author had not decided on. It is held by the editor now.
 */
test('a proposal waits behind the inspector tab, and the connection with it', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  await send(page, '[proposal]');
  const apply = page.getByRole('button', { name: /Apply|Застосувати/ });
  await expect(apply).toBeVisible();

  await page.getByText(/^(Inspector|Інспектор)$/).click();
  await expect(apply).toHaveCount(0);
  const waiting = page.getByLabel(/a proposal is waiting|пропозиція чекає/);
  await expect(waiting).toBeVisible();

  await waiting.click();
  await expect(apply).toBeVisible();
  // Still the same session: no reconnect, no pairing again.
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  await apply.click();
  await expect(page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ })).toBeVisible();
  await expect(page.getByText('Proposal resolved.')).toBeVisible();
});

/**
 * A page that reloads comes back to the same session without the card that
 * was on screen. The bridge sends the waiting call again, so the proposal is
 * there to decide on instead of holding the session until its time runs out.
 */
test('a proposal on screen survives a reload of the page', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  await send(page, '[proposal]');
  const apply = page.getByRole('button', { name: /Apply|Застосувати/ });
  await expect(apply).toBeVisible();

  await page.reload();
  // The session starts with the first opening of the chat.
  await page.getByText('AI', { exact: true }).click();

  await expect(apply).toBeVisible();
  await apply.click();
  await expect(page.getByRole('button', { name: /Undo AI changes|Відкотити AI-зміни/ })).toBeVisible();
  // The turn that proposed it was still running, and ends as it would have.
  await expect(page.getByText('Proposal resolved.')).toBeVisible();
});

/**
 * Opening a scene from another one puts a second editor on top of the first,
 * and the first stays mounted. Each editor used to hold a session of its own:
 * the two resumed the same session at the bridge and took the socket from each
 * other for as long as both were open. The session is held above the screens
 * now, one for the whole stack.
 */
test('an editor opened on top of another shares the assistant’s session', async ({ page }) => {
  // Sockets to anything but the app's own server are sockets to the bridge.
  const bridgeSockets: string[] = [];
  page.on('websocket', (socket) => {
    if (!socket.url().includes(new URL(page.url()).host)) bridgeSockets.push(socket.url());
  });
  await openAi(page);
  await pair(page);
  const connected = page.getByText(/Connected · Claude Code|Підключено · Claude Code/).filter({ visible: true });
  await expect(connected.first()).toBeVisible();
  await send(page, '[proposal]');
  const apply = page.getByRole('button', { name: /Apply|Застосувати/ }).filter({ visible: true });
  await expect(apply).toBeVisible();
  const opened = bridgeSockets.length;
  expect(opened).toBeGreaterThan(0);

  // A second editor, on top: the «new scene» command, typed in a scene the
  // proposal does not touch.
  await page.getByText('scene_2', { exact: true }).filter({ visible: true }).first().click();
  const second = await sceneEditable(page, 'scene_2');
  await typeAtEndOf(page, second.getByText('You approach the towering shelves'), ' /newScene');
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !['scene_1', 'scene_2'].includes(url.searchParams.get('sceneId') ?? 'scene_1'));

  // Its rail opens on the inspector; the proposal made below is waiting here.
  const waiting = page.getByLabel(/a proposal is waiting|пропозиція чекає/).filter({ visible: true });
  await expect(waiting).toBeVisible();
  await waiting.click();
  await expect(apply).toBeVisible();
  await expect(connected.first()).toBeVisible();
  // Two clients on one session would have reconnected several times by now.
  await page.waitForTimeout(2_500);
  expect(bridgeSockets.length).toBe(opened);
  await expect(connected.first()).toBeVisible();

  await apply.click();
  await expect(page.getByText('Proposal resolved.').filter({ visible: true })).toBeVisible();

  // Back in the editor underneath: the same conversation, over the same socket.
  await page.goBack();
  await page.waitForURL((url) => url.searchParams.get('sceneId') === 'scene_1');
  await expect(page.getByText('Proposal resolved.').filter({ visible: true })).toBeVisible();
  await expect(connected.first()).toBeVisible();
  expect(bridgeSockets.length).toBe(opened);
});

/**
 * The bridge offers the editor to an agent outside the app over MCP, on the
 * port the editor itself is connected to. Until the author lets such an agent
 * in, the editor's answer to it is no, while the built-in assistant goes on
 * working over the same connection.
 */
test('an external agent is refused by the editor, and the chat is not disturbed', async ({ page, request }) => {
  const mcp = `${process.env.AI_E2E_BRIDGE_HTTP ?? 'http://127.0.0.1:18787'}/mcp`;
  const call = (name: string, args: Record<string, unknown> = {}, token = 'ai-e2e-mcp-token') => request.post(mcp, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();

  // The editor's own token opens nothing here.
  expect((await call('get_editor_context', {}, validToken)).status()).toBe(401);

  const answer = await call('get_editor_context');
  expect(answer.status()).toBe(200);
  const result = (await answer.json()).result as { isError?: boolean; content: { text: string }[] };
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({ errorCode: 'PERMISSION_DENIED', details: { reason: 'EXTERNAL_ACCESS_OFF' } });

  await send(page, 'still here?');
  await expect(page.getByText('Deterministic reply: still here?')).toBeVisible();
  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toHaveCount(0);
});

/**
 * A bridge can run with no chat at all, for an agent the author runs
 * themselves. An author who has set up no AI provider connects to it without
 * choosing one, lets the agent in, and the agent reads the story through the
 * editor — the path that has to work on a clean browser profile.
 */
test('an author with no AI provider connects a bridge without chat, and an agent reads the story through it', async ({ page, request }) => {
  const agentBridge = process.env.AI_E2E_AGENT_BRIDGE ?? '127.0.0.1:18789';
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await request.post(`http://${agentBridge}/mcp`, {
      headers: { authorization: 'Bearer ai-e2e-mcp-token', accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    });
    expect(answer.status()).toBe(200);
    const result = (await answer.json()).result as { isError?: boolean; content: { text: string }[] };
    return { isError: result.isError === true, value: JSON.parse(result.content[0].text) };
  };
  await openAi(page);

  await page.getByText(/^(No chat|Без чату)$/).click();
  await expect(page.getByText(/--provider none --mcp/)).toBeVisible();
  await page.getByText(/Advanced connection settings|Розширені налаштування підключення/).click();
  await page.getByLabel(/Local bridge URL|Локальна адреса моста/).fill(`ws://${agentBridge}`);
  await page.getByLabel(/Pairing token|Токен підключення/).fill(validToken);
  await page.getByRole('button', { name: /Connect|Підключити/ }).click();

  await expect(page.getByText(/Connected · external agent only|Підключено · лише зовнішній агент/).first()).toBeVisible();
  await expect(page.getByPlaceholder(/No chat on this connection|На цьому з’єднанні чату немає/)).toBeVisible();

  // Connected is not let in: that is the author's to say.
  expect((await call('get_editor_context')).value).toMatchObject({ details: { reason: 'EXTERNAL_ACCESS_OFF' } });

  await page.getByLabel(/AI settings|Налаштування AI/).click();
  await page.getByLabel(/^(External agent access: Read|Доступ зовнішнього агента: Читання)$/).click();
  await page.getByLabel(/^(Close|Закрити)$/).click();
  await expect(page.getByText(/External agent · no calls yet|Зовнішній агент · викликів ще не було/)).toBeVisible();

  const context = await call('get_editor_context', { mode: 'live' });
  expect(context.isError).toBe(false);
  expect(context.value).toMatchObject({ storyId: 'demo-story-001', context: { kind: 'live', scene: { id: 'scene_1' } } });
  const scenes = await call('list_scenes', { binding: context.value.binding });
  expect(scenes.isError).toBe(false);
  expect((scenes.value as { id: string }[]).map(item => item.id)).toContain('scene_1');
  await expect(page.getByText(/External agent · last call list_scenes|Зовнішній агент · останній виклик list_scenes/)).toBeVisible();

  // Reading was let in; proposing was not.
  const proposal = await call('propose_scene_patch', {
    binding: context.value.binding,
    patch: { storyId: 'demo-story-001', sceneId: 'scene_1', expectedRevision: context.value.context.scene.revision, explanation: 'x', operations: [] },
  });
  expect(proposal.value).toMatchObject({ status: 'pending' });
  const outcome = await call('get_proposal_status', { binding: context.value.binding, proposalId: proposal.value.proposalId, waitSeconds: 10 });
  expect(outcome.value).toMatchObject({ status: 'failed', detail: 'EXTERNAL_PROPOSALS_OFF' });
});

test('the assistant is told which block the author has open', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');

  await editable.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByText(/Block: Background|Блок: Фон/)).toBeVisible();

  await send(page, '[context]');

  await expect(page.getByText(/focus=background\/editing\/exact/)).toBeVisible();
});

test('a dismissed selection is not sent', async ({ page }) => {
  await openAi(page);
  await pair(page);
  await expect(page.getByText(/Connected · Claude Code|Підключено · Claude Code/).first()).toBeVisible();
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');

  await editable.locator('p[data-kind="text"]').first().click({ clickCount: 3 });
  await expect(page.getByText(/Selected text|Виділений текст/)).toBeVisible();
  await page.getByRole('button', { name: /Do not send this to the assistant|Не передавати це помічнику/ }).click();
  await expect(page.getByText(/Selected text|Виділений текст/)).toHaveCount(0);

  await send(page, '[context]');

  await expect(page.getByText(/Saw selection="" anchors= focus=none/)).toBeVisible();
});
