import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName } from '@tools/file_utils';
import { zipFiles } from '@/lib/browser/zip';
import { IMAGE_EXTENSIONS, IMAGE_MIME_TYPES, renderPdfPagesToImages, type ImageFormat } from '@/lib/pdf/pdf_to_images';

export interface PdfToImagesOptions {
  format?: ImageFormat;
  dpi?: number;
  /** 0-based page indices to render; empty means nothing was selected. */
  pages?: number[];
}

/** Rendering needs a canvas, so like the shared PDF preview code this stays on the main thread. */
const pdfToImages: ToolProcessor<PdfToImagesOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert to images.');

  const format = input.options.format ?? 'jpeg';
  const dpi = input.options.dpi ?? 150;
  const pages = input.options.pages ?? [];
  if (pages.length === 0) throw new ProcessorError('no_selection', 'Select at least one page to render.');

  context.on_progress?.({ ratio: 0, label: 'Starting' });
  const scale = dpi / 72;
  const quality = format === 'png' ? undefined : format === 'webp' ? 0.92 : 0.9;

  const rendered = await renderPdfPagesToImages(
    file,
    pages,
    { format, scale, quality },
    context.signal,
    (done, total) => context.on_progress?.({ ratio: done / total, label: `Rendering page ${done} of ${total}` }),
  );

  const stem = replaceExtension(safeFileName(file.name), '').replace(/\.$/, '');
  const extension = IMAGE_EXTENSIONS[format];
  const mimeType = IMAGE_MIME_TYPES[format];

  if (rendered.length === 1) {
    const only = rendered[0]!;
    return {
      artifacts: [
        {
          file_name: `${stem}-page-${only.index + 1}.${extension}`,
          mime_type: mimeType,
          blob: new Blob([new Uint8Array(only.bytes)], { type: mimeType }),
        },
      ],
      text: '1',
    };
  }

  context.on_progress?.({ ratio: 1, label: 'Packing the archive' });
  const zip = await zipFiles(
    rendered.map((page) => ({
      file_name: `${stem}-page-${page.index + 1}.${extension}`,
      bytes: page.bytes,
    })),
  );

  return {
    artifacts: [{ file_name: `${stem}-images.zip`, mime_type: 'application/zip', blob: zip }],
    text: String(rendered.length),
  };
};

export default pdfToImages;
