import { replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorArtifact, type ToolProcessor } from '@tools/tool_engine';
import { runBatch } from '@/lib/image/batch';
import { drawResized } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  OUTPUT_FORMATS,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';

export interface ResizeImageOptions {
  mode: 'pixels' | 'percent';
  /** Target width in pixels. Used when mode is 'pixels'. */
  width: number;
  /** Target height in pixels. Used when mode is 'pixels' and lock_aspect is false. */
  height: number;
  /** When true, height (in pixels mode) is derived from each file's own aspect ratio. */
  lock_aspect: boolean;
  /** Scale percentage. Used when mode is 'percent'. */
  percent: number;
  smoothing: 'high' | 'medium' | 'low' | 'none';
}

const RULE = imageRule({ max_files: 30, max_bytes: 60 * 1024 * 1024 });
const RESIZE_QUALITY = 0.92;

/** Keeps the source format when we can write it back out; falls back to a lossless PNG otherwise. */
function outputFormatFor(format: string): OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(format) ? (format as OutputFormat) : 'png';
}

const resizeImage: ToolProcessor<ResizeImageOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'image_invalid_input',
      check.errors[0] ?? 'These files could not be used.',
    );
  }

  return runBatch(
    files,
    async (file): Promise<ProcessorArtifact> => {
      const decoded = await decodeImage(file);
      try {
        let targetWidth: number;
        let targetHeight: number;

        if (options.mode === 'percent') {
          const scale = Math.max(0.01, options.percent / 100);
          targetWidth = Math.max(1, Math.round(decoded.width * scale));
          targetHeight = Math.max(1, Math.round(decoded.height * scale));
        } else if (options.lock_aspect) {
          targetWidth = Math.max(1, Math.round(options.width));
          targetHeight = Math.max(1, Math.round((options.width * decoded.height) / decoded.width));
        } else {
          targetWidth = Math.max(1, Math.round(options.width));
          targetHeight = Math.max(1, Math.round(options.height));
        }

        const { canvas } = drawResized(decoded.bitmap, targetWidth, targetHeight, {
          smoothing: options.smoothing,
        });
        const outputFormat = outputFormatFor(decoded.format);
        const blob = await encodeCanvas(canvas, { format: outputFormat, quality: RESIZE_QUALITY });

        return {
          file_name: replaceExtension(file.name, IMAGE_EXTENSION[outputFormat]),
          mime_type: IMAGE_MIME[outputFormat],
          blob,
        };
      } finally {
        decoded.bitmap.close();
      }
    },
    { signal, on_progress },
    { auto_zip: false },
  );
};

export default resizeImage;
