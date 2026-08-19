import { PDFDocument } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { rasterizeWithRedactions, type RedactionBox } from '@/lib/pdf/redact_pdf';

export interface RedactPdfOptions {
  /** 0-based page index -> the boxes to black out and rasterise on that page. Pages with no
   * entry here are copied through untouched, keeping their text and vector content. */
  redactions?: Record<number, RedactionBox[]>;
}

/** Rendering the redacted pages needs a canvas, so like the other rasterising tools this stays
 * on the main thread. See `lib/pdf/redact_pdf.ts` for why redaction has to mean "flatten the
 * whole page to an image", not "draw a box over the text". */
const redactPdf: ToolProcessor<RedactPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to redact.');

  const redactions = input.options.redactions ?? {};
  const redactedIndices = Object.keys(redactions)
    .map(Number)
    .filter((index) => (redactions[index]?.length ?? 0) > 0);

  if (redactedIndices.length === 0) {
    throw new ProcessorError('no_redactions', 'Draw at least one box to redact.');
  }

  context.on_progress?.({ ratio: 0.05, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const original = await PDFDocument.load(source, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const output = await PDFDocument.create();
  const pageCount = original.getPageCount();
  const redactedSet = new Set(redactedIndices);

  for (let index = 0; index < pageCount; index += 1) {
    if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

    if (!redactedSet.has(index)) {
      const [copied] = await output.copyPages(original, [index]);
      if (copied) output.addPage(copied);
    } else {
      const boxes = redactions[index] ?? [];
      const mediaBox = original.getPage(index).getSize();
      const { bytes: jpegBytes } = await rasterizeWithRedactions(file, index, boxes);
      const image = await output.embedJpg(jpegBytes);
      const page = output.addPage([mediaBox.width, mediaBox.height]);
      page.drawImage(image, { x: 0, y: 0, width: mediaBox.width, height: mediaBox.height });
    }

    context.on_progress?.({
      ratio: 0.1 + 0.8 * ((index + 1) / pageCount),
      label: `Page ${index + 1} of ${pageCount}`,
    });
  }

  const bytes = await output.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-redacted.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(redactedIndices.length),
  };
};

export default redactPdf;
