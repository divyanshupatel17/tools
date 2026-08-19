import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { drawUnicodeText, loadUnicodeFonts, measureUnicodeText } from '@/lib/pdf/unicode_font';
import { parsePageRanges } from '@/lib/pdf/page_ranges';
import {
  centeredImageOrigin,
  centeredTextOrigin,
  hexToRgbComponents,
  watermarkPositions,
} from '@/lib/pdf/watermark';

export interface AddWatermarkOptions {
  kind?: 'text' | 'image';
  text?: string;
  font_size?: number;
  color?: string;
  opacity?: number;
  rotation?: number;
  tile?: boolean;
  image_scale?: number;
  /** "1-3,5" — empty or omitted means every page. */
  pages?: string;
}

/** Stamps a text or image watermark onto every selected page. Text draws with the shared
 * Unicode font set (`lib/pdf/unicode_font.ts`) so it is not limited to WinAnsi; an image
 * watermark is embedded once and reused across every page and tile position it is drawn at. */
const addWatermark: ToolProcessor<AddWatermarkOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to watermark.');

  const kind = input.options.kind ?? 'text';
  const opacity = Math.min(1, Math.max(0.02, input.options.opacity ?? 0.25));
  const rotation = input.options.rotation ?? -45;
  const tile = input.options.tile ?? true;

  context.on_progress?.({ ratio: 0.05, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = pdfDoc.getPageCount();

  const targetIndices =
    input.options.pages && input.options.pages.trim().length > 0
      ? [...parsePageRanges(input.options.pages, pageCount)].sort((a, b) => a - b)
      : Array.from({ length: pageCount }, (_, index) => index);

  if (targetIndices.length === 0) {
    throw new ProcessorError('no_pages', 'No pages matched that page range.');
  }

  if (kind === 'text') {
    const text = input.options.text?.trim();
    if (!text) throw new ProcessorError('missing_text', 'Enter the watermark text.');

    const fontSize = input.options.font_size ?? 60;
    const color = hexToRgbComponents(input.options.color ?? '#808080');
    const fonts = await loadUnicodeFonts(pdfDoc);
    const width = measureUnicodeText(text, fonts.bold, fonts, fontSize);

    for (const index of targetIndices) {
      const page = pdfDoc.getPage(index);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      for (const position of watermarkPositions(pageWidth, pageHeight, tile)) {
        const origin = centeredTextOrigin(position.x, position.y, width, fontSize, rotation);
        drawUnicodeText(
          page,
          text,
          origin.x,
          origin.y,
          fonts.bold,
          fonts,
          fontSize,
          [color.r, color.g, color.b],
          rgb,
          {
            rotate: degrees(rotation),
            opacity,
          },
        );
      }
      context.on_progress?.({
        ratio: 0.1 + 0.8 * ((targetIndices.indexOf(index) + 1) / targetIndices.length),
      });
    }
  } else {
    const watermarkFile = input.files[1];
    if (!watermarkFile) throw new ProcessorError('missing_image', 'Add a watermark image.');

    const imageBytes = new Uint8Array(await watermarkFile.arrayBuffer());
    const image =
      watermarkFile.type === 'image/png'
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

    const scale = Math.min(1, Math.max(0.05, (input.options.image_scale ?? 30) / 100));

    for (const index of targetIndices) {
      const page = pdfDoc.getPage(index);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const drawWidth = pageWidth * scale;
      const drawHeight = drawWidth * (image.height / image.width);

      for (const position of watermarkPositions(pageWidth, pageHeight, tile)) {
        const origin = centeredImageOrigin(position.x, position.y, drawWidth, drawHeight, rotation);
        page.drawImage(image, {
          x: origin.x,
          y: origin.y,
          width: drawWidth,
          height: drawHeight,
          rotate: degrees(rotation),
          opacity,
        });
      }
      context.on_progress?.({
        ratio: 0.1 + 0.8 * ((targetIndices.indexOf(index) + 1) / targetIndices.length),
      });
    }
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-watermarked.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(targetIndices.length),
  };
};

export default addWatermark;
