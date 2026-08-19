import { PDFDocument } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export type RepairPdfOptions = Record<string, unknown>;

/**
 * "Repairing" a PDF means re-parsing it with pdf-lib's relaxed, best-effort object reader
 * (`throwOnInvalidObject: false`) and re-saving a clean cross-reference table and object graph
 * from whatever was recovered. This fixes the common cases — a broken xref, a bad startxref
 * offset, junk before the header or after the final EOF, a missing trailer — the same way most
 * "PDF repair" tools do, on-device via pdf-lib rather than a server-side tool like Ghostscript.
 * It cannot recreate bytes that are genuinely missing from a truncated file.
 */
const repairPdf: ToolProcessor<RepairPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to repair.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(source, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
  } catch {
    throw new ProcessorError(
      'unreadable',
      'This file is too damaged to recover — no PDF structure could be found in it at all.',
    );
  }

  context.on_progress?.({ ratio: 0.6, label: 'Rebuilding the document structure' });
  const pageCount = pdfDoc.getPageCount();
  if (pageCount === 0) {
    throw new ProcessorError('no_pages', 'No readable pages were found in this file.');
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-repaired.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(pageCount),
  };
};

export default repairPdf;
