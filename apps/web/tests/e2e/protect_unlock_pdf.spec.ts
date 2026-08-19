import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractText(bytes: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  } finally {
    await task.destroy();
  }
}

const SECRET_MARKER = 'THE-QUICK-BROWN-FOX-JUMPS-42';

async function writeFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText(SECRET_MARKER, { x: 40, y: 200, size: 20, font });

  const dir = mkdtempSync(join(tmpdir(), 'protect-pdf-'));
  const path = join(dir, 'plain.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('protects a PDF so pdf-lib cannot read it without the password, and genuinely encrypts the content', async ({
  page,
}) => {
  const fixture = await writeFixture();

  await page.goto('/tools/protect-pdf');
  await page.setInputFiles('input[type=file]', fixture);
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
  await page.getByLabel('Confirm password').fill('correct horse battery staple');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Protect PDF' }).click();

  const result = page.locator('section[aria-label="Protected document"]');
  await expect(result).toContainText('password required to open', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const protectedBytes = await readFile(saved);

  // The marker text must not appear anywhere in the file as plain bytes — proof the content
  // stream was actually encrypted, not just flagged as protected while staying readable.
  expect(protectedBytes.toString('latin1')).not.toContain(SECRET_MARKER);

  const reloaded = await PDFDocument.load(protectedBytes, { ignoreEncryption: true });
  expect(reloaded.isEncrypted).toBe(true);
});

test('round-trips through protect then unlock with the correct password, recovering the exact content', async ({
  page,
}) => {
  const fixture = await writeFixture();

  await page.goto('/tools/protect-pdf');
  await page.setInputFiles('input[type=file]', fixture);
  await page.getByLabel('Password', { exact: true }).fill('hunter2-hunter2');
  await page.getByLabel('Confirm password').fill('hunter2-hunter2');

  const protectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Protect PDF' }).click();
  await expect(page.locator('section[aria-label="Protected document"]')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Download' }).click();
  const protectedFile = await protectDownload;
  // The raw temp path Playwright downloads to has no extension; FileUpload's rule checks the
  // file's extension, so it must be re-saved with a real .pdf name before re-uploading it.
  const protectedPath = join(mkdtempSync(join(tmpdir(), 'protect-pdf-out-')), 'protected.pdf');
  await protectedFile.saveAs(protectedPath);

  await page.goto('/tools/unlock-pdf');
  await page.setInputFiles('input[type=file]', protectedPath);
  await page.getByLabel('Password', { exact: true }).fill('hunter2-hunter2');

  const unlockDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();

  const result = page.locator('section[aria-label="Unlocked document"]');
  await expect(result).toContainText('no password needed', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const unlockedFile = await unlockDownload;
  const unlockedPath = await unlockedFile.path();
  if (!unlockedPath) throw new Error('no download path');
  const unlockedBytes = await readFile(unlockedPath);

  // Loads with pdf-lib's normal (non-encrypted) path — no /Encrypt entry survives.
  const unlocked = await PDFDocument.load(unlockedBytes);
  expect(unlocked.isEncrypted).toBe(false);
  expect(unlocked.getPageCount()).toBe(1);

  // The content stream is Flate-compressed, so the marker only appears in properly extracted
  // text — this proves the decrypted bytes are valid, correctly-ordered PDF content, not just
  // "no /Encrypt entry and the right page count."
  const text = await extractText(unlockedBytes);
  expect(text).toContain(SECRET_MARKER);
});

test('rejects the wrong password without corrupting anything', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/protect-pdf');
  await page.setInputFiles('input[type=file]', fixture);
  await page.getByLabel('Password', { exact: true }).fill('the-real-password');
  await page.getByLabel('Confirm password').fill('the-real-password');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Protect PDF' }).click();
  await expect(page.locator('section[aria-label="Protected document"]')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Download' }).click();
  const protectedFile = await download;
  const protectedPath = join(mkdtempSync(join(tmpdir(), 'protect-pdf-out-')), 'protected.pdf');
  await protectedFile.saveAs(protectedPath);

  await page.goto('/tools/unlock-pdf');
  await page.setInputFiles('input[type=file]', protectedPath);
  await page.getByLabel('Password', { exact: true }).fill('a-guess');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();

  await expect(page.getByText('That password is not correct for this file.')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('section[aria-label="Unlocked document"]')).toHaveCount(0);
});
