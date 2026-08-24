import { PDFDocument } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export type FlattenPdfOptions = Record<string, unknown>;

// pdf-lib's form.flatten() bakes each field's current appearance into the page content and
// removes the interactive widgets, so the output can no longer be filled in.
const flattenPdf: ToolProcessor<FlattenPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to flatten.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const form = pdfDoc.getForm();
  const fieldCount = form.getFields().length;

  context.on_progress?.({ ratio: 0.5, label: 'Flattening form fields' });
  if (fieldCount > 0) form.flatten();

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-flattened.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(fieldCount),
  };
};

export default flattenPdf;
