import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import addPageNumbers from '@/features/pdf/add_page_numbers/processor';
import deletePages from '@/features/pdf/delete_pages/processor';
import extractPages from '@/features/pdf/extract_pages/processor';
import rotatePdf from '@/features/pdf/rotate_pdf/processor';

async function makePdf(pageCount: number): Promise<File> {
  const document_ = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document_.addPage([200, 300]);
  const bytes = await document_.save();
  return new File([new Uint8Array(bytes)], 'sample.pdf', { type: 'application/pdf' });
}

function context() {
  return { signal: new AbortController().signal };
}

describe('delete-pages processor', () => {
  it('removes the requested pages and keeps the rest', async () => {
    const file = await makePdf(5);
    const output = await deletePages({ files: [file], options: { remove: [1, 3] } }, context());
    const saved = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(saved.getPageCount()).toBe(3);
    expect(output.text).toBe('3');
  });

  it('refuses to remove every page', async () => {
    const file = await makePdf(2);
    await expect(
      deletePages({ files: [file], options: { remove: [0, 1] } }, context()),
    ).rejects.toThrow(/at least one page/i);
  });

  it('refuses an empty selection', async () => {
    const file = await makePdf(2);
    await expect(deletePages({ files: [file], options: { remove: [] } }, context())).rejects.toThrow(
      /select at least one page/i,
    );
  });
});

describe('extract-pages processor', () => {
  it('keeps only the selected pages, in the requested order', async () => {
    const file = await makePdf(5);
    const output = await extractPages({ files: [file], options: { keep: [3, 0] } }, context());
    const saved = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(saved.getPageCount()).toBe(2);
    expect(output.text).toBe('2');
  });
});

describe('rotate-pdf processor', () => {
  it('rotates only the requested pages', async () => {
    const file = await makePdf(3);
    const output = await rotatePdf(
      { files: [file], options: { rotations: { 1: 90 } } },
      context(),
    );
    const saved = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(saved.getPage(0).getRotation().angle).toBe(0);
    expect(saved.getPage(1).getRotation().angle).toBe(90);
    expect(saved.getPage(2).getRotation().angle).toBe(0);
  });

  it('refuses when nothing is rotated', async () => {
    const file = await makePdf(2);
    await expect(rotatePdf({ files: [file], options: { rotations: {} } }, context())).rejects.toThrow(
      /rotate at least one page/i,
    );
  });
});

describe('add-page-numbers processor', () => {
  it('stamps every page and preserves the page count', async () => {
    const file = await makePdf(4);
    const output = await addPageNumbers(
      { files: [file], options: { position: 'bottom-center', format: 'n', start: 1, font_size: 12 } },
      context(),
    );
    const saved = await PDFDocument.load(await output.artifacts[0]!.blob.arrayBuffer());
    expect(saved.getPageCount()).toBe(4);
    expect(output.text).toBe('4');
  });
});
