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
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** A minimal but structurally valid .docx built independently of the app's own writer, so this
 * test exercises the reader against a document it did not produce itself. */
function buildMinimalDocx(): Uint8Array {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Meeting Notes</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Action item: </w:t></w:r><w:r><w:t>ship the report by Friday.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(documentXml),
  });
}

test('lays out a plain .docx (built outside the app) as a readable PDF', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'word-to-pdf-'));
  const path = join(dir, 'notes.docx');
  writeFileSync(path, buildMinimalDocx());

  await page.goto('/tools/word-to-pdf');
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
    expect(text).toContain('Meeting Notes');
    expect(text).toContain('Action item:');
    expect(text).toContain('ship the report by Friday.');
  } finally {
    await task.destroy();
  }
});
