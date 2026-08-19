import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import type { MergeResponse } from '@/workers/merge_pdf.worker';

export interface MergePdfOptions {
  /** Base name for the merged document, without an extension. */
  file_name?: string;
}

export interface MergePdfResult {
  pages: number;
}

/**
 * Merging is CPU-bound and would block typing and drag-reordering, so pdf-lib runs
 * in a worker. The buffers are transferred rather than copied.
 */
const mergePdf: ToolProcessor<MergePdfOptions> = async (input, context) => {
  if (input.files.length < 2) {
    throw new ProcessorError('too_few_files', 'Add at least two PDF files to merge.');
  }

  const sources = await Promise.all(input.files.map((file) => file.arrayBuffer()));
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Merge cancelled.');

  const worker = new Worker(new URL('@/workers/merge_pdf.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    const { bytes, pages } = await new Promise<{ bytes: ArrayBuffer; pages: number }>(
      (resolve, reject) => {
        const abort = () => {
          worker.terminate();
          reject(new ProcessorError('aborted', 'Merge cancelled.'));
        };
        context.signal.addEventListener('abort', abort, { once: true });

        worker.onerror = () =>
          reject(new ProcessorError('worker_failed', 'The merge worker could not start.'));

        worker.onmessage = (event: MessageEvent<MergeResponse>) => {
          const message = event.data;
          if (message.type === 'progress') {
            context.on_progress?.({
              ratio: message.ratio,
              label:
                message.ratio < 1
                  ? `Merging ${message.done} of ${message.total}`
                  : 'Writing the document',
            });
            return;
          }
          if (message.type === 'error') {
            reject(new ProcessorError('merge_failed', message.message));
            return;
          }
          resolve({ bytes: message.bytes, pages: message.pages });
        };

        worker.postMessage({ sources }, sources);
      },
    );

    const base = input.options.file_name?.trim();
    const fallback = input.files[0] ? replaceExtension(input.files[0].name, 'pdf') : 'merged.pdf';

    return {
      artifacts: [
        {
          file_name: base ? `${base}.pdf` : `merged-${fallback}`,
          mime_type: 'application/pdf',
          blob: new Blob([bytes], { type: 'application/pdf' }),
        },
      ],
      text: String(pages),
    };
  } finally {
    worker.terminate();
  }
};

export default mergePdf;
