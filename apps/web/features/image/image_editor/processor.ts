import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, validateFiles } from '@tools/file_utils';
import { decodeImage } from '@/lib/image/decode';
import { encodeCanvas } from '@/lib/image/encode';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { renderComposition } from './compositor';
import type { Adjustments, BorderStyle, Layer, Transform } from './editor_state';

export interface ImageEditorOptions {
  layers: Layer[];
  adjustments: Adjustments;
  border: BorderStyle;
  background: string;
  transform: Transform;
  output_format: OutputFormat;
  /** 0 to 1. Ignored for PNG. */
  quality: number;
}

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');
}

/**
 * Renders the editor's document at the base image's full natural resolution — the exact same
 * `renderComposition` call the workspace uses for its live preview, just with `scale: 1`
 * against the full size decoded bitmap instead of a small preview canvas.
 */
const imageEditor: ToolProcessor<ImageEditorOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add an image to edit.');

  const validation = validateFiles(input.files, imageRule());
  if (!validation.ok)
    throw new ProcessorError(
      'invalid_file',
      validation.errors[0] ?? 'That file could not be used.',
    );

  const { layers, adjustments, border, background, transform, output_format, quality } =
    input.options;

  context.on_progress?.({ ratio: 0.05, label: 'Reading the image' });
  const base = await decodeImage(file);
  checkAborted(context.signal);

  const imageBitmaps = new Map<string, ImageBitmap>();
  const decodedByFileIndex = new Map<number, ImageBitmap>();
  const imageLayers = layers.filter(
    (layer): layer is Extract<Layer, { type: 'image' }> => layer.type === 'image',
  );

  try {
    for (let index = 0; index < imageLayers.length; index += 1) {
      checkAborted(context.signal);
      const layer = imageLayers[index]!;
      let bitmap = decodedByFileIndex.get(layer.file_index);
      if (!bitmap) {
        const overlayFile = input.files[layer.file_index];
        if (!overlayFile) continue;
        const decoded = await decodeImage(overlayFile);
        bitmap = decoded.bitmap;
        decodedByFileIndex.set(layer.file_index, bitmap);
      }
      imageBitmaps.set(layer.id, bitmap);
      context.on_progress?.({
        ratio: 0.05 + 0.35 * ((index + 1) / imageLayers.length),
        label: 'Placing overlays',
      });
    }

    checkAborted(context.signal);
    context.on_progress?.({ ratio: 0.5, label: 'Rendering the full resolution image' });

    const result = renderComposition({
      base: base.bitmap,
      documentWidth: base.width,
      documentHeight: base.height,
      layers,
      imageBitmaps,
      adjustments,
      border,
      background,
      transform,
      scale: 1,
    });

    checkAborted(context.signal);
    context.on_progress?.({ ratio: 0.85, label: 'Encoding' });

    const blob = await encodeCanvas(result.canvas, { format: output_format, quality, background });
    context.on_progress?.({ ratio: 1, label: 'Done' });

    const stem = replaceExtension(file.name, IMAGE_EXTENSION[output_format]).replace(
      new RegExp(`\\.${IMAGE_EXTENSION[output_format]}$`, 'i'),
      '',
    );

    return {
      artifacts: [
        {
          file_name: `${stem}-edited.${IMAGE_EXTENSION[output_format]}`,
          mime_type: IMAGE_MIME[output_format],
          blob,
        },
      ],
    };
  } finally {
    base.bitmap.close();
    for (const bitmap of decodedByFileIndex.values()) bitmap.close();
  }
};

export default imageEditor;
