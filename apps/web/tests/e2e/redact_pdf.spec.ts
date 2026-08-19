import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 560]).drawText('SECRET-CODE-42', { x: 40, y: 500, size: 24, font });
  doc.addPage([400, 560]).drawText('ordinary page two', { x: 40, y: 500, size: 24, font });

  const dir = mkdtempSync(join(tmpdir(), 'redact-pdf-'));
  const path = join(dir, 'confidential.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('flattens only the page that was redacted, removing its text entirely', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/redact-pdf');
  // A short settle avoids a hydration race on a fresh navigation — see ocr_pdf.spec.ts for the
  // same issue.
  await page.waitForTimeout(500);
  await page.setInputFiles('input[type=file]', fixture);

  const preview = page.getByAltText('Page 1 preview');
  await expect(preview).toBeVisible({ timeout: 30_000 });
  const overlay = preview.locator('..');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('overlay not found');

  // Drag a box over roughly where the text sits.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.3);
  await page.mouse.up();

  await expect(page.getByText('1 box across the document.')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Redact PDF' }).click();

  const result = page.locator('section[aria-label="Redacted document"]');
  await expect(result).toContainText('1 page flattened', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const redacted = await PDFDocument.load(await readFile(saved));

  expect(redacted.getPageCount()).toBe(2);

  const redactedPage = redacted.getPage(0);
  const untouchedPage = redacted.getPage(1);
  // The rebuilt page is a full-page JPEG with no fonts at all; a fresh pdf-lib page still
  // carries an (empty) Font sub-dictionary by default, so check emptiness, not presence.
  const redactedFonts = redactedPage.node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
  const untouchedFonts = untouchedPage.node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
  expect(redactedFonts === undefined || redactedFonts.keys().length === 0).toBe(true);
  expect(untouchedFonts?.keys().length).toBeGreaterThan(0);
});
