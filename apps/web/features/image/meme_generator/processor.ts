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
import { renderMeme, type MemeTextBox } from './render';

export interface MemeGeneratorOptions {
  boxes: MemeTextBox[];
}

const MAX_BYTES = 40 * 1024 * 1024;

function outputFormatFor(format: string): OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(format) ? (format as OutputFormat) : 'png';
}

const memeGenerator: ToolProcessor<MemeGeneratorOptions> = async ({ files, options }, context) => {
  const check = validateFiles(files, imageRule({ max_files: 1, max_bytes: MAX_BYTES }));
  if (!check.ok) {
    throw new ProcessorError('invalid_input', check.errors[0] ?? 'That image could not be used.');
  }

  const file = files[0];
  if (!file) throw new ProcessorError('invalid_input', 'Add an image to caption.');
  if (context.signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');

  context.on_progress?.({ ratio: 0.15, label: 'Reading image' });
  const decoded = await decodeImage(file);

  try {
    const { canvas, ctx } = createCanvas(decoded.width, decoded.height);
    ctx.drawImage(decoded.bitmap, 0, 0);

    context.on_progress?.({ ratio: 0.5, label: 'Drawing captions' });
    renderMeme(ctx, decoded.width, decoded.height, options.boxes ?? []);

    if (context.signal.aborted)
      throw new DOMException('The operation was cancelled.', 'AbortError');

    context.on_progress?.({ ratio: 0.8, label: 'Encoding' });
    const format = outputFormatFor(decoded.format);
    const blob = await encodeCanvas(canvas, { format, quality: 0.92 });
    context.on_progress?.({ ratio: 1 });

    return {
      artifacts: [
        {
          file_name: replaceExtension(file.name, IMAGE_EXTENSION[format]),
          mime_type: IMAGE_MIME[format],
          blob,
        },
      ],
    };
  } finally {
    decoded.bitmap.close();
  }
};

export default memeGenerator;
