import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export interface ExtractPagesOptions {
  /** 0-based page indices to keep, in the order they should appear in the output. */
  keep?: number[];
}

/** Small enough to run on the main thread: no worker for a document this size. */
const extractPages: ToolProcessor<ExtractPagesOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to extract pages from.');

  const keep = input.options.keep ?? [];
  if (keep.length === 0) throw new ProcessorError('no_selection', 'Select at least one page to extract.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, keep);
  for (const page of pages) output.addPage(page);

  context.on_progress?.({ ratio: 0.7, label: 'Saving the document' });
  const saved = await output.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(saved)], { type: 'application/pdf' }),
      },
    ],
    text: String(keep.length),
  };
};

export default extractPages;
