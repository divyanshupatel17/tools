import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export interface DeletePagesOptions {
  /** 0-based page indices to remove. */
  remove?: number[];
}

/** Small enough to run on the main thread: no worker for a document this size. */
const deletePages: ToolProcessor<DeletePagesOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to remove pages from.');

  const remove = input.options.remove ?? [];
  if (remove.length === 0) throw new ProcessorError('no_selection', 'Select at least one page to remove.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const document_ = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = document_.getPageCount();

  if (remove.length >= pageCount) {
    throw new ProcessorError('all_pages_selected', 'At least one page must remain in the document.');
  }

  // Removing by index shifts everything after it, so go from the end.
  for (const index of [...remove].sort((a, b) => b - a)) {
    if (index < 0 || index >= pageCount) continue;
    document_.removePage(index);
  }

  context.on_progress?.({ ratio: 0.7, label: 'Saving the document' });
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
    text: String(pageCount - remove.length),
  };
};

export default deletePages;
