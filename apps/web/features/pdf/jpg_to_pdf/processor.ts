import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { buildPdfFromImages, type ImagesToPdfMargin, type ImagesToPdfOrientation, type ImagesToPdfPageSize } from '@/lib/pdf/images_to_pdf';

export interface ImagesToPdfOptions {
  page_size?: ImagesToPdfPageSize;
  orientation?: ImagesToPdfOrientation;
  margin?: ImagesToPdfMargin;
  /** Degrees, one per file, in the same order as `input.files`. */
  rotations?: number[];
  file_name?: string;
}

/** Decoding and re-rasterising each image needs a canvas, so this stays on the main thread. */
const imagesToPdf: ToolProcessor<ImagesToPdfOptions> = async (input, context) => {
  if (input.files.length === 0) throw new ProcessorError('missing_file', 'Add at least one image.');

  context.on_progress?.({ ratio: 0, label: 'Starting' });
  const rotations = input.options.rotations ?? [];

  const bytes = await buildPdfFromImages(
    input.files,
    rotations,
    {
      pageSize: input.options.page_size ?? 'fit',
      orientation: input.options.orientation ?? 'auto',
      margin: input.options.margin ?? 'normal',
    },
    context.signal,
    (done, total) => context.on_progress?.({ ratio: done / total, label: `Rendering image ${done} of ${total}` }),
  );

  const base = input.options.file_name?.trim();

  return {
    artifacts: [
      {
        file_name: base ? `${base}.pdf` : 'images.pdf',
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(input.files.length),
  };
};

export default imagesToPdf;
