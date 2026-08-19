import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import { removeGeminiWatermarkFromImage } from '@/lib/image/watermark_removal';
import { IMAGE_EXTENSION, IMAGE_MIME, imageRule } from '@/lib/image/image_formats';

export interface GeminiWatermarkRemoverOptions {
  /** 0 to 1. Ignored for PNG, the default. */
  quality?: number;
}

export interface GeminiWatermarkRemoverOutput extends ProcessorOutput {
  /** One entry per input file, in the same order; false where no watermark was found in that file. */
  found: boolean[];
}

const MAX_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 20;
const RULE = imageRule({ max_files: MAX_FILES, max_bytes: MAX_BYTES });

const geminiWatermarkRemover: ToolProcessor<GeminiWatermarkRemoverOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const validation = validateFiles(files, RULE);
  if (!validation.ok) {
    throw new ProcessorError(
      'ai_watermark_invalid_input',
      validation.errors[0] ?? 'This file cannot be processed.',
    );
  }
  if (files.length === 0) {
    throw new ProcessorError('ai_watermark_no_file', 'Choose an image to remove the watermark from.');
  }

  const { decodeImage } = await import('@/lib/image/decode');
  const { encodeCanvas } = await import('@/lib/image/encode');

  const artifacts: ProcessorOutput['artifacts'] = [];
  const found: boolean[] = [];
  const total = files.length;

  for (let index = 0; index < total; index += 1) {
    if (signal.aborted) throw new ProcessorError('ai_watermark_aborted', 'The operation was cancelled.');

    const file = files[index]!;
    const base = index / total;
    const span = 1 / total;
    on_progress?.({ ratio: base + span * 0.1, label: `Reading image ${index + 1} of ${total}` });

    const decoded = await decodeImage(file);
    try {
      if (signal.aborted) throw new ProcessorError('ai_watermark_aborted', 'The operation was cancelled.');

      on_progress?.({ ratio: base + span * 0.4, label: `Locating the watermark ${index + 1} of ${total}` });
      const { canvas, found: fileFound } = removeGeminiWatermarkFromImage(
        decoded.bitmap,
        decoded.width,
        decoded.height,
      );

      if (signal.aborted) throw new ProcessorError('ai_watermark_aborted', 'The operation was cancelled.');

      on_progress?.({ ratio: base + span * 0.8, label: `Encoding ${index + 1} of ${total}` });
      const blob = await encodeCanvas(canvas.canvas, { format: 'png', quality: options.quality });

      artifacts.push({
        file_name: replaceExtension(safeFileName(file.name), IMAGE_EXTENSION.png),
        mime_type: IMAGE_MIME.png,
        blob,
      });
      found.push(fileFound);
    } finally {
      decoded.bitmap.close();
    }

    on_progress?.({ ratio: (index + 1) / total, label: `Processed ${index + 1} of ${total}` });
  }

  const output: GeminiWatermarkRemoverOutput = { artifacts, found };
  return output;
};

export default geminiWatermarkRemover;
