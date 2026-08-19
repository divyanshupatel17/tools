import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { PAGE_NUMBER_MARGIN_PT, pageNumberLabel, type PageNumberFormat, type PageNumberPosition } from './format';

export type { PageNumberFormat, PageNumberPosition } from './format';

/** Fractional page position (0 to 1), origin bottom left, matching PDF point space. */
export interface PageNumberCustomPosition {
  x: number;
  y: number;
}

export type PageNumberPlacement = PageNumberPosition | PageNumberCustomPosition;

export interface AddPageNumbersOptions {
  position?: PageNumberPlacement;
  format?: PageNumberFormat;
  start?: number;
  font_size?: number;
}

function isCustomPosition(position: PageNumberPlacement): position is PageNumberCustomPosition {
  return typeof position === 'object' && position !== null;
}

/** Small enough to run on the main thread: pdf-lib embeds a standard font directly. */
const addPageNumbers: ToolProcessor<AddPageNumbersOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to number.');

  const position = input.options.position ?? 'bottom-center';
  const format = input.options.format ?? 'n';
  const start = input.options.start ?? 1;
  const font_size = input.options.font_size ?? 12;

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const document_ = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await document_.embedFont(StandardFonts.Helvetica);
  const pages = document_.getPages();
  const margin = PAGE_NUMBER_MARGIN_PT;

  pages.forEach((page, index) => {
    const n = start + index;
    const text = pageNumberLabel(format, n, pages.length);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, font_size);

    let x: number;
    let y: number;
    if (isCustomPosition(position)) {
      // Fractional coordinates are page-relative, origin bottom left, same space as pdf-lib points.
      // The point marks the text's visual center, matching the drag handle's centered anchor in the preview.
      x = position.x * width - textWidth / 2;
      y = position.y * height - font_size * 0.35;
    } else {
      x = position.endsWith('left')
        ? margin
        : position.endsWith('right')
          ? width - margin - textWidth
          : (width - textWidth) / 2;
      y = position.startsWith('top') ? height - margin : margin - font_size * 0.3;
    }

    page.drawText(text, { x, y, size: font_size, font, color: rgb(0, 0, 0) });
  });

  context.on_progress?.({ ratio: 0.8, label: 'Saving the document' });
  const output = await document_.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(output)], { type: 'application/pdf' }),
      },
    ],
    text: String(pages.length),
  };
};

export default addPageNumbers;
