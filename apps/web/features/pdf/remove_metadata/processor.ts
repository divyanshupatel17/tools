import { PDFDocument, PDFName } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export type RemoveMetadataOptions = Record<string, unknown>;

/**
 * Drops the whole `/Info` dictionary (title, author, subject, keywords, creator, producer,
 * both dates) rather than blanking each field to an empty string — an empty string is still a
 * value a viewer can display and still an object in the file. The `/Metadata` XMP stream
 * referenced from the catalog, if present, is unlinked the same way. Loaded and saved with
 * `updateMetadata: false` so pdf-lib does not write its own producer/mod-date back in on save.
 */
const removeMetadata: ToolProcessor<RemoveMetadataOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to clean.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });

  const hadInfo = pdfDoc.context.trailerInfo.Info !== undefined;
  const hadXmp = pdfDoc.catalog.get(PDFName.of('Metadata')) !== undefined;

  context.on_progress?.({ ratio: 0.5, label: 'Removing metadata' });
  pdfDoc.context.trailerInfo.Info = undefined;
  pdfDoc.catalog.delete(PDFName.of('Metadata'));

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-cleaned.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: JSON.stringify({ had_info: hadInfo, had_xmp: hadXmp }),
  };
};

export default removeMetadata;
