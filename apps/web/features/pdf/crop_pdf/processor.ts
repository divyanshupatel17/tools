import { PDFDocument } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { parsePageRanges } from '@/lib/pdf/page_ranges';

export interface CropPdfOptions {
  /** Fractions of each page's own MediaBox, 0-1, so the same crop applies correctly even when
   * pages differ in size. */
  inset_left?: number;
  inset_right?: number;
  inset_top?: number;
  inset_bottom?: number;
  /** "1-3,5" — empty or omitted means every page. */
  pages?: string;
}

/** Sets the CropBox rather than removing content — a crop hides area outside the box without
 * discarding it, which is what every PDF viewer already treats "crop" as meaning. */
const cropPdf: ToolProcessor<CropPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to crop.');

  const left = clampFraction(input.options.inset_left);
  const right = clampFraction(input.options.inset_right);
  const top = clampFraction(input.options.inset_top);
  const bottom = clampFraction(input.options.inset_bottom);

  if (left + right >= 1 || top + bottom >= 1) {
    throw new ProcessorError('invalid_crop', 'The crop area is too small — nothing would remain.');
  }

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = pdfDoc.getPageCount();

  const targetIndices =
    input.options.pages && input.options.pages.trim().length > 0
      ? [...parsePageRanges(input.options.pages, pageCount)]
      : Array.from({ length: pageCount }, (_, index) => index);

  if (targetIndices.length === 0) {
    throw new ProcessorError('no_pages', 'No pages matched that page range.');
  }

  for (const index of targetIndices) {
    const page = pdfDoc.getPage(index);
    const media = page.getMediaBox();
    page.setCropBox(
      media.x + left * media.width,
      media.y + bottom * media.height,
      media.width * (1 - left - right),
      media.height * (1 - top - bottom),
    );
  }

  context.on_progress?.({ ratio: 0.8, label: 'Saving' });
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-cropped.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(targetIndices.length),
  };
};

function clampFraction(value: number | undefined): number {
  return Math.min(0.98, Math.max(0, value ?? 0));
}

export default cropPdf;
