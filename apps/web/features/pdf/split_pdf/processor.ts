import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { zipFiles } from '@/lib/browser/zip';
import type { SplitMode, SplitResponse } from '@/workers/split_pdf.worker';

export interface SplitPdfOptions {
  mode?: SplitMode;
  ranges?: string;
  every_n?: number;
}

/** Page splitting is CPU-bound, so pdf-lib runs in a worker while the UI stays responsive. */
const splitPdf: ToolProcessor<SplitPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to split.');

  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Split cancelled.');

  const worker = new Worker(new URL('@/workers/split_pdf.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    const parts = await new Promise<Array<{ name: string; bytes: ArrayBuffer }>>(
      (resolve, reject) => {
        const abort = () => {
          worker.terminate();
          reject(new ProcessorError('aborted', 'Split cancelled.'));
        };
        context.signal.addEventListener('abort', abort, { once: true });

        worker.onerror = () =>
          reject(new ProcessorError('worker_failed', 'The split worker could not start.'));

        worker.onmessage = (event: MessageEvent<SplitResponse>) => {
          const message = event.data;
          if (message.type === 'progress') {
            context.on_progress?.({
              ratio: message.ratio,
              label: `Writing ${message.done} of ${message.total}`,
            });
            return;
          }
          if (message.type === 'error') {
            reject(new ProcessorError('split_failed', message.message));
            return;
          }
          resolve(message.parts);
        };

        worker.postMessage(
          {
            source,
            mode: input.options.mode ?? 'ranges',
            ranges: input.options.ranges,
            every_n: input.options.every_n,
          },
          [source],
        );
      },
    );

    const stem = replaceExtension(file.name, '').replace(/\.$/, '');

    if (parts.length === 1) {
      const part = parts[0];
      if (!part) throw new ProcessorError('split_failed', 'Nothing to split.');
      return {
        artifacts: [
          {
            file_name: `${stem}-${part.name}`,
            mime_type: 'application/pdf',
            blob: new Blob([part.bytes], { type: 'application/pdf' }),
          },
        ],
        text: String(parts.length),
      };
    }

    context.on_progress?.({ ratio: 1, label: 'Packing the archive' });
    const zip = await zipFiles(
      parts.map((part) => ({ file_name: `${stem}-${part.name}`, bytes: new Uint8Array(part.bytes) })),
    );

    return {
      artifacts: [
        {
          file_name: `${stem}-split.zip`,
          mime_type: 'application/zip',
          blob: zip,
        },
      ],
      text: String(parts.length),
    };
  } finally {
    worker.terminate();
  }
};

export default splitPdf;
