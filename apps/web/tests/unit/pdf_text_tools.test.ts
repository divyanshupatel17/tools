import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import pdfToHtml from '@/features/pdf/pdf_to_html/processor';
import pdfToMarkdown from '@/features/pdf/pdf_to_markdown/processor';
import pdfToText from '@/features/pdf/pdf_to_text/processor';
import { classifyPdfTextBlocks } from '@/lib/pdf/pdf_text_blocks';
import { pdfTextToHtml } from '@/lib/pdf/pdf_to_html';
import { pdfTextToMarkdown } from '@/lib/pdf/pdf_to_markdown';
import { pdfTextToPlainText } from '@/lib/pdf/pdf_to_text';

async function makeDocPdf(): Promise<File> {
  const document_ = await PDFDocument.create();
  const font = await document_.embedFont(StandardFonts.Helvetica);
  const page = document_.addPage([300, 400]);
  page.drawText('Big Title', { x: 40, y: 350, size: 24, font });
  page.drawText('This is a body paragraph.', { x: 40, y: 300, size: 12, font });
  page.drawText('- First item', { x: 40, y: 270, size: 12, font });
  page.drawText('- Second item', { x: 40, y: 250, size: 12, font });
  const bytes = await document_.save();
  return new File([new Uint8Array(bytes)], 'doc.pdf', { type: 'application/pdf' });
}

function context() {
  return { signal: new AbortController().signal };
}

describe('classifyPdfTextBlocks', () => {
  it('tells a larger heading from body paragraphs and bullet lists', () => {
    const blocks = classifyPdfTextBlocks([
      {
        lines: [
          { text: 'Big Title', fontSize: 24 },
          { text: 'This is a body paragraph.', fontSize: 12 },
          { text: '- First item', fontSize: 12 },
          { text: '- Second item', fontSize: 12 },
        ],
      },
    ]);

    expect(blocks[0]).toEqual([
      { type: 'heading', level: 1, text: 'Big Title' },
      { type: 'paragraph', text: 'This is a body paragraph.' },
      { type: 'list', items: ['First item', 'Second item'] },
    ]);
  });
});

describe('serializers', () => {
  const pages = [
    {
      lines: [
        { text: 'Title', fontSize: 24 },
        { text: 'Body text.', fontSize: 12 },
      ],
    },
  ];

  it('renders plain text with no markup', () => {
    expect(pdfTextToPlainText(pages)).toBe('Title\nBody text.');
  });

  it('renders Markdown headings', () => {
    expect(pdfTextToMarkdown(pages)).toBe('# Title\n\nBody text.');
  });

  it('renders escaped HTML', () => {
    const html = pdfTextToHtml([{ lines: [{ text: 'A & B', fontSize: 12 }] }], 'doc');
    expect(html).toContain('<p>A &amp; B</p>');
    expect(html).toContain('<title>doc</title>');
  });
});

describe('pdf-to-text processor', () => {
  it('extracts real text content from a PDF', async () => {
    const file = await makeDocPdf();
    const output = await pdfToText({ files: [file], options: {} }, context());
    const text = await output.artifacts[0]!.blob.text();
    expect(text).toContain('Big Title');
    expect(text).toContain('This is a body paragraph.');
    expect(output.text).toBe('1');
  });
});

describe('pdf-to-markdown processor', () => {
  it('turns the largest line on the page into a heading', async () => {
    const file = await makeDocPdf();
    const output = await pdfToMarkdown({ files: [file], options: {} }, context());
    const markdown = await output.artifacts[0]!.blob.text();
    expect(markdown).toContain('# Big Title');
    expect(markdown).toContain('- First item');
  });
});

describe('pdf-to-html processor', () => {
  it('produces a full HTML document', async () => {
    const file = await makeDocPdf();
    const output = await pdfToHtml({ files: [file], options: {} }, context());
    const html = await output.artifacts[0]!.blob.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<h1>Big Title</h1>');
  });
});
