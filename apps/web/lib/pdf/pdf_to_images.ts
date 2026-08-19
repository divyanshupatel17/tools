'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from './pdfjs';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const IMAGE_EXTENSIONS: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

export interface RenderedPageImage {
  index: number;
  bytes: Uint8Array;
}

interface RenderOptions {
  format: ImageFormat;
  scale: number;
  quality?: number;
}

async function renderPageToBlob(
  document_: PDFDocumentProxy,
  index: number,
  options: RenderOptions,
): Promise<Blob | null> {
  try {
    const page = await document_.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    if (!Number.isFinite(base.width) || base.width <= 0) return null;
    const viewport = page.getViewport({ scale: options.scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return null;

    // PNG keeps transparency; the other formats have no alpha channel, so paint white first.
    if (options.format !== 'png') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, IMAGE_MIME_TYPES[options.format], options.quality),
    );
  } catch {
    return null;
  }
}

/** Renders a chosen set of pages to raster images, one document load shared across all of them. */
export async function renderPdfPagesToImages(
  file: File,
  pageIndexes: readonly number[],
  options: RenderOptions,
  signal?: AbortSignal,
  onPage?: (done: number, total: number) => void,
): Promise<RenderedPageImage[]> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const results: RenderedPageImage[] = [];
    for (let i = 0; i < pageIndexes.length; i += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const index = pageIndexes[i]!;
      const blob = await renderPageToBlob(document_, index, options);
      if (!blob) throw new Error(`Page ${index + 1} could not be rendered.`);
      results.push({ index, bytes: new Uint8Array(await blob.arrayBuffer()) });
      onPage?.(i + 1, pageIndexes.length);
    }
    return results;
  } finally {
    await task.destroy();
  }
}
