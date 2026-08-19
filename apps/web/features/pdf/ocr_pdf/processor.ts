import { PDFDocument } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { ocrPagesToPdfs } from '@/lib/pdf/ocr_pdf';
import { renderPdfPagesToImages } from '@/lib/pdf/pdf_to_images';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';

export type OcrPdfOptions = Record<string, unknown>;

/**
 * Renders every page to an image, runs Tesseract over each (`lib/pdf/ocr_pdf.ts`) to get back
 * a one-page PDF with the page image and an invisible, searchable text layer, then stitches
 * those pages into one document with pdf-lib. The output replaces each page with its own
 * rendered image plus the recognised text — this is meant for a scanned document that has no
 * real text layer to begin with, not a way to add search to a document that already has one
 * (running it on a text PDF just re-rasterises pages that were already searchable).
 */
const ocrPdf: ToolProcessor<OcrPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to recognise text in.');

  context.on_progress?.({ ratio: 0.02, label: 'Reading the document' });
  const preview = await readPdfPreview(file, context.signal);
  if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
  const pageIndexes = Array.from({ length: preview.pages }, (_, index) => index);

  const rendered = await renderPdfPagesToImages(
    file,
    pageIndexes,
    { format: 'jpeg', scale: 300 / 72, quality: 0.9 },
    context.signal,
    (done, total) =>
      context.on_progress?.({
        ratio: 0.05 + 0.25 * (done / total),
        label: `Rendering page ${done} of ${total}`,
      }),
  );
  if (rendered.length === 0)
    throw new ProcessorError('empty', 'This PDF has no pages to recognise.');

  const pagePdfs = await ocrPagesToPdfs(
    rendered.map((page) => page.bytes),
    (done, total) =>
      context.on_progress?.({
        ratio: 0.3 + 0.6 * (done / total),
        label: `Recognising text · page ${done} of ${total}`,
      }),
    context.signal,
  );

  context.on_progress?.({ ratio: 0.95, label: 'Combining pages' });
  const output = await PDFDocument.create();
  for (const pageBytes of pagePdfs) {
    const source = await PDFDocument.load(pageBytes);
    const [page] = await output.copyPages(source, [0]);
    if (page) output.addPage(page);
  }

  const bytes = await output.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '-ocr.pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default ocrPdf;
