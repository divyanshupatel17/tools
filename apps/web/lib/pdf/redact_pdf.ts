'use client';

import { loadPdfjs } from './pdfjs';

export interface RedactionBox {
  /** Fractions of the page, 0-1, top-left origin — the same space the canvas is rendered in. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renders one page to a canvas at a high-enough resolution to redact cleanly, paints solid
 * black rectangles over the given boxes directly onto that canvas, and returns the flattened
 * result as JPEG bytes. Covering an area is not enough — the underlying text and image content
 * would still be present and extractable in the output; rasterising the whole page removes it
 * from the file entirely, which is the actual bar a redaction has to clear. The trade-off is
 * that a redacted page is no longer searchable or selectable — pages without any redaction on
 * them are left as real vector pages so that cost is only paid where it is needed. */
export async function rasterizeWithRedactions(
  file: File,
  pageIndex: number,
  boxes: readonly RedactionBox[],
  scale = 2.2,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const page = await document_.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    context.fillStyle = '#000000';
    for (const box of boxes) {
      context.fillRect(
        box.x * canvas.width,
        box.y * canvas.height,
        box.width * canvas.width,
        box.height * canvas.height,
      );
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (!blob) throw new Error('The redacted page could not be rendered.');

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    await task.destroy();
  }
}
