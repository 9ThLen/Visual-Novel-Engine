import { expect, test, type Page } from '@playwright/test';

/**
 * Publishing a release, by clicking.
 *
 * The engine could freeze, package and store a release long before anything
 * could reach that code from the UI: no bundled story passed the release gate,
 * so every test of the publish path wrote a release into storage itself and
 * asserted on what it had written. The one route an author takes was the one
 * route nothing exercised.
 *
 * This drives it: open a demo story's project page, press Release, confirm, and
 * find the card saying the story is published. It asserts on what the author
 * sees rather than on storage, because storage is what the other tests already
 * cover and the screen is what was never checked.
 */

async function openStudio(page: Page): Promise<void> {
  await page.goto('/');
  const studio = page.getByRole('button', { name: 'Studio', exact: true }).first();
  await expect(studio).toBeVisible();
  await studio.click();
  // «New story» exists on the shelf in every state and nowhere on the showcase,
  // so it is what tells the two screens apart before a card is queried.
  await expect(page.getByRole('button', { name: 'New story', exact: true }).first()).toBeVisible();
}

async function openStoryHome(page: Page, title: string): Promise<void> {
  await openStudio(page);
  await page.getByRole('button', { name: title, exact: true }).first().click();
  await expect(page.getByText('Release', { exact: true }).first()).toBeVisible();
}

test('publishes a bundled story from its project page', async ({ page }) => {
  await openStoryHome(page, 'The Enchanted Museum');

  // Nothing published yet: the card says so in its own words.
  await expect(page.getByText('Not released yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Release…', exact: true }).click();
  await expect(page.getByText('Release this story')).toBeVisible();

  // The gate decides whether this button is usable at all. Before the bundled
  // demos carried a cast and their publication metadata, it never was.
  const confirm = page.getByRole('button', { name: 'Release', exact: true }).last();
  await expect(confirm).toBeEnabled();

  const version = page.getByLabel('Version', { exact: true });
  await expect(version).toHaveValue(/^\d+\.\d+\.\d+$/);
  const chosen = await version.inputValue();

  await confirm.click();

  // Freezing a story with this much art is not instant; the card is what says
  // it finished, and it names the version that was published.
  await expect(page.getByText(new RegExp(`Published v${chosen.replace(/\./g, '\\.')}`)))
    .toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Not released yet.')).toHaveCount(0);
});

/**
 * The gate is the reason the button above is usable, so it is worth seeing it
 * work rather than inferring it from a green publish.
 */
test('offers the release without blockers for a bundled story', async ({ page }) => {
  await openStoryHome(page, 'The Forgotten Library');

  // Opened rather than inferred: the release card only shows a count, and a
  // count cannot say what is wrong. This lists each blocker by name, so a
  // failure here reads as the thing to fix rather than as a number.
  await page.getByRole('button', { name: /^Readiness/ }).click();

  // "Must fix" heads the blocker list and appears only when there is one, so
  // its absence is the assertion. Warnings are welcome to be there and to
  // change; a demo nobody may warn about is a demo nobody may edit.
  await expect(page.getByText('Must fix', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Fix \d+ things before releasing/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Release…', exact: true })).toBeEnabled();
});
