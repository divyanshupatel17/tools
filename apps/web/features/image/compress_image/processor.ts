import { replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorArtifact, type ToolProcessor } from '@tools/tool_engine';
import { runBatch } from '@/lib/image/batch';
import { createCanvas } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas, encodeToTargetSize } from '@/lib/image/encode';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';

export interface CompressImageOptions {
  /** Output format. Must be one of the four writable formats. */
  format: OutputFormat;
  mode: 'quality' | 'target_size';
  /** 1 to 100. Used when mode is 'quality'. */
  quality: number;
  /** Used when mode is 'target_size'. */
  target_kb: number;
  /** Fill colour used only when converting a transparent image to a format without alpha. */
  background: string;
}

const RULE = imageRule({ max_files: 30, max_bytes: 60 * 1024 * 1024 });

const compressImage: ToolProcessor<CompressImageOptions> = async (
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

  const mime = IMAGE_MIME[options.format];
  const extension = IMAGE_EXTENSION[options.format];
  const targetBytes = Math.max(1024, Math.round(options.target_kb * 1024));

  return runBatch(
    files,
    async (file): Promise<ProcessorArtifact> => {
      const decoded = await decodeImage(file);
      try {
        const { canvas, ctx } = createCanvas(decoded.width, decoded.height);
        ctx.drawImage(decoded.bitmap, 0, 0);

        let blob =
          options.mode === 'target_size'
            ? (
                await encodeToTargetSize(
                  canvas,
                  {
                    format: options.format,
                    target_bytes: targetBytes,
                    background: options.background,
                  },
                  { signal },
                )
              ).blob
            : await encodeCanvas(canvas, {
                format: options.format,
                quality: options.quality / 100,
                background: options.background,
              });

        // Re encoding can lose to whatever produced the original, especially for
        // lossless PNG. Never hand back a bigger file when the format did not change.
        if (blob.size >= file.size && file.type === mime) blob = file;

        return { file_name: replaceExtension(file.name, extension), mime_type: mime, blob };
      } finally {
        decoded.bitmap.close();
      }
    },
    { signal, on_progress },
    { auto_zip: false },
  );
};

export default compressImage;
