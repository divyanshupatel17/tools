import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import type { OrganizeResponse } from '@/workers/organize_pdf.worker';

export interface OrganizePdfOptions {
  order?: Array<{ index: number; rotation: number }>;
}

/** Rebuilding a whole document is CPU-bound, so pdf-lib runs in a worker. */
const organizePdf: ToolProcessor<OrganizePdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to organize.');

  const order = input.options.order ?? [];
  if (order.length === 0) throw new ProcessorError('no_pages', 'At least one page must remain.');

  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const worker = new Worker(new URL('@/workers/organize_pdf.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    const { bytes, pages } = await new Promise<{ bytes: ArrayBuffer; pages: number }>(
      (resolve, reject) => {
        const abort = () => {
          worker.terminate();
          reject(new ProcessorError('aborted', 'Cancelled.'));
        };
        context.signal.addEventListener('abort', abort, { once: true });

        worker.onerror = () =>
          reject(new ProcessorError('worker_failed', 'The organize worker could not start.'));

        worker.onmessage = (event: MessageEvent<OrganizeResponse>) => {
          const message = event.data;
          if (message.type === 'progress') {
            context.on_progress?.({ ratio: message.ratio, label: 'Rebuilding the document' });
            return;
          }
          if (message.type === 'error') {
            reject(new ProcessorError('organize_failed', message.message));
            return;
          }
          resolve({ bytes: message.bytes, pages: message.pages });
        };

        worker.postMessage({ source, order }, [source]);
      },
    );

    return {
      artifacts: [
        {
          file_name: replaceExtension(file.name, 'pdf'),
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

export default organizePdf;
