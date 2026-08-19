import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

/** A real Chromium canvas, not a hand-built byte string, so the JPEG has the same kind of
 * high-frequency noise a phone photo does — anything smoother would already compress to nothing
 * and the test would pass for the wrong reason. */
async function photoJpegBytes(page: import('@playwright/test').Page): Promise<Uint8Array> {
  const dataUrl = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = Math.floor(Math.random() * 256);
      image.data[i + 1] = Math.floor(Math.random() * 256);
      image.data[i + 2] = Math.floor(Math.random() * 256);
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.98);
  });

  const base64 = dataUrl.split(',')[1] ?? '';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function writeFixture(
  page: import('@playwright/test').Page,
): Promise<{ path: string; originalSize: number }> {
  const jpegBytes = await photoJpegBytes(page);
  const doc = await PDFDocument.create();
  const jpg = await doc.embedJpg(jpegBytes);
  const pdfPage = doc.addPage([jpg.width / 2, jpg.height / 2]);
  pdfPage.drawImage(jpg, { x: 0, y: 0, width: jpg.width / 2, height: jpg.height / 2 });

  const bytes = await doc.save();
  const dir = mkdtempSync(join(tmpdir(), 'compress-pdf-'));
  const path = join(dir, 'photo.pdf');
  writeFileSync(path, bytes);
  return { path, originalSize: bytes.length };
}

test('recompresses the embedded photo and shrinks the file', async ({ page }) => {
  await page.goto('/tools/compress-pdf');
  const { path: fixture, originalSize } = await writeFixture(page);

  await page.goto('/tools/compress-pdf');
  await page.setInputFiles('input[type=file]', fixture);

  // Quality mode runs automatically: a debounced real recompress fires at the default quality,
  // no separate run button to click.
  const result = page.locator('section[aria-label="Compressed document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText('smaller');
  await expect(result).toContainText('1 of 1 images recompressed');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const compressedBytes = await readFile(saved);

  expect(compressedBytes.length).toBeLessThan(originalSize);

  const compressed = await PDFDocument.load(compressedBytes);
  expect(compressed.getPageCount()).toBe(1);
});
