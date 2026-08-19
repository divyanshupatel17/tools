import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { drawUnicodeText, loadUnicodeFonts, measureUnicodeText } from '@/lib/pdf/unicode_font';
import { centeredImageOrigin, centeredTextOrigin, hexToRgbComponents } from '@/lib/pdf/watermark';

export interface EditPdfElement {
  page_index: number;
  kind: 'text' | 'image';
  /** Center point, as a fraction (0-1) of the page's own width/height. */
  x: number;
  y: number;
  text?: string;
  font_size?: number;
  color?: string;
  /** Index into `input.files`, 1-based (file 0 is always the source PDF). */
  file_index?: number;
  /** Image width, as a fraction of the page's width. */
  scale?: number;
}

export interface EditPdfOptions {
  elements?: EditPdfElement[];
}

/**
 * Adds new text and image elements at chosen positions on chosen pages — it does not read,
 * move or remove anything already on the page. Editing a PDF's *existing* content would need
 * to reverse-engineer arbitrary content-stream operators (text runs, paths, images already
 * placed by whatever produced the file) well enough to safely rewrite them, which is a
 * different and much larger project than this tool's scope: adding new content on top, the
 * same well-defined operation Add Watermark and Sign PDF already do, just for many
 * independently placed elements instead of one repeated mark or one signature.
 */
const editPdf: ToolProcessor<EditPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to edit.');

  const elements = input.options.elements ?? [];
  if (elements.length === 0) throw new ProcessorError('no_elements', 'Add at least one text box or image.');

  context.on_progress?.({ ratio: 0.05, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = pdfDoc.getPageCount();
  const fonts = await loadUnicodeFonts(pdfDoc);

  for (let index = 0; index < elements.length; index += 1) {
    if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');
    const element = elements[index]!;
    if (element.page_index < 0 || element.page_index >= pageCount) continue;

    const page = pdfDoc.getPage(element.page_index);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const centerX = Math.min(1, Math.max(0, element.x)) * pageWidth;
    const centerY = Math.min(1, Math.max(0, element.y)) * pageHeight;

    if (element.kind === 'text') {
      const text = element.text?.trim();
      if (!text) continue;
      const fontSize = element.font_size ?? 18;
      const color = hexToRgbComponents(element.color ?? '#1a1a1a');
      const width = measureUnicodeText(text, fonts.regular, fonts, fontSize);
      const origin = centeredTextOrigin(centerX, centerY, width, fontSize, 0);
      drawUnicodeText(page, text, origin.x, origin.y, fonts.regular, fonts, fontSize, [color.r, color.g, color.b], rgb, {
        rotate: degrees(0),
      });
    } else {
      const imageFile = element.file_index !== undefined ? input.files[element.file_index] : undefined;
      if (!imageFile) continue;
      const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
      const image = imageFile.type === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
      const drawWidth = pageWidth * Math.min(1, Math.max(0.02, element.scale ?? 0.3));
      const drawHeight = drawWidth * (image.height / image.width);
      const origin = centeredImageOrigin(centerX, centerY, drawWidth, drawHeight, 0);
      page.drawImage(image, { x: origin.x, y: origin.y, width: drawWidth, height: drawHeight });
    }

    context.on_progress?.({ ratio: 0.1 + 0.8 * ((index + 1) / elements.length), label: `Placing element ${index + 1} of ${elements.length}` });
  }

  context.on_progress?.({ ratio: 0.95, label: 'Saving' });
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-edited.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default editPdf;
