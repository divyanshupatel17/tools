/// <reference lib="webworker" />
import { PDFDocument } from 'pdf-lib';

export interface MergeRequest {
  /** Source documents in the exact order they should appear in the output. */
  sources: ArrayBuffer[];
}

export type MergeResponse =
  | { type: 'progress'; ratio: number; done: number; total: number }
  | { type: 'done'; bytes: ArrayBuffer; pages: number }
  | { type: 'error'; message: string };

const post = (message: MergeResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);

self.onmessage = async (event: MessageEvent<MergeRequest>) => {
  const { sources } = event.data;

  try {
    const merged = await PDFDocument.create();
    const total = sources.length;

    for (const [index, source] of sources.entries()) {
      // ignoreEncryption lets us read documents that only carry an owner password.
      const document_ = await PDFDocument.load(source, { ignoreEncryption: true });
      const pages = await merged.copyPages(document_, document_.getPageIndices());
      for (const page of pages) merged.addPage(page);

      // Saving is the last ~15%, so copying tops out short of one.
      post({ type: 'progress', ratio: ((index + 1) / total) * 0.85, done: index + 1, total });
    }

    const bytes = await merged.save({ useObjectStreams: true });
    post({ type: 'progress', ratio: 1, done: total, total });

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    post({ type: 'done', bytes: buffer, pages: merged.getPageCount() }, [buffer]);
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'The documents could not be merged.',
    });
  }
};
