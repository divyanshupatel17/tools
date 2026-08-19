import { PDFDocument } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export interface SignPdfOptions {
  /** 0-based page index to place the signature on. */
  page_index?: number;
  /** Center point, as a fraction (0-1) of the page's own width/height. */
  x?: number;
  y?: number;
  /** Signature image width, as a fraction of the page's width. */
  scale?: number;
}

/**
 * Places a signature image (drawn, typed, or uploaded — the workspace turns every method into
 * one PNG or JPEG blob before this runs) on one page. This is a visible signature only, the
 * same as printing, signing, and re-scanning a page. It carries no cryptographic proof of
 * signer identity or document integrity — a PAdES signature needs a certificate and key
 * handling this tool does not have, and is out of scope until there is a reason to add it.
 */
const signPdf: ToolProcessor<SignPdfOptions> = async (input, context) => {
  const file = input.files[0];
  const signatureFile = input.files[1];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to sign.');
  if (!signatureFile) throw new ProcessorError('missing_signature', 'Add a signature first.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = pdfDoc.getPageCount();
  const pageIndex = Math.min(Math.max(input.options.page_index ?? pageCount - 1, 0), pageCount - 1);
  const page = pdfDoc.getPage(pageIndex);
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const signatureBytes = new Uint8Array(await signatureFile.arrayBuffer());
  const image =
    signatureFile.type === 'image/png'
      ? await pdfDoc.embedPng(signatureBytes)
      : await pdfDoc.embedJpg(signatureBytes);

  const scale = Math.min(0.9, Math.max(0.05, input.options.scale ?? 0.3));
  const drawWidth = pageWidth * scale;
  const drawHeight = drawWidth * (image.height / image.width);

  const centerX = Math.min(1, Math.max(0, input.options.x ?? 0.7)) * pageWidth;
  const centerY = Math.min(1, Math.max(0, input.options.y ?? 0.15)) * pageHeight;

  context.on_progress?.({ ratio: 0.6, label: 'Placing the signature' });
  page.drawImage(image, {
    x: centerX - drawWidth / 2,
    y: centerY - drawHeight / 2,
    width: drawWidth,
    height: drawHeight,
  });

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-signed.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(pageIndex),
  };
};

export default signPdf;
