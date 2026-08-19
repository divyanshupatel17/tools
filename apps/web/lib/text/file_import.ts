import type { DocBlock, InlineSpan } from '@/lib/pdf/pdf_typeset';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

// Anything that is plain source text once opened: prose formats, data formats, and every
// mainstream programming and markup language. Read straight with File#text(), no extraction.
const PLAIN_TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'log', 'rtf',
  'json', 'jsonc', 'xml', 'yaml', 'yml', 'ini', 'toml', 'env', 'conf', 'cfg',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'kts',
  'sh', 'bash', 'zsh', 'ps1', 'sql', 'r', 'lua', 'pl', 'dart', 'scala', 'vue', 'svelte', 'graphql',
  'gitignore', 'dockerfile', 'makefile', 'gradle', 'properties',
]);

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || extensionOf(file) === 'pdf';
}

export function isDocxFile(file: File): boolean {
  return (
    extensionOf(file) === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export function isLegacyDocFile(file: File): boolean {
  return extensionOf(file) === 'doc' || file.type === 'application/msword';
}

export function isSupportedTextFile(file: File): boolean {
  if (isPdfFile(file) || isDocxFile(file)) return true;
  if (file.type.startsWith('text/')) return true;
  if (/^application\/(json|xml|javascript|x-sh|x-yaml)$/.test(file.type)) return true;
  return PLAIN_TEXT_EXTENSIONS.has(extensionOf(file));
}

/** Passed to the hidden file input's `accept` so the OS picker itself narrows the list too. */
export const TEXT_IMPORT_ACCEPT = [
  '.txt,.text,.md,.markdown,.csv,.tsv,.log,.rtf',
  '.json,.jsonc,.xml,.yaml,.yml,.ini,.toml,.env,.conf,.cfg',
  '.js,.jsx,.mjs,.cjs,.ts,.tsx,.html,.htm,.css,.scss,.sass,.less',
  '.py,.java,.c,.h,.cpp,.hpp,.cc,.cs,.go,.rs,.php,.rb,.swift,.kt,.kts',
  '.sh,.bash,.zsh,.ps1,.sql,.r,.lua,.pl,.dart,.scala,.vue,.svelte,.graphql',
  '.pdf,.docx',
  'text/plain,application/json,application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

function spansToText(spans: readonly InlineSpan[]): string {
  return spans.map((span) => span.text).join('');
}

/** Flattens the same `DocBlock[]` model the PDF export tools build back into plain text:
 * headings and paragraphs as lines, list items prefixed with a dash, table rows tab separated. */
function docxBlocksToPlainText(blocks: readonly DocBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      parts.push(spansToText(block.spans));
    } else if (block.type === 'list') {
      for (const item of block.items) parts.push(`- ${spansToText(item)}`);
    } else if (block.type === 'table') {
      for (const row of block.rows) parts.push(row.map((cell) => spansToText(cell)).join('\t'));
    } else if (block.type === 'blockquote') {
      for (const line of block.lines) parts.push(`> ${spansToText(line)}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * Reads any supported file into plain text: PDFs through pdf.js, Word documents through the
 * same OOXML reader the PDF category's Word tools use, and everything else — plain text, data
 * formats, and every mainstream programming language — straight through `File#text()`. Only
 * the extracted text is ever shown; the original file is never rendered or previewed.
 */
export async function importTextFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('That file is larger than 25 MB. Try a smaller file.');
  }

  if (isPdfFile(file)) {
    const [{ extractPdfText }, { pdfTextToPlainText }] = await Promise.all([
      import('@/lib/pdf/pdf_text'),
      import('@/lib/pdf/pdf_to_text'),
    ]);
    const pages = await extractPdfText(file);
    return pdfTextToPlainText(pages);
  }

  if (isDocxFile(file)) {
    const { readDocxBlocks } = await import('@/lib/office/docx_reader');
    const blocks = await readDocxBlocks(new Uint8Array(await file.arrayBuffer()));
    return docxBlocksToPlainText(blocks);
  }

  if (isLegacyDocFile(file)) {
    throw new Error('Old .doc files are not supported. Save it as .docx or .txt and try again.');
  }

  if (!isSupportedTextFile(file)) {
    throw new Error('That file type is not supported. Try a text, code, PDF or Word file.');
  }

  return file.text();
}
