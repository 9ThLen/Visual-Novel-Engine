import { expect, test, type Page } from '@playwright/test';

const validToken = 'ai-e2e-token';

async function openStoryFromStudio(page: Page, title: string): Promise<void> {
  const storyIndex = title === 'The Forgotten Library' ? 0 : 1;
  const editButton = page.getByRole('button', { name: 'Edit', exact: true }).nth(storyIndex);
  await expect(editButton).toBeVisible();
  await editButton.click();
  await expect(page.getByRole('button', { name: 'Edit novel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit novel', exact: true }).click();
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

async function showConnectionWizard(page: Page): Promise<void> {
  const configure = page.getByRole('button', { name: /Connect real AI|Підключити справжній AI/ });
  if (await configure.isVisible()) await configure.click();
}

async function pair(page: Page, token = validToken): Promise<void> {
  await showConnectionWizard(page);
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

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Story Editor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Story Editor', exact: true }).click();
  await openStoryFromStudio(page, 'The Enchanted Museum');
  await page.getByText('AI', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Story Editor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Story Editor', exact: true }).click();
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
