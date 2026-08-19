import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';

export interface ImageMetadataOptions {
  format: OutputFormat;
  /** 0 to 1. Ignored for PNG. */
  quality?: number;
  /** Fills transparency when the chosen format has no alpha channel. */
  background?: string;
}

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Strips metadata by decoding the image and drawing it straight back through a fresh canvas:
 * the canvas API never carries EXIF, XMP or ICC data across, so the encoded output has none of
 * it. This necessarily re-encodes the pixels too, which is lossy for a JPEG or WebP source; the
 * workspace says so before the user clicks.
 */
const imageMetadata: ToolProcessor<ImageMetadataOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const validation = validateFiles(files, imageRule({ max_files: 1, max_bytes: MAX_BYTES }));
  if (!validation.ok) {
    throw new ProcessorError(
      'image_metadata_invalid_input',
      validation.errors[0] ?? 'This file cannot be processed.',
    );
  }

  const file = files[0];
  if (!file) throw new ProcessorError('image_metadata_no_file', 'Choose an image to clean.');

  on_progress?.({ ratio: 0.15, label: 'Reading image' });
  const { decodeImage } = await import('@/lib/image/decode');
  const decoded = await decodeImage(file);

  try {
    if (signal.aborted)
      throw new ProcessorError('image_metadata_aborted', 'The operation was cancelled.');

    on_progress?.({ ratio: 0.5, label: 'Rebuilding image' });
    const { createCanvas } = await import('@/lib/image/canvas');
    const { canvas, ctx } = createCanvas(decoded.width, decoded.height);
    ctx.drawImage(decoded.bitmap, 0, 0, decoded.width, decoded.height);

    if (signal.aborted)
      throw new ProcessorError('image_metadata_aborted', 'The operation was cancelled.');

    on_progress?.({ ratio: 0.8, label: 'Encoding' });
    const { encodeCanvas } = await import('@/lib/image/encode');
    const blob = await encodeCanvas(canvas, {
      format: options.format,
      quality: options.quality,
      background: options.background,
    });

    on_progress?.({ ratio: 1, label: 'Done' });

    const fileName = replaceExtension(safeFileName(file.name), IMAGE_EXTENSION[options.format]);

    return {
      artifacts: [{ file_name: fileName, mime_type: IMAGE_MIME[options.format], blob }],
    };
  } finally {
    decoded.bitmap.close();
  }
};

export default imageMetadata;
