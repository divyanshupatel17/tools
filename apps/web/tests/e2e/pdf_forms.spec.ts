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

  const name = form.createTextField('name');
  name.addToPage(page, { x: 40, y: 220, width: 200, height: 24, font });

  const role = form.createDropdown('role');
  role.addOptions(['Engineer', 'Designer', 'Manager']);
  role.addToPage(page, { x: 40, y: 160, width: 200, height: 24, font });

  const dir = mkdtempSync(join(tmpdir(), 'pdf-forms-'));
  const path = join(dir, 'form.pdf');
  writeFileSync(path, await doc.save());
  return path;
}

test('fills the text field and dropdown, leaving the form editable', async ({ page }) => {
  const fixture = await writeFixture();

  await page.goto('/tools/pdf-forms');
  await page.setInputFiles('input[type=file]', fixture);

  await expect(page.getByText('2 fillable fields')).toBeVisible();

  await page.getByLabel('name').fill('Ada Lovelace');
  await page.getByLabel('role').selectOption('Engineer');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Fill form' }).click();

  const result = page.locator('section[aria-label="Filled document"]');
  await expect(result).toContainText('2 fields filled', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const filled = await PDFDocument.load(await readFile(saved));
  const filledForm = filled.getForm();
  expect(filledForm.getTextField('name').getText()).toBe('Ada Lovelace');
  expect(filledForm.getDropdown('role').getSelected()).toEqual(['Engineer']);
});
