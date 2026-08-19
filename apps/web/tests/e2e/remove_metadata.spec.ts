import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('hello', { x: 40, y: 200, size: 24, font });
  doc.setTitle('Quarterly Report');
  doc.setAuthor('Ada Lovelace');

  const dir = mkdtempSync(join(tmpdir(), 'remove-metadata-'));
  const path = join(dir, 'report.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('shows the metadata found and strips it from the download', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/remove-metadata');
  await page.setInputFiles('input[type=file]', fixture);

  await expect(page.getByText('Quarterly Report')).toBeVisible();
  await expect(page.getByText('Ada Lovelace')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Remove Metadata' }).click();

  const result = page.locator('section[aria-label="Cleaned document"]');
  await expect(result).toContainText('Metadata removed', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const cleaned = await PDFDocument.load(await readFile(saved));
  expect(cleaned.getTitle()).toBeUndefined();
  expect(cleaned.getAuthor()).toBeUndefined();
});
