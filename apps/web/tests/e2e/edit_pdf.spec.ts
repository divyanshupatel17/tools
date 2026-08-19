import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('Original content', { x: 40, y: 250, size: 16, font });

  const dir = mkdtempSync(join(tmpdir(), 'edit-pdf-'));
  const path = join(dir, 'source.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('adds a new text box on top of the page without disturbing the original content', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/edit-pdf');
  // A short settle avoids a hydration race on a fresh navigation — see ocr_pdf.spec.ts.
  await page.waitForTimeout(500);
  await page.setInputFiles('input[type=file]', fixture);
  await expect(page.getByRole('button', { name: 'Add text' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Add text' }).click();
  await page.getByLabel('Text box content').fill('Added by the editor');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF' }).click();

  const result = page.locator('section[aria-label="Edited document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  const reloaded = await PDFDocument.load(bytes);
  expect(reloaded.getPageCount()).toBe(1);

  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    const content = await (await doc.getPage(1)).getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    expect(text).toContain('Original content');
    expect(text).toContain('Added by the editor');
  } finally {
    await task.destroy();
  }
});
