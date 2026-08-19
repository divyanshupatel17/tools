import { replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { createCanvas } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  OUTPUT_FORMATS,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { runBatch } from '@/lib/image/batch';
import { renderWatermark, type WatermarkImageOptions } from './render';

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_FILES = 50;

/**
 * When `kind` is 'image' the last file is the logo and every file before it is a base image to
 * stamp; when `kind` is 'text' every file is a base image. This mirrors the PDF watermark tool's
 * `files = [file, watermarkImage]` convention, extended to a batch of base images.
 */
function splitFiles(files: readonly File[], kind: WatermarkImageOptions['kind']) {
  if (kind !== 'image') return { baseFiles: files, logoFile: undefined };
  const logoFile = files[files.length - 1];
  const baseFiles = files.slice(0, -1);
  return { baseFiles, logoFile };
}

function outputFormatFor(format: string): OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(format) ? (format as OutputFormat) : 'png';
}

const watermarkImage: ToolProcessor<WatermarkImageOptions> = async (
  { files, options },
  context,
) => {
  const check = validateFiles(files, imageRule({ max_files: MAX_FILES, max_bytes: MAX_BYTES }));
  if (!check.ok) {
    throw new ProcessorError('invalid_input', check.errors[0] ?? 'These files could not be used.');
  }

  const { baseFiles, logoFile } = splitFiles(files, options.kind);
  if (baseFiles.length === 0) {
    throw new ProcessorError('invalid_input', 'Add at least one image to watermark.');
  }
  if (options.kind === 'image' && !logoFile) {
    throw new ProcessorError('invalid_input', 'Add a logo image to use as the watermark.');
  }
  if (options.kind === 'text' && !options.text.trim()) {
    throw new ProcessorError('invalid_input', 'Enter the watermark text.');
  }

  let logo: { bitmap: ImageBitmap; width: number; height: number } | null = null;
  if (logoFile) {
    const decodedLogo = await decodeImage(logoFile);
    logo = decodedLogo;
  }

  try {
    return await runBatch(
      baseFiles,
      async (file) => {
        if (context.signal.aborted)
          throw new DOMException('The operation was cancelled.', 'AbortError');

        const decoded = await decodeImage(file);
        try {
          const { canvas, ctx } = createCanvas(decoded.width, decoded.height);
          ctx.drawImage(decoded.bitmap, 0, 0);
          renderWatermark({
            ctx,
            canvasWidth: decoded.width,
            canvasHeight: decoded.height,
            options,
            logo,
          });

          const format = outputFormatFor(decoded.format);
          const blob = await encodeCanvas(canvas, { format, quality: 0.92 });
          return {
            file_name: replaceExtension(file.name, IMAGE_EXTENSION[format]),
            mime_type: IMAGE_MIME[format],
            blob,
          };
        } finally {
          decoded.bitmap.close();
        }
      },
      context,
      // One artifact per input file: the workspace pairs each with its row and builds its own
      // "Download all" zip.
      { auto_zip: false },
    );
  } finally {
    logo?.bitmap.close();
  }
};

export default watermarkImage;
