import { safeFileName } from '@tools/file_utils';
import type { ToolProcessor } from '@tools/tool_engine';
import { runBatch } from '@/lib/image/batch';
import { drawResized } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import { IMAGE_EXTENSION, type ConvertOutputFormat } from '@/lib/image/image_formats';
import { fitIcoSize } from './ico_size';

export interface ConvertImageOptions {
  /** The format every input is written out as. Reading this from options is what lets one
   *  processor serve all fifty conversion registry ids: each preset route just fixes this value. */
  format: ConvertOutputFormat;
  /** 0 to 1. Ignored for PNG. */
  quality: number;
  /** Fills transparency when the target format has no alpha channel, e.g. converting to JPG. */
  background: string;
  /** Rasterisation size for SVG input, which has no intrinsic pixel size of its own. */
  svg_size?: { width: number; height: number };
}

function outputFileName(file: File, format: ConvertOutputFormat): string {
  const base = safeFileName(file.name).replace(/\.[^./]+$/, '');
  return `${base || 'image'}.${IMAGE_EXTENSION[format]}`;
}

const convertImage: ToolProcessor<ConvertImageOptions> = async ({ files, options }, context) => {
  return runBatch(
    files,
    async (file) => {
      const decoded = await decodeImage(file, { svg_size: options.svg_size });
      try {
        // An ICO cannot describe a side longer than 256 pixels, and the encoder does not scale
        // for us, so a bigger image is scaled down here rather than written out mislabelled.
        const target =
          options.format === 'ico'
            ? fitIcoSize(decoded.width, decoded.height)
            : { width: decoded.width, height: decoded.height };

        const { canvas } = drawResized(decoded.bitmap, target.width, target.height);

        const blob = await encodeCanvas(canvas, {
          format: options.format,
          quality: options.quality,
          background: options.background,
        });

        return {
          file_name: outputFileName(file, options.format),
          mime_type: blob.type,
          blob,
        };
      } finally {
        decoded.bitmap.close();
      }
    },
    context,
    // One artifact per input file, in `files` order: the workspace pairs each result with its
    // own row and builds its own "Download all" zip.
    { auto_zip: false },
  );
};

export default convertImage;
