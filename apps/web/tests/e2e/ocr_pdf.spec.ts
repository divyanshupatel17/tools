import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Renders "HELLO" as real glyphs on a real Chromium canvas and embeds that as a picture — not
 * as a PDF text operator — so the page has legible text for Tesseract to recognise while
 * pdf.js's own text extraction finds nothing on it, the same shape a scanned page actually has. */
async function writeScannedLookingFixture(page: import('@playwright/test').Page): Promise<string> {
  const dataUrl = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 300;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = 'bold 160px sans-serif';
    context.textBaseline = 'middle';
    context.fillText('HELLO', 40, canvas.height / 2);
    return canvas.toDataURL('image/png');
  });

  const pngBytes = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(pngBytes);
  const pdfPage = doc.addPage([image.width / 3, image.height / 3]);
  pdfPage.drawImage(image, { x: 0, y: 0, width: image.width / 3, height: image.height / 3 });

  const dir = mkdtempSync(join(tmpdir(), 'ocr-pdf-'));
  const path = join(dir, 'scan.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('recognises text on a page with no existing text layer', async ({ page }) => {
  test.setTimeout(240_000);
  const fixture = await writeScannedLookingFixture(page);

  // Confirm the fixture really has no extractable text before OCR runs on it.
  {
    const bytes = await readFile(fixture);
    const task = getDocument({ data: new Uint8Array(bytes) });
    const doc = await task.promise;
    const content = await (await doc.getPage(1)).getTextContent();
    await task.destroy();
    expect(content.items.length).toBe(0);
  }

  await page.goto('/tools/ocr-pdf');
  // The upload input can exist in the DOM slightly before React finishes attaching its handlers
  // on a fresh navigation to this route; interacting immediately occasionally races that and
  // silently drops the file-select event. A short settle avoids it.
  await page.waitForTimeout(500);
  await page.setInputFiles('input[type=file]', fixture);
  await expect(page.getByRole('button', { name: 'Recognise text' })).toBeVisible({
    timeout: 30_000,
  });

  const download = page.waitForEvent('download', { timeout: 180_000 });
  await page.getByRole('button', { name: 'Recognise text' }).click();

  const result = page.locator('section[aria-label="OCR document"]');
  await expect(result).toBeVisible({ timeout: 180_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    expect(doc.numPages).toBe(1);
    const content = await (await doc.getPage(1)).getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join('');
    expect(text.length).toBeGreaterThan(0);
  } finally {
    await task.destroy();
  }
});
