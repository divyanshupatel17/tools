import { describe, expect, it } from 'vitest';
import { buildDocx } from '@/lib/office/docx_writer';
import { readDocxBlocks } from '@/lib/office/docx_reader';
import { readOoxmlPackage } from '@/lib/office/ooxml';
import type { TextBlock } from '@/lib/pdf/pdf_text_blocks';

describe('buildDocx', () => {
  it('produces a package with the parts Word requires to open without repair', async () => {
    const bytes = await buildDocx([[{ type: 'paragraph', text: 'hello' }]]);
    const files = await readOoxmlPackage(bytes);

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/_rels/document.xml.rels',
        'word/styles.xml',
        'docProps/core.xml',
        'docProps/app.xml',
      ]),
    );
  });

  it('escapes special characters so the XML stays well-formed', async () => {
    const bytes = await buildDocx([[{ type: 'paragraph', text: 'A < B & C > D "quoted"' }]]);
    const blocks = await readDocxBlocks(bytes);
    expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'A < B & C > D "quoted"' }] }]);
  });
});

describe('docx round-trip', () => {
  it('recovers headings, paragraphs and lists across a page break', async () => {
    const page1: TextBlock[] = [
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'A paragraph of body text.' },
      { type: 'list', items: ['first', 'second'] },
    ];
    const page2: TextBlock[] = [{ type: 'heading', level: 2, text: 'Section two' }];

    const bytes = await buildDocx([page1, page2], 'Round trip');
    const blocks = await readDocxBlocks(bytes);

    expect(blocks).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Title' }] },
      { type: 'paragraph', spans: [{ text: 'A paragraph of body text.' }] },
      { type: 'list', ordered: false, items: [[{ text: '•\tfirst' }], [{ text: '•\tsecond' }]] },
      { type: 'heading', level: 2, spans: [{ text: 'Section two' }] },
    ]);
  });
});
