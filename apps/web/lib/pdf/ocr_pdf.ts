'use client';

/** Asks Tesseract for its own "sandwich PDF" output (`{ pdf: true }`) — page image plus an
 * invisible positioned text layer — rather than hand-building the text layer from word bboxes.
 * One worker is reused across pages (English only); the engine/model load from Tesseract's CDN
 * on first use, but the document itself is never sent anywhere. */
export async function ocrPagesToPdfs(
  images: readonly Uint8Array[],
  onPage?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');

  try {
    const results: Uint8Array[] = [];
    for (let i = 0; i < images.length; i += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const bytes = images[i]!;
      const { data } = await worker.recognize(
        new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
        {},
        { pdf: true },
      );
      if (!data.pdf) throw new Error(`Page ${i + 1} could not be recognised.`);
      results.push(new Uint8Array(data.pdf));

      onPage?.(i + 1, images.length);
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
