'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from './pdfjs';

export interface PdfPageThumbnail {
  index: number;
  /** Object URL; the caller owns it and must revoke it. */
  thumbnail: string | null;
}

const THUMBNAIL_WIDTH = 180;

/**
 * One malformed page (a bad content stream, an unsupported filter) must not take the rest
 * of the document down with it — every caller renders pages in a loop and expects a `null`
 * back for the pages that fail, not an exception that aborts everything after it.
 */
async function renderPageToUrl(
  document_: PDFDocumentProxy,
  index: number,
  width: number,
): Promise<string | null> {
  try {
    const page = await document_.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    if (!Number.isFinite(base.width) || base.width <= 0) return null;
    const viewport = page.getViewport({ scale: width / base.width });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

/**
 * Renders one page at a higher resolution than the grid thumbnail, for a "view in detail"
 * popup. The caller owns the returned object URL and must revoke it.
 */
export async function renderPdfPage(
  file: File,
  pageIndex: number,
  width = 900,
  signal?: AbortSignal,
): Promise<string> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const url = await renderPageToUrl(document_, pageIndex, width);
    if (!url) throw new Error('The page could not be rendered.');
    return url;
  } finally {
    await task.destroy();
  }
}

/** Page size in PDF points (1/72"), used to lay an overlay out proportionally over a preview image. */
export async function getPdfPageSize(
  file: File,
  pageIndex: number,
  signal?: AbortSignal,
): Promise<{ width: number; height: number }> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;
  try {
    const page = await document_.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  } finally {
    await task.destroy();
  }
}

/**
 * Renders a thumbnail for every page, one at a time, calling `onPage` as each is ready
 * so a large document can start showing its grid before the last page is rendered.
 */
export async function readPdfPages(
  file: File,
  onPage: (page: PdfPageThumbnail) => void,
  signal?: AbortSignal,
): Promise<number> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    for (let index = 0; index < document_.numPages; index += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      onPage({ index, thumbnail: await renderPageToUrl(document_, index, THUMBNAIL_WIDTH) });
    }
    return document_.numPages;
  } finally {
    await task.destroy();
  }
}

/**
 * Renders every page of a document for a scrollable full viewer, one document load shared
 * across all pages. `startIndex` renders first so the page the user clicked appears
 * immediately; the rest fill in afterwards in reading order. `onTotal` fires as soon as the
 * page count is known, before any page has rendered, so the caller can lay out placeholders.
 */
export async function readPdfPagesFrom(
  file: File,
  startIndex: number,
  onPage: (page: PdfPageThumbnail) => void,
  signal?: AbortSignal,
  width = 760,
  onTotal?: (total: number) => void,
): Promise<number> {
  const library = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const total = document_.numPages;
    onTotal?.(total);

    const start = Math.min(Math.max(startIndex, 0), Math.max(total - 1, 0));
    const rest = Array.from({ length: total }, (_, index) => index).filter(
      (index) => index !== start,
    );
    const order = total > 0 ? [start, ...rest] : [];

    for (const index of order) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      onPage({ index, thumbnail: await renderPageToUrl(document_, index, width) });
    }
    return total;
  } finally {
    await task.destroy();
  }
}
