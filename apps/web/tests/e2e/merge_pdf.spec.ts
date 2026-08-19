import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const CARD = 'section[aria-label="Merge PDF workspace"] [data-card]';

/** Sources with distinct page counts, so the merged total can only be right one way. */
const SOURCES = [
  { name: 'charlie.pdf', pages: 4 },
  { name: 'alpha.pdf', pages: 2 },
  { name: 'bravo.pdf', pages: 3 },
];

async function writeFixtures(): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'merge-pdf-'));
  const paths: string[] = [];

  for (const source of SOURCES) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let page = 1; page <= source.pages; page += 1) {
      doc.addPage([400, 560]).drawText(`${source.name} page ${page}`, {
        x: 40,
        y: 500,
        size: 24,
        font,
      });
    }
    const path = join(dir, source.name);
    writeFileSync(path, await doc.save());
    paths.push(path);
  }

  return paths;
}

test('merges PDFs in the chosen order and downloads the result', async ({ page }) => {
  const fixtures = await writeFixtures();

  await page.goto('/tools/merge-pdf');
  await page.setInputFiles('input[type=file]', fixtures);

  // Each card reports its own page count once PDF.js has read it.
  await expect(page.locator(CARD)).toHaveCount(3);
  await expect(page.locator(CARD).first()).toContainText(/\d+ pp/, { timeout: 30_000 });
  await expect(page.locator(CARD).filter({ hasText: /\d+ pp/ })).toHaveCount(3);

  const names = async () => page.locator(`${CARD} span.truncate`).allTextContents();

  await page.getByRole('button', { name: 'A to Z' }).click();
  expect(await names()).toEqual(['alpha.pdf', 'bravo.pdf', 'charlie.pdf']);

  await page.getByRole('button', { name: 'Z to A' }).click();
  expect(await names()).toEqual(['charlie.pdf', 'bravo.pdf', 'alpha.pdf']);

  // Reordering has to work from the keyboard, not only by dragging.
  await page.getByRole('button', { name: /Reorder charlie\.pdf/ }).focus();
  await page.keyboard.press('ArrowRight');
  expect(await names()).toEqual(['bravo.pdf', 'charlie.pdf', 'alpha.pdf']);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Merge PDF' }).click();

  const result = page.locator('section[aria-label="Merged document"]');
  await expect(result).toContainText('merged.pdf', { timeout: 60_000 });
  await expect(result).toContainText('9 pages');

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('merged.pdf');

  const saved = await file.path();
  const merged = await PDFDocument.load(await readFile(saved));
  expect(merged.getPageCount()).toBe(9);
});

test('keeps the merge button disabled until two readable PDFs are present', async ({ page }) => {
  const [single] = await writeFixtures();

  await page.goto('/tools/merge-pdf');
  await page.setInputFiles('input[type=file]', single!);

  await expect(page.locator(CARD)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Merge PDF' })).toBeDisabled();
});
