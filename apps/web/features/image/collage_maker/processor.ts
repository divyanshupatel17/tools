import { validateFiles } from '@tools/file_utils';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { createCanvas } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import { IMAGE_EXTENSION, IMAGE_MIME, imageRule, type OutputFormat } from '@/lib/image/image_formats';
import { EXPORT_LONG_EDGE, computeCanvasSize, findLayout } from './layout_options';
import { drawCollage, drawFreeCollage } from './draw_collage';

/** `free_items` must already be in stacking order (first is the bottom of the stack). */
export interface FreeItemOption { file_index: number; x: number; y: number; width: number; }
/** `focal_x`/`focal_y` default to 0.5, 0.5 (centered) when omitted. */
export interface GridCellOption { file_index: number; focal_x?: number; focal_y?: number; }
export interface CollageMakerOptions {
  layout?: string;
  rows?: number;
  cols?: number;
  mode?: 'grid' | 'free';
  grid_cells?: readonly (GridCellOption | null)[];
  free_items?: readonly FreeItemOption[];
  aspect_ratio?: string;
  spacing?: number;
  border_width?: number;
  border_color?: string;
  background_color?: string;
  format?: OutputFormat;
  quality?: number;
}

const MAX_FILES = 12;

const collageMaker: ToolProcessor<CollageMakerOptions> = async (input, context) => {
  const validation = validateFiles(input.files, imageRule({ max_files: MAX_FILES, max_bytes: 40 * 1024 * 1024 }));
  if (!validation.ok) throw new ProcessorError('invalid_input', validation.errors[0] ?? 'These pictures could not be used.');
  if (input.files.length === 0) throw new ProcessorError('missing_files', 'Add at least one picture for the collage.');

  const baseLayout = findLayout(input.options.layout);
  const rows = Math.max(1, Math.min(4, Math.round(input.options.rows ?? baseLayout.rows)));
  const cols = Math.max(1, Math.min(4, Math.round(input.options.cols ?? baseLayout.cols)));
  const layout = { ...baseLayout, rows, cols };
  const mode = input.options.mode ?? 'grid';
  const spacing = Math.max(0, input.options.spacing ?? 16);
  const borderWidth = Math.max(0, input.options.border_width ?? 0);
  const backgroundColor = input.options.background_color ?? '#ffffff';
  const format: OutputFormat = input.options.format ?? 'jpeg';
  const quality = Math.min(1, Math.max(0.1, (input.options.quality ?? 90) / 100));

  context.on_progress?.({ ratio: 0.05, label: 'Reading pictures' });
  const decoded = await Promise.all(input.files.map((file, index) => decodeImage(file).then((value) => {
    context.on_progress?.({ ratio: 0.05 + 0.55 * ((index + 1) / input.files.length) });
    return value.bitmap;
  })));
  try {
    if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');
    const size = computeCanvasSize(layout, input.options.aspect_ratio, EXPORT_LONG_EDGE);
    const { canvas, ctx } = createCanvas(size.width, size.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (mode === 'free') {
      const items = (input.options.free_items ?? [])
        .map((item) => ({ ...item, image: decoded[item.file_index] }))
        .filter((item): item is FreeItemOption & { image: ImageBitmap } => Boolean(item.image));
      drawFreeCollage(ctx, size.width, size.height, items, backgroundColor);
    } else {
      const gridCells = input.options.grid_cells ?? [];
      const pictures = Array.from({ length: rows * cols }, (_, index) => {
        const cell = gridCells[index];
        if (!cell) return null;
        const image = decoded[cell.file_index];
        if (!image) return null;
        return { image, focal: { x: cell.focal_x ?? 0.5, y: cell.focal_y ?? 0.5 } };
      });
      drawCollage(ctx, size.width, size.height, pictures, layout, { spacing, borderWidth, borderColor: input.options.border_color ?? '#ffffff', backgroundColor });
    }
    context.on_progress?.({ ratio: 0.8, label: 'Encoding' });
    const blob = await encodeCanvas(canvas, { format, quality, background: backgroundColor });
    context.on_progress?.({ ratio: 1, label: 'Done' });
    return { artifacts: [{ file_name: `collage.${IMAGE_EXTENSION[format]}`, mime_type: IMAGE_MIME[format], blob }] };
  } finally { decoded.forEach((bitmap) => bitmap.close()); }
};

export default collageMaker;
