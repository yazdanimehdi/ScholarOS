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

test('publications: edit a field, regenerate BibTeX, publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/publications`);
  await page.getByRole('region', { name: 'Entries' }).getByRole('button').first().click();
  await page.getByLabel('Note', { exact: true }).fill('E2E note');
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.getByLabel('BibTeX (leave empty to generate)')).toHaveValue(/^@(article|inproceedings)\{/);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});

test('news: create an item', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/content/announcements`);
  await page.getByRole('button', { name: 'New news item' }).click();
  await page.getByLabel('Title', { exact: true }).fill(`E2E news ${Date.now()}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Entries' }).getByText(/E2E news/)).toBeVisible();
});

test('news: edit an item right after creating it', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/content/announcements`);
  await page.getByRole('button', { name: 'New news item' }).click();
  await page.getByLabel('Title', { exact: true }).fill(`E2E again ${Date.now()}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(`E2E again edited ${Date.now()}`);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toHaveCount(2);
  await expect(page.getByText(/changed|conflict/i)).toHaveCount(0);
});

test('cv: edit an entry, see the preview, publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/cv`);
  await page
    .getByRole('region', { name: 'Sections' })
    .getByRole('button', { name: /^Experience/ })
    .click();
  await page.getByRole('region', { name: 'Entries' }).getByRole('button').first().click();
  await page.getByLabel('Position', { exact: true }).fill('Professor (e2e)');
  await expect(page.getByLabel('Preview')).toContainText('Professor (e2e)');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});

test('cv: a stale save shows the conflict dialog and keeps the edits', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/cv`);
  await expect(page.getByRole('region', { name: 'Sections' }).getByRole('button').first()).toBeVisible();
  // Someone else commits config/cv.yml after this page loaded it.
  const current = await (await page.request.get('/api/admin/config/cv')).json();
  const origin = new URL(page.url()).origin;
  const res = await page.request.put('/api/admin/config/cv', {
    headers: { Origin: origin },
    data: { data: { ...current.data, cv: { ...current.data.cv, phone: '+1-555-0199' } }, version: current.version },
  });
  expect(res.ok()).toBeTruthy();
  await page
    .getByRole('region', { name: 'Sections' })
    .getByRole('button', { name: /^Education/ })
    .click();
  await page.getByRole('region', { name: 'Entries' }).getByRole('button').first().click();
  await page.getByLabel('Institution', { exact: true }).fill('Changed University');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'This file changed since you opened it' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('button', { name: 'Restore edits' })).toBeVisible();
});

test('pages: reorder home sections and publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/pages`);
  const sections = page.getByRole('group', { name: 'Home page sections' });
  await sections.getByRole('button', { name: 'Move down' }).first().click();
  await page.getByRole('button', { name: 'Publish home page' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});

test('settings: change the site title and publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/settings`);
  await page.getByLabel('Site title', { exact: true }).fill('E2E Lab');
  await page.getByRole('button', { name: 'Publish settings' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});
