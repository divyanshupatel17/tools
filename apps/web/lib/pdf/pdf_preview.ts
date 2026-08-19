'use client';

import { loadPdfjs } from './pdfjs';

export interface PdfPreview {
  pages: number;
  /** Object URL for a first-page thumbnail; the caller owns it and must revoke it. */
  thumbnail: string | null;
}

const THUMBNAIL_WIDTH = 220;

/** Reads page count and renders page one. Never mutates or uploads the file. */
export async function readPdfPreview(file: File, signal?: AbortSignal): Promise<PdfPreview> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Destroying the loading task is what releases the document and its worker port.
  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const page = await document_.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMBNAIL_WIDTH / base.width });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return { pages: document_.numPages, thumbnail: null };

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.8),
    );

    return {
      pages: document_.numPages,
      thumbnail: blob ? URL.createObjectURL(blob) : null,
    };
  } finally {
    await task.destroy();
  }
}
