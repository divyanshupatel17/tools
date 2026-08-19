import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  const form = doc.getForm();
  const field = form.createTextField('name');
  field.setText('Ada Lovelace');
  field.addToPage(page, { x: 40, y: 200, width: 200, height: 24, font });

  const dir = mkdtempSync(join(tmpdir(), 'flatten-pdf-'));
  const path = join(dir, 'form.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('bakes the form field into the page and removes it', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/flatten-pdf');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Flatten PDF' }).click();

  const result = page.locator('section[aria-label="Flattened document"]');
  await expect(result).toContainText('1 field flattened', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('form-flattened.pdf');

  const saved = await file.path();
  const flattened = await PDFDocument.load(await readFile(saved));
  expect(flattened.getForm().getFields()).toHaveLength(0);
  expect(flattened.getPageCount()).toBe(1);
});
