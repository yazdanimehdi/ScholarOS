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
