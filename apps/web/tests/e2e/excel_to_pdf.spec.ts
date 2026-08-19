import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

/** A minimal but valid .xlsx built independently of the app's own writer — using shared
 * strings, the encoding real Excel exports use, rather than the inline strings this app's own
 * writer prefers, so the reader is exercised against the format it did not produce itself. */
function buildMinimalXlsx(): Uint8Array {
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>Item</t></si>
  <si><t>Widget</t></si>
</sst>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c></row>
    <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>99</v></c></row>
  </sheetData>
</worksheet>`;

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'xl/workbook.xml': strToU8(WORKBOOK),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    'xl/sharedStrings.xml': strToU8(sharedStrings),
  });
}

test('lays out a plain .xlsx (built outside the app, using shared strings) as a table in a PDF', async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'excel-to-pdf-'));
  const path = join(dir, 'budget.xlsx');
  writeFileSync(path, buildMinimalXlsx());

  await page.goto('/tools/excel-to-pdf');
  await page.setInputFiles('input[type=file]', path);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Convert to PDF' }).click();

  const result = page.locator('section[aria-label="Converted document"]');
  await expect(result).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const saved = await file.path();
  const bytes = await readFile(saved);

  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    const pdfPage = await doc.getPage(1);
    const content = await pdfPage.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(text).toContain('Item');
    expect(text).toContain('Widget');
    expect(text).toContain('99');
  } finally {
    await task.destroy();
  }
});
