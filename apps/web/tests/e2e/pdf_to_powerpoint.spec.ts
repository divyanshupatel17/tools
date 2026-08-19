import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('Slide one', { x: 40, y: 250, size: 24, font });
  doc.addPage([400, 300]).drawText('Slide two', { x: 40, y: 250, size: 24, font });

  const dir = mkdtempSync(join(tmpdir(), 'pdf-to-ppt-'));
  const path = join(dir, 'deck.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('renders each page as a picture slide in a valid .pptx', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/pdf-to-powerpoint');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Convert to PowerPoint' }).click();

  const result = page.locator('section[aria-label="Converted document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText('.pptx');

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  const entries = unzipSync(new Uint8Array(bytes));
  expect(entries['ppt/slides/slide1.xml']).toBeTruthy();
  expect(entries['ppt/slides/slide2.xml']).toBeTruthy();
  expect(entries['ppt/media/image1.jpeg']!.length).toBeGreaterThan(100);
  expect(entries['ppt/media/image2.jpeg']!.length).toBeGreaterThan(100);
});
