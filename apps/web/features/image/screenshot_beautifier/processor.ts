import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import { createCanvas } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { EXPORT_LONG_EDGE, computeCanvasSize, type BackgroundType } from './background_options';
import { drawScreenshotComposition, titleBarHeightFor } from './draw_screenshot';

export interface ScreenshotBeautifierOptions {
  aspect_ratio?: string;
  background_type?: BackgroundType;
  background_color?: string;
  background_color2?: string;
  direction?: string;
  padding?: number;
  corner_radius?: number;
  /** 0 to 100. */
  shadow_strength?: number;
  frame?: boolean;
  frame_color?: string;
  dot_color?: string;
  format?: OutputFormat;
  /** 1 to 100. Ignored for PNG. */
  quality?: number;
}

const MAX_BYTES = 40 * 1024 * 1024;

const screenshotBeautifier: ToolProcessor<ScreenshotBeautifierOptions> = async (input, context) => {
  const validation = validateFiles(input.files, imageRule({ max_files: 1, max_bytes: MAX_BYTES }));
  if (!validation.ok) {
    throw new ProcessorError(
      'screenshot_invalid_input',
      validation.errors[0] ?? 'This file cannot be processed.',
    );
  }

  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a screenshot to beautify.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the screenshot' });
  const decoded = await decodeImage(file);

  try {
    if (context.signal.aborted) {
      throw new ProcessorError('screenshot_aborted', 'The operation was cancelled.');
    }

    const size = computeCanvasSize(input.options.aspect_ratio, decoded, EXPORT_LONG_EDGE);
    const { canvas, ctx } = createCanvas(size.width, size.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const frame = input.options.frame ?? false;
    const titleBarHeight = titleBarHeightFor(size.height);

    drawScreenshotComposition(ctx, size.width, size.height, decoded.bitmap, {
      backgroundType: input.options.background_type ?? 'solid',
      backgroundColor: input.options.background_color ?? '#eef1f5',
      backgroundColor2: input.options.background_color2 ?? '#3a8dff',
      direction: input.options.direction ?? 'diagonal',
      padding: input.options.padding ?? 120,
      cornerRadius: input.options.corner_radius ?? 24,
      shadowStrength: Math.min(100, Math.max(0, input.options.shadow_strength ?? 40)),
      frame,
      frameColor: input.options.frame_color ?? '#1f2126',
      dotColor: input.options.dot_color ?? '#ffffff',
      titleBarHeight,
    });

    if (context.signal.aborted) {
      throw new ProcessorError('screenshot_aborted', 'The operation was cancelled.');
    }

    context.on_progress?.({ ratio: 0.75, label: 'Encoding' });

    const format: OutputFormat = input.options.format ?? 'png';
    const quality = Math.min(1, Math.max(0.1, (input.options.quality ?? 90) / 100));
    const blob = await encodeCanvas(canvas, {
      format,
      quality,
      background: input.options.background_color ?? '#eef1f5',
    });

    context.on_progress?.({ ratio: 1, label: 'Done' });

    return {
      artifacts: [
        {
          file_name: replaceExtension(safeFileName(file.name), IMAGE_EXTENSION[format]),
          mime_type: IMAGE_MIME[format],
          blob,
        },
      ],
    };
  } finally {
    decoded.bitmap.close();
  }
};

export default screenshotBeautifier;
