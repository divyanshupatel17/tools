import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import htmlToPdf from '@/features/pdf/html_to_pdf/processor';
import markdownToPdf from '@/features/pdf/markdown_to_pdf/processor';
import textToPdf from '@/features/pdf/text_to_pdf/processor';
import { parseHtmlToBlocks } from '@/lib/pdf/html_blocks';
import { parseMarkdownToBlocks } from '@/lib/pdf/markdown_blocks';
import { parseInlineMarkdown } from '@/lib/pdf/markdown_inline';

function context() {
  return { signal: new AbortController().signal };
}

// The "to PDF" processors fetch their Unicode fonts from `/tools/fonts/*` at runtime, which
// only resolves against a page URL in a real browser. Here `fetch` is stubbed to read the
// same files straight off disk, so the processors exercise their real font-loading path.
const FONTS_DIR = join(__dirname, '..', '..', 'public', 'fonts');
beforeAll(() => {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    const fileName = url.split('/fonts/')[1];
    if (!fileName) throw new Error(`Unexpected fetch in test: ${url}`);
    const bytes = readFileSync(join(FONTS_DIR, fileName));
    return new Response(bytes, { status: 200 });
  });
});

describe('parseInlineMarkdown', () => {
  it('resolves bold, italic, bold+italic and code spans', () => {
    expect(parseInlineMarkdown('a **bold** b *italic* c `code` d ***both***')).toEqual([
      { text: 'a ' },
      { text: 'bold', bold: true },
      { text: ' b ' },
      { text: 'italic', italic: true },
      { text: ' c ' },
      { text: 'code', mono: true },
      { text: ' d ' },
      { text: 'both', bold: true, italic: true },
    ]);
  });

  it('leaves underscores inside a word alone (snake_case is not italic)', () => {
    expect(parseInlineMarkdown('a snake_case_name b')).toEqual([{ text: 'a snake_case_name b' }]);
  });

  it('passes plain text through as a single span', () => {
    expect(parseInlineMarkdown('plain text')).toEqual([{ text: 'plain text' }]);
  });
});

describe('parseMarkdownToBlocks', () => {
  it('recognises headings, paragraphs, lists, code and tables', () => {
    const source = [
      '# Title',
      '',
      'A paragraph of text.',
      '',
      '- one',
      '- two',
      '',
      '```',
      'console.log(1)',
      '```',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n');

    const blocks = parseMarkdownToBlocks(source);
    expect(blocks).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Title' }] },
      { type: 'paragraph', spans: [{ text: 'A paragraph of text.' }] },
      { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] },
      { type: 'code', lines: ['console.log(1)'] },
      {
        type: 'table',
        rows: [
          [[{ text: 'A' }], [{ text: 'B' }]],
          [[{ text: '1' }], [{ text: '2' }]],
        ],
      },
    ]);
  });

  it('numbers an ordered list separately from a bulleted one', () => {
    const blocks = parseMarkdownToBlocks('1. first\n2. second');
    expect(blocks).toEqual([{ type: 'list', ordered: true, items: [[{ text: 'first' }], [{ text: 'second' }]] }]);
  });

  it('resolves inline bold and code inside a paragraph', () => {
    const blocks = parseMarkdownToBlocks('This is **bold** and `code`.');
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        spans: [{ text: 'This is ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'code', mono: true }, { text: '.' }],
      },
    ]);
  });
});

describe('parseHtmlToBlocks', () => {
  it('resolves <b> and <code> to styled spans instead of stripping them', () => {
    const html = '<h2>Title</h2><p>Some <b>bold</b> and <code>code</code> text.</p><ul><li>one</li><li>two</li></ul>';
    expect(parseHtmlToBlocks(html)).toEqual([
      { type: 'heading', level: 2, spans: [{ text: 'Title' }] },
      {
        type: 'paragraph',
        spans: [{ text: 'Some ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'code', mono: true }, { text: ' text.' }],
      },
      { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] },
    ]);
  });

  it('decodes entities, including ones beyond the basic five', () => {
    const blocks = parseHtmlToBlocks('<div>Tom &amp; Jerry &copy; 2024</div>');
    expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'Tom & Jerry © 2024' }] }]);
  });

  it('reads table rows into a grid of cells', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(parseHtmlToBlocks(html)).toEqual([
      {
        type: 'table',
        rows: [
          [[{ text: 'A' }], [{ text: 'B' }]],
          [[{ text: '1' }], [{ text: '2' }]],
        ],
      },
    ]);
  });

  it('narrows a full document to <body> content, dropping <!DOCTYPE> and <head>', () => {
    const html = [
      '<!DOCTYPE html>',
      '<html><head><title>My Page</title><meta charset="utf-8"><style>body{color:red}</style></head>',
      '<body><h1>Heading</h1><p>Body text.</p></body></html>',
    ].join('\n');

    expect(parseHtmlToBlocks(html)).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Heading' }] },
      { type: 'paragraph', spans: [{ text: 'Body text.' }] },
    ]);
  });
});

describe('text-to-pdf processor', () => {
  it('produces a readable PDF from pasted text', async () => {
    const output = await textToPdf({ files: [], text: 'Hello world', options: {} }, context());
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('refuses empty input', async () => {
    await expect(textToPdf({ files: [], text: '  ', options: {} }, context())).rejects.toThrow(/paste some text/i);
  });

  it('does not throw on characters outside WinAnsi (arrows, smart quotes, CJK)', async () => {
    const text = 'Step 1 → Step 2\n“Quoted” — em dash\n中文文本\n😀';
    const output = await textToPdf({ files: [], text, options: {} }, context());
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('markdown-to-pdf processor', () => {
  it('produces a PDF from Markdown', async () => {
    const output = await markdownToPdf(
      { files: [], text: '# Title\n\nBody text.', options: {} },
      context(),
    );
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not throw on an arrow inside a heading, list and table', async () => {
    const source = '# A → B\n\n- Step 1 → Step 2\n\n| From | To |\n| --- | --- |\n| A | A → B |';
    const output = await markdownToPdf({ files: [], text: source, options: {} }, context());
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not throw on bold, italic and inline code', async () => {
    const source = 'A **bold** word, an *italic* word, and `inline code`.';
    const output = await markdownToPdf({ files: [], text: source, options: {} }, context());
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('html-to-pdf processor', () => {
  it('produces a PDF from HTML', async () => {
    const output = await htmlToPdf(
      { files: [], text: '<h1>Title</h1><p>Body text.</p>', options: {} },
      context(),
    );
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not throw on an arrow in the pasted HTML', async () => {
    const output = await htmlToPdf(
      { files: [], text: '<p>Step 1 → Step 2</p>', options: {} },
      context(),
    );
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('does not throw on a full HTML document with entities and inline styling', async () => {
    const html = [
      '<!DOCTYPE html>',
      '<html><head><title>Portfolio</title><meta charset="utf-8"></head>',
      '<body><h1>Divyanshu Patel &copy; 2024</h1><p>I am a <b>developer</b> and <i>engineer</i>.</p></body></html>',
    ].join('\n');
    const output = await htmlToPdf({ files: [], text: html, options: {} }, context());
    const doc = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('refuses HTML with no readable content', async () => {
    await expect(
      htmlToPdf({ files: [], text: '<div></div>', options: {} }, context()),
    ).rejects.toThrow(/no readable text/i);
  });
});
