import { describe, expect, it } from 'vitest';
import { buildPptx } from '@/lib/office/pptx_writer';
import { readOoxmlPackage } from '@/lib/office/ooxml';
import { readPptxSlides } from '@/lib/office/pptx_reader';

describe('buildPptx', () => {
  it('produces every part PowerPoint requires to open without repair', async () => {
    const bytes = await buildPptx([{ bytes: new Uint8Array([1, 2, 3]), width: 800, height: 600 }]);
    const files = await readOoxmlPackage(bytes);

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'ppt/presentation.xml',
        'ppt/_rels/presentation.xml.rels',
        'ppt/slideMasters/slideMaster1.xml',
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        'ppt/slideLayouts/slideLayout1.xml',
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        'ppt/theme/theme1.xml',
        'ppt/slides/slide1.xml',
        'ppt/slides/_rels/slide1.xml.rels',
        'ppt/media/image1.jpeg',
      ]),
    );
  });

  it('writes one slide part per image, in order', async () => {
    const bytes = await buildPptx([
      { bytes: new Uint8Array([1]), width: 100, height: 100 },
      { bytes: new Uint8Array([2]), width: 100, height: 100 },
      { bytes: new Uint8Array([3]), width: 100, height: 100 },
    ]);
    const files = await readOoxmlPackage(bytes);
    expect(files['ppt/slides/slide3.xml']).toBeTruthy();
    expect(files['ppt/media/image3.jpeg']).toEqual(new Uint8Array([3]));
  });
});

describe('pptx round-trip', () => {
  it('reads slide text back in slide order with page breaks between slides', async () => {
    // readPptxSlides reads text runs, which the image-only slides buildPptx writes do not
    // have — so this exercises the reader against a hand-built deck with real text, the shape
    // both real-world PPTX files and the reader's actual use case (PowerPoint to PDF) have.
    const { zipSync, strToU8 } = await import('fflate');
    const contentTypes = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`;
    const presentation = `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><p:sldId id="257" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>`;
    const presentationRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`;
    const slide1 = `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const slide2 = `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

    const bytes = zipSync({
      '[Content_Types].xml': strToU8(contentTypes),
      'ppt/presentation.xml': strToU8(presentation),
      'ppt/_rels/presentation.xml.rels': strToU8(presentationRels),
      'ppt/slides/slide1.xml': strToU8(slide1),
      'ppt/slides/slide2.xml': strToU8(slide2),
    });

    const blocks = await readPptxSlides(bytes);
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'First slide' }] },
      { type: 'pagebreak' },
      { type: 'paragraph', spans: [{ text: 'Second slide' }] },
    ]);
  });
});
