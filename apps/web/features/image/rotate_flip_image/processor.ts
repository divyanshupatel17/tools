import { replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorArtifact, type ToolProcessor } from '@tools/tool_engine';
import { runBatch } from '@/lib/image/batch';
import { createCanvas } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  OUTPUT_FORMATS,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';

export interface RotateFlipTransform {
  /** Degrees, positive is clockwise. Any value is accepted; 90 step values keep exact pixels. */
  rotation: number;
  flip_horizontal: boolean;
  flip_vertical: boolean;
}

export interface RotateFlipImageOptions {
  /** One transform per file, in the same order as `files`, so a batch can mix per image edits
   *  with a shared default rather than forcing one rotation onto everything. */
  transforms: readonly RotateFlipTransform[];
  /** Fills the corners a custom rotation angle exposes. Ignored for 90 degree steps. */
  background: string;
}

const RULE = imageRule({ max_files: 30, max_bytes: 60 * 1024 * 1024 });
const ENCODE_QUALITY = 0.92;

function outputFormatFor(format: string): OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(format) ? (format as OutputFormat) : 'png';
}

function normalizeDegrees(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

const rotateFlipImage: ToolProcessor<RotateFlipImageOptions> = async (
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
  if (options.transforms.length !== files.length) {
    throw new ProcessorError(
      'image_invalid_input',
      'Each file needs its own rotation and flip settings.',
    );
  }

  return runBatch(
    files,
    async (file, index): Promise<ProcessorArtifact> => {
      const transform = options.transforms[index]!;
      const degrees = normalizeDegrees(transform.rotation);
      const radians = (degrees * Math.PI) / 180;
      const isRightAngle = degrees % 90 === 0;

      const decoded = await decodeImage(file);
      try {
        const sin = Math.abs(Math.sin(radians));
        const cos = Math.abs(Math.cos(radians));
        const outWidth = isRightAngle
          ? degrees % 180 === 0
            ? decoded.width
            : decoded.height
          : Math.ceil(decoded.width * cos + decoded.height * sin);
        const outHeight = isRightAngle
          ? degrees % 180 === 0
            ? decoded.height
            : decoded.width
          : Math.ceil(decoded.width * sin + decoded.height * cos);

        const { canvas, ctx } = createCanvas(outWidth, outHeight);

        if (!isRightAngle) {
          ctx.fillStyle = options.background;
          ctx.fillRect(0, 0, outWidth, outHeight);
        }

        ctx.translate(outWidth / 2, outHeight / 2);
        ctx.rotate(radians);
        ctx.scale(transform.flip_horizontal ? -1 : 1, transform.flip_vertical ? -1 : 1);
        ctx.drawImage(decoded.bitmap, -decoded.width / 2, -decoded.height / 2);

        const outputFormat = outputFormatFor(decoded.format);
        const blob = await encodeCanvas(canvas, {
          format: outputFormat,
          quality: ENCODE_QUALITY,
          background: options.background,
        });

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

export default rotateFlipImage;
