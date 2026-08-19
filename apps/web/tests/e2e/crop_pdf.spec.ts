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

  const dir = mkdtempSync(join(tmpdir(), 'crop-pdf-'));
  const path = join(dir, 'source.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('applies the default 6% crop to the page box', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/crop-pdf');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Crop PDF' }).click();

  const result = page.locator('section[aria-label="Cropped document"]');
  await expect(result).toContainText('1 page cropped', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const cropped = await PDFDocument.load(await readFile(saved));
  const box = cropped.getPage(0).getCropBox();

  // 400 * (1 - 0.06 - 0.06) = 352, 560 * (1 - 0.06 - 0.06) = 492.8
  expect(box.width).toBeCloseTo(352, 0);
  expect(box.height).toBeCloseTo(492.8, 0);
  expect(box.x).toBeCloseTo(24, 0);
  expect(box.y).toBeCloseTo(33.6, 0);
});
