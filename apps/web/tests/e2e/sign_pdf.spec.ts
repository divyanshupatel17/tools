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

  const dir = mkdtempSync(join(tmpdir(), 'sign-pdf-'));
  const path = join(dir, 'contract.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('places a typed signature on the last page by default', async ({ page }) => {
  const fixture = await writeFixture();
  const originalSize = (await readFile(fixture)).length;

  await page.goto('/tools/sign-pdf');
  await page.setInputFiles('input[type=file]', fixture);

  await page.getByRole('button', { name: 'Type' }).click();
  await page.getByRole('button', { name: 'Use this signature' }).click();
  await expect(page.getByAltText('Signature')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sign PDF' }).click();

  const result = page.locator('section[aria-label="Signed document"]');
  await expect(result).toContainText('Signed on page 2', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);
  const signed = await PDFDocument.load(bytes);

  expect(signed.getPageCount()).toBe(2);
  expect(bytes.length).toBeGreaterThan(originalSize);
});
