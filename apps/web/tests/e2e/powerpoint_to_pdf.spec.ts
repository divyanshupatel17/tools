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
</Types>`;

const PRESENTATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="257" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`;

const PRESENTATION_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`;

function slideXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
}

/** A minimal but valid .pptx built independently of the app's own writer (which only ever
 * writes picture slides) — this one has real text runs, exercising the reader against the
 * shape a genuine PowerPoint export actually has. */
function buildMinimalPptx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    'ppt/presentation.xml': strToU8(PRESENTATION),
    'ppt/_rels/presentation.xml.rels': strToU8(PRESENTATION_RELS),
    'ppt/slides/slide1.xml': strToU8(slideXml('Welcome to the deck')),
    'ppt/slides/slide2.xml': strToU8(slideXml('Thank you')),
  });
}

test('lays out each slide of a plain .pptx (built outside the app) on its own PDF page', async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'ppt-to-pdf-'));
  const path = join(dir, 'deck.pptx');
  writeFileSync(path, buildMinimalPptx());

  await page.goto('/tools/powerpoint-to-pdf');
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
    expect(doc.numPages).toBe(2);

    const page1 = await (await doc.getPage(1)).getTextContent();
    const text1 = page1.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    expect(text1).toContain('Welcome to the deck');

    const page2 = await (await doc.getPage(2)).getTextContent();
    const text2 = page2.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    expect(text2).toContain('Thank you');
  } finally {
    await task.destroy();
  }
});
