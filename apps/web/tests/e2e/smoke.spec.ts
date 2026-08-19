import { expect, test } from '@playwright/test';

test('home page renders the hero and search', async ({ page }) => {
  await page.goto('/tools');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('All Tools');
  await expect(page.getByRole('combobox', { name: 'Search tools' })).toBeVisible();
});

test('the landing page lists the popular tools and every category', async ({ page }) => {
  await page.goto('/tools');
  await expect(page.getByRole('link', { name: /^Merge PDF/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Split PDF/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /PDF Tools \d+ Tools/ })).toBeVisible();
});

test('the footer runner starts on space and never steals the search field', async ({ page }) => {
  await page.goto('/tools');
  const runner = page.getByRole('application', { name: /Dino runner/ });
  await runner.scrollIntoViewIfNeeded();
  await expect(page.getByText('Press SPACE or ↑ to Play')).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.getByText('Press SPACE or ↑ to Jump')).toBeVisible();

  const search = page.getByRole('combobox', { name: 'Search tools' });
  await search.fill('merge');
  await search.press('Space');
  await expect(search).toHaveValue('merge ');
});

test('a category page lists its tools', async ({ page }) => {
  await page.goto('/tools/pdf');
  await expect(page.getByRole('heading', { level: 1, name: 'PDF Tools' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Merge PDF/ }).first()).toBeVisible();
});

test('the PDF listing is grouped into sections and keeps descriptions behind a hover', async ({
  page,
}) => {
  await page.goto('/tools/pdf');
  await expect(page.getByRole('heading', { level: 2, name: 'Organize PDF' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'PDF Security' })).toBeVisible();

  // Nothing describes itself at rest, however long the list gets.
  await expect(page.locator('[data-hint]')).toHaveCount(0);

  await page.getByRole('link', { name: /^Split PDF/ }).hover();
  await expect(page.locator('[data-hint]')).toHaveText(/Break a PDF into separate documents/);
});

test('an unimplemented tool page shows a coming-soon state', async ({ page }) => {
  // Every PDF tool is now built; this checks the fallback itself still works on a category
  // that isn't, not any one specific tool staying unbuilt forever.
  await page.goto('/tools/compress-image');
  await expect(page.getByRole('heading', { level: 1, name: 'Compress Image' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Coming soon' })).toBeVisible();
});

test('an unknown tool slug returns 404', async ({ page }) => {
  const response = await page.goto('/tools/not-a-real-tool');
  expect(response?.status()).toBe(404);
});
