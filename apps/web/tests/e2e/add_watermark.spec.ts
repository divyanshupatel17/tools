import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 560]).drawText('page 1', { x: 40, y: 500, size: 24, font });
  doc.addPage([400, 560]).drawText('page 2', { x: 40, y: 500, size: 24, font });

  const dir = mkdtempSync(join(tmpdir(), 'watermark-'));
  const path = join(dir, 'source.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('stamps the default text watermark on every page', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/add-watermark');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add watermark' }).click();

  const result = page.locator('section[aria-label="Watermarked document"]');
  await expect(result).toContainText('2 pages stamped', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);
  const stamped = await PDFDocument.load(bytes);
  expect(stamped.getPageCount()).toBe(2);
  // Embedding the Unicode font set and drawing 12 tiled runs per page adds real bytes.
  expect(bytes.length).toBeGreaterThan(20_000);
});

test('restricts the watermark to a chosen page range', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/add-watermark');
  await page.setInputFiles('input[type=file]', fixture);
  await page.getByPlaceholder(/All pages/).fill('1');

  await page.getByRole('button', { name: 'Add watermark' }).click();
  const result = page.locator('section[aria-label="Watermarked document"]');
  await expect(result).toContainText('1 page stamped', { timeout: 30_000 });
});
