import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('Quarterly Report', { x: 40, y: 250, size: 28, font });
  page.drawText('Revenue was up this quarter.', { x: 40, y: 200, size: 12, font: body });

  const dir = mkdtempSync(join(tmpdir(), 'pdf-to-word-'));
  const path = join(dir, 'report.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('rebuilds the extracted heading and paragraph as a valid .docx', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/pdf-to-word');
  await page.setInputFiles('input[type=file]', fixture);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Convert to Word' }).click();

  const result = page.locator('section[aria-label="Converted document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText('.docx');

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  const zipEntries = unzipSync(new Uint8Array(bytes));
  expect(zipEntries['word/document.xml']).toBeTruthy();
  expect(zipEntries['[Content_Types].xml']).toBeTruthy();

  const documentXml = strFromU8(zipEntries['word/document.xml']!);
  expect(documentXml).toContain('Quarterly Report');
  expect(documentXml).toContain('Revenue was up this quarter.');
  expect(documentXml).toContain('Heading1');
});
