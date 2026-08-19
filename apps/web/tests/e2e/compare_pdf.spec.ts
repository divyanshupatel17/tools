import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(text: string): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText(text, { x: 40, y: 200, size: 20, font });

  const dir = mkdtempSync(join(tmpdir(), 'compare-pdf-'));
  const path = join(dir, `${text.replace(/\s/g, '-')}.pdf`);
  writeFileSync(path, await doc.save());
  return path;
}

test('reports the one line that changed between two versions', async ({ page }) => {
  const before = await writeFixture('Total due: 100 USD');
  const after = await writeFixture('Total due: 250 USD');

  await page.goto('/tools/compare-pdf');

  // Two independent FileUpload widgets share no distinguishing id, so scope by the labelled
  // container instead.
  await page.locator('div:has(> p:text-is("Document 1")) input[type=file]').setInputFiles(before);
  await page.locator('div:has(> p:text-is("Document 2")) input[type=file]').setInputFiles(after);

  await page.getByRole('button', { name: 'Compare PDFs' }).click();

  await expect(page.getByText('1 of 1 page differ')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Total due: 100 USD')).toBeVisible();
  await expect(page.getByText('Total due: 250 USD')).toBeVisible();
});
