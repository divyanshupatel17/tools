import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { buildPptx, type SlideImage } from '@/lib/office/pptx_writer';
import { renderPdfPagesToImages } from '@/lib/pdf/pdf_to_images';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';

export type PdfToPowerpointOptions = Record<string, unknown>;

async function decodeSize(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/**
 * Renders every page to a JPEG (`lib/pdf/pdf_to_images.ts`, the same renderer PDF to Images
 * uses) and places each as a full-slide picture (`lib/office/pptx_writer.ts`). This is a
 * picture of each page, not editable text or shapes — the same honest trade-off Redact PDF
 * makes when it flattens a page, chosen for the same reason: reconstructing real, positioned
 * text boxes from a content stream is a much larger project than this tool's scope.
 */
const pdfToPowerpoint: ToolProcessor<PdfToPowerpointOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const preview = await readPdfPreview(file, context.signal);
  if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
  const pageIndexes = Array.from({ length: preview.pages }, (_, index) => index);

  const rendered = await renderPdfPagesToImages(
    file,
    pageIndexes,
    { format: 'jpeg', scale: 150 / 72, quality: 0.9 },
    context.signal,
    (done, total) =>
      context.on_progress?.({
        ratio: 0.1 + 0.6 * (done / total),
        label: `Rendering page ${done} of ${total}`,
      }),
  );

  if (rendered.length === 0) throw new ProcessorError('empty', 'This PDF has no pages to convert.');

  context.on_progress?.({ ratio: 0.75, label: 'Building the slides' });
  const images: SlideImage[] = [];
  for (const page of rendered) {
    const { width, height } = await decodeSize(page.bytes);
    images.push({ bytes: page.bytes, width, height });
  }

  const bytes = await buildPptx(images);
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pptx'),
        mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        blob: new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }),
      },
    ],
  };
};

export default pdfToPowerpoint;
