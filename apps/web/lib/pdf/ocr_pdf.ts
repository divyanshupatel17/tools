'use client';

/**
 * Runs Tesseract (WASM, via tesseract.js) over each page image and asks it for its own
 * "sandwich PDF" output (`output: { pdf: true }`) — a single-page PDF with the page image plus
 * an invisible, positioned text layer Tesseract itself lays out from its word bounding boxes.
 * Building that text layer by hand (mapping every word's bbox into PDF points, choosing a font
 * size per word) would just be re-implementing what Tesseract already does correctly for this
 * exact job, so this leans on it instead of pdf-lib for the text layer. This app's processor
 * then only has to stitch the resulting one-page PDFs together with pdf-lib.
 *
 * One worker is created and reused across every page (loading the language model once), and
 * only English is loaded — recognising other languages would need their own traineddata
 * download, which is out of scope for now. The Tesseract engine, worker script and language
 * data are fetched from Tesseract's own CDN on first use (not bundled with this app); nothing
 * about the document being processed is ever sent anywhere.
 */
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
