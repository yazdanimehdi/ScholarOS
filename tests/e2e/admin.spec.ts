import { expect, test, type Page } from '@playwright/test';

/** The template's adminPath (config/site.yml). */
const ADMIN = '/admin';
const COMMITTED = 'Committed · live in about a minute';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** The dev-only session stub (src/admin/routes/api/auth/dev.ts) sets the cookie. */
async function signIn(page: Page) {
  await page.goto('/api/admin/auth/dev');
}

test('media: upload a site image, then delete it', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/media`);
  await page.getByRole('tab', { name: 'Site images' }).click();
  await page.getByLabel('Upload images').setInputFiles({ name: 'E2E Figure.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(COMMITTED)).toBeVisible();
  const tile = page.getByRole('figure').filter({ hasText: /e2e-figure-[0-9a-f]{6}\.png/ });
  await expect(tile).toBeVisible();
  await tile.getByRole('button', { name: 'Delete' }).click();
  await tile.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(tile).toHaveCount(0);
});

test('posts: create, save a draft, then publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/posts/new`);
  const title = `E2E post ${Date.now()}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.locator('.tiptap').click();
  await page.keyboard.type('Hello from the admin.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/posts\/e2e-post-\d+$/);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toHaveCount(2);
  await page.goto(`${ADMIN}/posts`);
  await expect(page.getByRole('row', { name: new RegExp(title) }).getByText('Published')).toBeVisible();
});

test('dashboard: hide and unhide an imported post', async ({ page }) => {
  await signIn(page);
  await page.goto(ADMIN);
  const hide = page.getByRole('button', { name: 'Hide', exact: true });
  const row = page.getByRole('row').filter({ has: hide }).first();
  const title = (await row.getByRole('cell').first().innerText()).trim();
  await row.getByRole('button', { name: 'Hide', exact: true }).click();
  const same = page.getByRole('row').filter({ hasText: title });
  await expect(same.getByText('Hidden')).toBeVisible();
  await same.getByRole('button', { name: 'Unhide' }).click();
  await expect(same.getByText('Published')).toBeVisible();
});
