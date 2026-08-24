import { parseMarkdownToBlocks } from './markdown_blocks';
import { parseHtmlToBlocks } from './html_blocks';
import type { DocBlock } from './pdf_typeset';

interface NotebookOutput {
  output_type: string;
  text?: string | string[];
  name?: string;
  data?: Record<string, string | string[]>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  execution_count?: number | null;
}

interface NotebookCell {
  cell_type: string;
  source?: string | string[];
  execution_count?: number | null;
  outputs?: NotebookOutput[];
}

interface Notebook {
  cells?: NotebookCell[];
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\[[0-9;]*m/g;

function joinSource(source: string | string[] | undefined): string {
  return Array.isArray(source) ? source.join('') : (source ?? '');
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pushCodeText(blocks: DocBlock[], label: string, text: string): void {
  const trimmed = stripAnsi(text).replace(/\n+$/, '');
  if (trimmed.trim() === '') return;
  blocks.push({ type: 'caption', text: label });
  blocks.push({ type: 'code', lines: trimmed.split('\n') });
}

function pushOutput(blocks: DocBlock[], output: NotebookOutput): void {
  if (output.output_type === 'stream') {
    pushCodeText(blocks, output.name === 'stderr' ? 'stderr' : 'stdout', joinSource(output.text));
    return;
  }

  if (output.output_type === 'error') {
    const trace = (output.traceback ?? []).map(stripAnsi).join('\n').trim();
    const message = trace || `${output.ename ?? 'Error'}: ${output.evalue ?? ''}`;
    blocks.push({ type: 'caption', text: 'Error' });
    blocks.push({ type: 'code', lines: message.split('\n') });
    return;
  }

  if (output.output_type !== 'execute_result' && output.output_type !== 'display_data') return;

  const data = output.data ?? {};
  const label = `Out[${output.execution_count ?? ' '}]`;

  const png = data['image/png'];
  if (typeof png === 'string') {
    blocks.push({ type: 'caption', text: label });
    blocks.push({ type: 'image', bytes: base64ToBytes(png), format: 'png' });
    return;
  }

  const jpeg = data['image/jpeg'];
  if (typeof jpeg === 'string') {
    blocks.push({ type: 'caption', text: label });
    blocks.push({ type: 'image', bytes: base64ToBytes(jpeg), format: 'jpeg' });
    return;
  }

  const html = data['text/html'];
  if (html !== undefined) {
    const htmlBlocks = parseHtmlToBlocks(joinSource(html));
    if (htmlBlocks.length > 0) {
      blocks.push({ type: 'caption', text: label });
      blocks.push(...htmlBlocks);
      return;
    }
  }

  const plain = data['text/plain'];
  if (plain !== undefined) pushCodeText(blocks, label, joinSource(plain));
}

/** Converts nbformat 4 JSON into the shared typesetting block model: each cell's outputs
 * (stdout/stderr, tracebacks, PNG/JPEG, HTML tables, plain text repr) render below it in order. */
export function parseIpynbToBlocks(json: string): DocBlock[] {
  let notebook: Notebook;
  try {
    notebook = JSON.parse(json) as Notebook;
  } catch {
    throw new Error('That file is not a valid notebook (invalid JSON).');
  }

  const cells = notebook.cells;
  if (!Array.isArray(cells)) throw new Error('That file is not a valid notebook (no cells found).');
  if (cells.length === 0) throw new Error('This notebook has no cells.');

  const blocks: DocBlock[] = [];

  cells.forEach((cell, index) => {
    if (index > 0) blocks.push({ type: 'hr' });

    if (cell.cell_type === 'markdown') {
      const source = joinSource(cell.source);
      if (source.trim() !== '') blocks.push(...parseMarkdownToBlocks(source));
      return;
    }

    if (cell.cell_type === 'code') {
      const source = joinSource(cell.source);
      blocks.push({ type: 'caption', text: `In [${cell.execution_count ?? ' '}]` });
      blocks.push({ type: 'code', lines: source === '' ? [''] : source.split('\n') });
      for (const output of cell.outputs ?? []) pushOutput(blocks, output);
      return;
    }

    const source = joinSource(cell.source);
    if (source.trim() !== '') blocks.push({ type: 'code', lines: source.split('\n') });
  });

  return blocks;
}
