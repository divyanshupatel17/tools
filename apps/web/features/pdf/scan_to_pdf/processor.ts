import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import {
  buildPdfFromImages,
  type ImagesToPdfMargin,
  type ImagesToPdfOrientation,
  type ImagesToPdfPageSize,
} from '@/lib/pdf/images_to_pdf';

export interface ScanToPdfOptions {
  page_size?: ImagesToPdfPageSize;
  orientation?: ImagesToPdfOrientation;
  margin?: ImagesToPdfMargin;
  /** Degrees, one per file, in the same order as `input.files`. */
  rotations?: number[];
  file_name?: string;
}

/**
 * Assembles already-cropped scan pages into a PDF. Cropping (rectangle, ratio or perspective)
 * happens earlier in the workspace via `lib/pdf/scan_geometry.ts`; by the time a file reaches
 * this processor it is just an image, so this shares `buildPdfFromImages` with Images to PDF
 * rather than duplicating page-assembly logic. Margin defaults to none: a scan is already
 * cropped to the document's own edges, so padding it again would just shrink the page for no
 * reason.
 */
const scanToPdf: ToolProcessor<ScanToPdfOptions> = async (input, context) => {
  if (input.files.length === 0)
    throw new ProcessorError('missing_file', 'Add at least one scanned page.');

  context.on_progress?.({ ratio: 0, label: 'Starting' });
  const rotations = input.options.rotations ?? [];

  const bytes = await buildPdfFromImages(
    input.files,
    rotations,
    {
      pageSize: input.options.page_size ?? 'fit',
      orientation: input.options.orientation ?? 'auto',
      margin: input.options.margin ?? 'none',
    },
    context.signal,
    (done, total) =>
      context.on_progress?.({ ratio: done / total, label: `Rendering page ${done} of ${total}` }),
  );

  const base = input.options.file_name?.trim();

  return {
    artifacts: [
      {
        file_name: base ? `${base}.pdf` : 'scan.pdf',
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(input.files.length),
  };
};

export default scanToPdf;
