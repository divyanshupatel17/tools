'use client';

/**
 * Lazily loads pdfjs-dist and points it at the worker bundle. Every PDF.js caller shares this
 * one cached promise so the library and its worker are only fetched once per page.
 */
let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjs ??= import('pdfjs-dist').then((library) => {
    library.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return library;
  });
  return pdfjs;
}
