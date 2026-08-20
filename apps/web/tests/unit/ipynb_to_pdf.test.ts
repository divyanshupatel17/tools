import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ipynbToPdf from '@/features/pdf/ipynb_to_pdf/processor';
import { parseIpynbToBlocks } from '@/lib/pdf/ipynb_blocks';
import { renderBlocksToPdf } from '@/lib/pdf/pdf_typeset';

const TESTING_DIR = fileURLToPath(new URL('../../../../.local/testing/', import.meta.url));

// The "to PDF" typesetter fetches its Unicode fonts from `/tools/fonts/*` at runtime, which
// only resolves against a page URL in a real browser. Here `fetch` is stubbed to read the same
// files straight off disk, so the processor exercises its real font-loading path.
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

function loadFixture(name: string): File {
  const bytes = readFileSync(`${TESTING_DIR}${name}`);
  return new File([bytes], name, { type: 'application/x-ipynb+json' });
}

function context() {
  return { signal: new AbortController().signal };
}

// A tiny 1x1 PNG, base64 encoded, used to exercise the image/png output branch.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('parseIpynbToBlocks', () => {
  it('turns markdown, code, stream, error, image and html-table outputs into typeset blocks', () => {
    const notebook = {
      cells: [
        {
          cell_type: 'markdown',
          source: ['# Title\n', '\n', 'Some *text*.'],
        },
        {
          cell_type: 'code',
          execution_count: 1,
          source: ['print("hi")'],
          outputs: [{ output_type: 'stream', name: 'stdout', text: ['hi\n'] }],
        },
        {
          cell_type: 'code',
          execution_count: 2,
          source: ['1 / 0'],
          outputs: [
            {
              output_type: 'error',
              ename: 'ZeroDivisionError',
              evalue: 'division by zero',
              traceback: ['[31mZeroDivisionError[0m: division by zero'],
            },
          ],
        },
        {
          cell_type: 'code',
          execution_count: 3,
          source: ['plot()'],
          outputs: [
            {
              output_type: 'display_data',
              data: { 'image/png': TINY_PNG_BASE64 },
            },
          ],
        },
        {
          cell_type: 'code',
          execution_count: 4,
          source: ['df'],
          outputs: [
            {
              output_type: 'execute_result',
              execution_count: 4,
              data: {
                'text/html': '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>',
                'text/plain': 'a\n0 1',
              },
            },
          ],
        },
      ],
    };

    const blocks = parseIpynbToBlocks(JSON.stringify(notebook));

    expect(blocks.some((b) => b.type === 'heading' && b.spans[0]?.text === 'Title')).toBe(true);
    expect(blocks.filter((b) => b.type === 'code').some((b) => b.type === 'code' && b.lines.join('\n').includes('print("hi")'))).toBe(
      true,
    );
    expect(blocks.some((b) => b.type === 'caption' && b.text === 'stdout')).toBe(true);
    expect(
      blocks.some(
        (b) => b.type === 'code' && b.lines.join('\n').includes('ZeroDivisionError') && !b.lines.join('\n').includes(''),
      ),
    ).toBe(true);
    expect(blocks.some((b) => b.type === 'image' && b.format === 'png')).toBe(true);
    // The HTML table wins over the text/plain fallback.
    expect(blocks.some((b) => b.type === 'table')).toBe(true);
  });

  it('rejects invalid JSON and notebooks without cells', () => {
    expect(() => parseIpynbToBlocks('not json')).toThrow();
    expect(() => parseIpynbToBlocks(JSON.stringify({ cells: [] }))).toThrow();
    expect(() => parseIpynbToBlocks(JSON.stringify({}))).toThrow();
  });
});

describe('ipynb-to-pdf processor', () => {
  it('converts a single real notebook into a real, multi-page PDF', async () => {
    const file = loadFixture('jupyter-file.ipynb');
    const output = await ipynbToPdf({ files: [file], options: {} }, context());

    const artifact = output.artifacts[0]!;
    expect(artifact.mime_type).toBe('application/pdf');
    const bytes = new Uint8Array(await artifact.blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('converts a second real notebook (with HTML table output) correctly', async () => {
    const file = loadFixture('jupyter-file1.ipynb');
    const blocks = parseIpynbToBlocks(await file.text());
    expect(blocks.length).toBeGreaterThan(0);

    const bytes = await renderBlocksToPdf(blocks, { pageSize: 'a4', marginPt: 54, fontSize: 11 });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it(
    'zips multiple notebooks into one archive',
    async () => {
      const files = [loadFixture('jupyter-file.ipynb'), loadFixture('jupyter-file1.ipynb')];
      const output = await ipynbToPdf({ files, options: { file_name: 'notebooks' } }, context());

      const artifact = output.artifacts[0]!;
      expect(artifact.mime_type).toBe('application/zip');
      expect(artifact.file_name).toBe('notebooks.zip');
      expect(output.text).toBe('2');

      // Each notebook's own PDF follows the zip, in file order, for a per-row "View".
      expect(output.artifacts).toHaveLength(3);
      expect(output.artifacts[1]!.mime_type).toBe('application/pdf');
      expect(output.artifacts[1]!.file_name).toBe('jupyter-file.pdf');
      expect(output.artifacts[2]!.mime_type).toBe('application/pdf');
      expect(output.artifacts[2]!.file_name).toBe('jupyter-file1.pdf');
    },
    15000,
  );

  it('rejects an empty file list', async () => {
    await expect(ipynbToPdf({ files: [], options: {} }, context())).rejects.toThrow();
  });
});
