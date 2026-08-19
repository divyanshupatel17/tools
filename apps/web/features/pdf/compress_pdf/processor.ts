import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import type { CompressResponse } from '@/workers/compress_pdf.worker';

/** Matches the worker's old "medium" preset, used when no explicit quality is given. */
export const DEFAULT_COMPRESS_QUALITY = 0.65;

export interface CompressPdfOptions {
  /** JPEG re-encode quality, 0 to 1. The worker derives the resize target from this. */
  quality?: number;
}

/** Recompressing every embedded photo is CPU-bound, so it runs in a worker like the other
 * whole-document rebuilds. */
const compressPdf: ToolProcessor<CompressPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to compress.');

  const quality = input.options.quality ?? DEFAULT_COMPRESS_QUALITY;
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const worker = new Worker(new URL('@/workers/compress_pdf.worker.ts', import.meta.url), {
    type: 'module',
  });

  try {
    const { bytes, imagesRecompressed, imagesTotal } = await new Promise<{
      bytes: ArrayBuffer;
      imagesRecompressed: number;
      imagesTotal: number;
    }>((resolve, reject) => {
      const abort = () => {
        worker.terminate();
        reject(new ProcessorError('aborted', 'Cancelled.'));
      };
      context.signal.addEventListener('abort', abort, { once: true });

      worker.onerror = () =>
        reject(new ProcessorError('worker_failed', 'The compression worker could not start.'));

      worker.onmessage = (event: MessageEvent<CompressResponse>) => {
        const message = event.data;
        if (message.type === 'progress') {
          context.on_progress?.({ ratio: message.ratio, label: 'Recompressing images' });
          return;
        }
        if (message.type === 'error') {
          reject(new ProcessorError('compress_failed', message.message));
          return;
        }
        resolve({
          bytes: message.bytes,
          imagesRecompressed: message.images_recompressed,
          imagesTotal: message.images_total,
        });
      };

      worker.postMessage({ source, quality }, [source]);
    });

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const savedBytes = Math.max(0, file.size - blob.size);

    return {
      artifacts: [
        {
          file_name: replaceExtension(file.name, 'pdf'),
          mime_type: 'application/pdf',
          blob,
        },
      ],
      text: JSON.stringify({
        original_bytes: file.size,
        output_bytes: blob.size,
        saved_bytes: savedBytes,
        images_recompressed: imagesRecompressed,
        images_total: imagesTotal,
      }),
    };
  } finally {
    worker.terminate();
  }
};

export default compressPdf;
