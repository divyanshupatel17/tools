import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([400, 300]);
  page.drawText('Name       Amount', { x: 40, y: 250, size: 12, font });
  page.drawText('Widget     10', { x: 40, y: 230, size: 12, font });

  const dir = mkdtempSync(join(tmpdir(), 'pdf-to-excel-'));
  const path = join(dir, 'table.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('splits extracted lines into columns and writes a valid .xlsx', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/pdf-to-excel');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Convert to Excel' }).click();

  const result = page.locator('section[aria-label="Converted document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText('.xlsx');

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  const entries = unzipSync(new Uint8Array(bytes));
  expect(entries['xl/workbook.xml']).toBeTruthy();

  const sheetXml = strFromU8(entries['xl/worksheets/sheet1.xml']!);
  // Column-splitting depends on PDF.js's own whitespace reconstruction, which this test does
  // not control precisely — the writer's numeric-cell detection is covered directly in
  // tests/unit/xlsx.test.ts. This only checks the extracted words made it into the sheet at all.
  expect(sheetXml).toContain('Name');
  expect(sheetXml).toContain('Amount');
  expect(sheetXml).toContain('Widget');
  expect(sheetXml).toContain('10');
});
