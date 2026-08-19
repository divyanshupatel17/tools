import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(pages: number): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let page = 1; page <= pages; page += 1) {
    doc.addPage([400, 560]).drawText(`page ${page}`, { x: 40, y: 500, size: 24, font });
  }
  const dir = mkdtempSync(join(tmpdir(), 'repair-pdf-'));
  const path = join(dir, 'source.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('rebuilds the document structure and preserves every page', async ({ page }) => {
  const fixture = await writeFixture(3);

  await page.goto('/tools/repair-pdf');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Repair PDF' }).click();

  const result = page.locator('section[aria-label="Repaired document"]');
  await expect(result).toContainText('3 pages recovered', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('source-repaired.pdf');

  const saved = await file.path();
  const repaired = await PDFDocument.load(await readFile(saved));
  expect(repaired.getPageCount()).toBe(3);
});
