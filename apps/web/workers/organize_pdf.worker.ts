/// <reference lib="webworker" />
import { PDFDocument, degrees } from 'pdf-lib';

export interface OrganizeRequest {
  source: ArrayBuffer;
  /** Final page order, by 0-based original index, with an extra rotation in degrees to add. */
  order: Array<{ index: number; rotation: number }>;
}

export type OrganizeResponse =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; bytes: ArrayBuffer; pages: number }
  | { type: 'error'; message: string };

const post = (message: OrganizeResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);

self.onmessage = async (event: MessageEvent<OrganizeRequest>) => {
  const { source, order } = event.data;

  try {
    if (order.length === 0) throw new Error('The document has no pages left.');

    const original = await PDFDocument.load(source, { ignoreEncryption: true });
    const output = await PDFDocument.create();

    post({ type: 'progress', ratio: 0.1 });
    const pages = await output.copyPages(
      original,
      order.map((entry) => entry.index),
    );

    pages.forEach((page, position) => {
      output.addPage(page);
      const delta = order[position]?.rotation ?? 0;
      if (delta % 360 !== 0) page.setRotation(degrees((page.getRotation().angle + delta) % 360));
    });

    post({ type: 'progress', ratio: 0.8 });
    const bytes = await output.save({ useObjectStreams: true });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    post({ type: 'progress', ratio: 1 });
    post({ type: 'done', bytes: buffer, pages: output.getPageCount() }, [buffer]);
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'The document could not be rebuilt.',
    });
  }
};
