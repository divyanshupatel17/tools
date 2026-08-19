import { fileExtension, replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { decodeImage } from '@/lib/image/decode';
import { imageRule } from '@/lib/image/image_formats';
import { extractPalette, type SampledColor } from '@/lib/image/palette';

export interface ColorExtractorOptions {
  /** Number of dominant colours to extract. Clamped to 2 to 20. */
  count: number;
}

const RULE = imageRule({ max_files: 1, max_bytes: 40 * 1024 * 1024 });

function buildCss(palette: readonly SampledColor[]): string {
  const lines = palette.map((color, index) => `  --color-${index + 1}: ${color.hex};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

function fileStem(name: string): string {
  const safe = safeFileName(name);
  const extension = fileExtension(safe);
  return extension ? safe.slice(0, -(extension.length + 1)) : safe;
}

function buildList(palette: readonly SampledColor[]): string {
  return palette
    .map((color, index) => {
      const { r, g, b } = color.rgb;
      const { h, s, l } = color.hsl;
      const share = color.share !== undefined ? ` (${Math.round(color.share * 100)}%)` : '';
      return `${index + 1}. ${color.hex}  rgb(${r}, ${g}, ${b})  hsl(${h}, ${s}%, ${l}%)${share}`;
    })
    .join('\n');
}

/** Decodes the image and extracts its dominant colours, exported as CSS custom properties and
 * a plain list. The workspace's on screen palette is computed the same way with `extractPalette`
 * directly for instant slider feedback; this processor produces the downloadable form. */
const colorExtractor: ToolProcessor<ColorExtractorOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'image_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('image_invalid_input', 'Choose an image first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.2, label: 'Reading the image' });
  const decoded = await decodeImage(file);
  const count = Math.max(2, Math.min(20, Math.round(options.count)));
  let palette: SampledColor[];
  try {
    palette = extractPalette(decoded.bitmap, count);
  } finally {
    decoded.bitmap.close();
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (palette.length === 0) {
    throw new ProcessorError('image_no_colors', 'No colours could be found in this image.');
  }

  on_progress?.({ ratio: 0.8, label: 'Building the palette' });
  const cssBlob = new Blob([buildCss(palette)], { type: 'text/css' });
  const listBlob = new Blob([buildList(palette)], { type: 'text/plain' });
  on_progress?.({ ratio: 1, label: 'Done' });

  const stem = fileStem(file.name);
  return {
    artifacts: [
      { file_name: replaceExtension(file.name, 'css'), mime_type: 'text/css', blob: cssBlob },
      { file_name: `${stem} colors.txt`, mime_type: 'text/plain', blob: listBlob },
    ],
    text: JSON.stringify(palette),
  };
};

export default colorExtractor;
