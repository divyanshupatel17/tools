import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Archive me', { x: 40, y: 100, size: 20, font });

  const dir = mkdtempSync(join(tmpdir(), 'pdf-to-pdfa-'));
  const path = join(dir, 'source.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('produces a PDF with a real embedded ICC output intent and PDF/A XMP metadata', async ({
  page,
}) => {
  const fixture = await writeFixture();

  await page.goto('/tools/pdf-to-pdfa');
  // A short settle avoids a hydration race on a fresh navigation — see ocr_pdf.spec.ts for the
  // same issue.
  await page.waitForTimeout(500);
  await page.setInputFiles('input[type=file]', fixture);
  await expect(page.getByRole('button', { name: 'Convert to PDF/A' })).toBeVisible({
    timeout: 30_000,
  });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Convert to PDF/A' }).click();

  const result = page.locator('section[aria-label="PDF/A document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  // pdf-lib can only load and report a page count if the xref, page tree and object graph are
  // actually intact — a real structural check, not a header sniff.
  const reloaded = await PDFDocument.load(bytes);
  expect(reloaded.getPageCount()).toBe(1);

  // PDF.js independently confirms the page is genuinely renderable content (an image XObject
  // with a valid stream) by building its operator list without error — this would throw on a
  // page with a broken or truncated image stream.
  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    expect(doc.numPages).toBe(1);
    await (await doc.getPage(1)).getOperatorList();
  } finally {
    await task.destroy();
  }

  // Walk pdf-lib's own parsed object graph — far more reliable than regex over raw PDF bytes —
  // to find the catalog's /Metadata and /OutputIntents entries and confirm their actual decoded
  // content, not just that certain byte sequences appear somewhere in the file.
  const metadataObject = reloaded.catalog.lookup(PDFName.of('Metadata'));
  if (!(metadataObject instanceof PDFRawStream)) throw new Error('Metadata is not a raw stream');
  const metadataStream = metadataObject;
  expect(metadataStream.dict.lookup(PDFName.of('Type'), PDFName)).toBe(PDFName.of('Metadata'));
  // Written uncompressed (no /Filter on this stream) — unlike the ICC profile below, which is.
  const xmp = Buffer.from(metadataStream.getContents()).toString('utf8');
  expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
  expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');

  const outputIntents = reloaded.catalog.lookup(PDFName.of('OutputIntents'));
  expect(outputIntents).toBeTruthy();
  // @ts-expect-error - PDFArray's element accessor is intentionally untyped here for a quick test lookup.
  const outputIntent: PDFDict = outputIntents.lookup(0, PDFDict);
  expect(outputIntent.lookup(PDFName.of('S'), PDFName)).toBe(PDFName.of('GTS_PDFA1'));

  const iccObject = outputIntent.lookup(PDFName.of('DestOutputProfile'));
  if (!(iccObject instanceof PDFRawStream))
    throw new Error('DestOutputProfile is not a raw stream');
  const icc = inflateSync(Buffer.from(iccObject.getContents()));
  expect(icc.readUInt32BE(0)).toBe(icc.length);
  expect(icc.toString('latin1', 36, 40)).toBe('acsp');
});
