export interface PdfTextLine {
  text: string;
  /** Approximate font size in PDF points, used to tell headings from body text. */
  fontSize: number;
}

export interface PdfTextPage {
  lines: PdfTextLine[];
}

type PdfjsTextModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsText: Promise<PdfjsTextModule> | null = null;

/**
 * The legacy build works in both the browser and Node (so this file is unit-testable). In a
 * browser, pdf.js insists on a real `Worker` and throws without a configured `workerSrc`; in
 * Node there is no `Worker` global, so it falls back to running on the main thread regardless
 * of this setting, which is what makes running the same loader under Vitest safe.
 */
function loadPdfjsText(): Promise<PdfjsTextModule> {
  pdfjsText ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((library) => {
    // Only the browser has a `Worker` global to spawn; setting `workerSrc` in Node makes
    // pdf.js try (and fail) to resolve a fake-worker module through a bundler-only URL form.
    if (typeof window !== 'undefined') {
      library.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
    }
    return library;
  });
  return pdfjsText;
}

interface RawTextItem {
  str: string;
  transform: number[];
  hasEOL: boolean;
  width?: number;
}

function isTextItem(item: unknown): item is RawTextItem {
  return typeof item === 'object' && item !== null && 'str' in item;
}

export interface PdfTextItem {
  text: string;
  /** Left edge x-coordinate in PDF points, read straight off the item's transform matrix
   * (`transform[4]`) rather than reconstructed from accumulated glyph widths. */
  x: number;
  /** Baseline y-coordinate in PDF points (`transform[5]`). */
  y: number;
  width: number;
  fontSize: number;
}

export interface PdfTextPageItems {
  items: PdfTextItem[];
}

function toPdfTextItem(raw: RawTextItem): PdfTextItem {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = raw.transform;
  const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || 0;
  return { text: raw.str, x: e, y: f, width: raw.width ?? 0, fontSize: fontSize || 12 };
}

/**
 * Groups text runs into lines by y-position: pdf.js reports one item per run of same-style
 * text, not per visual line, so consecutive runs at (nearly) the same baseline are merged.
 * `hasEOL` closes a line even when nothing follows it on the page.
 */
function groupIntoLines(items: readonly unknown[]): PdfTextLine[] {
  const lines: PdfTextLine[] = [];
  let currentText = '';
  let currentFontSize = 0;
  let currentY: number | null = null;
  let open = false;

  function flush() {
    const text = currentText.trim();
    if (text !== '') lines.push({ text, fontSize: currentFontSize || 12 });
    currentText = '';
    currentFontSize = 0;
    currentY = null;
    open = false;
  }

  for (const raw of items) {
    if (!isTextItem(raw)) continue;
    const [a = 0, b = 0, c = 0, d = 0, , y = 0] = raw.transform;
    const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || 0;

    if (open && currentY !== null && Math.abs(currentY - y) > 2) flush();
    if (!open) {
      currentY = y;
      currentFontSize = fontSize;
      open = true;
    } else {
      currentFontSize = Math.max(currentFontSize, fontSize);
    }
    currentText += raw.str;

    if (raw.hasEOL) flush();
  }
  flush();

  return lines;
}

/**
 * Reads every page's text in the order pdf.js exposes it, which is reading order for
 * ordinary single-column pages but can interleave columns or floated boxes on complex
 * layouts — a known limitation of extracting from the content stream rather than a real
 * layout engine.
 */
export async function extractPdfText(
  file: File,
  signal?: AbortSignal,
  onPage?: (done: number, total: number) => void,
): Promise<PdfTextPage[]> {
  const library = await loadPdfjsText();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const pages: PdfTextPage[] = [];
    for (let index = 0; index < document_.numPages; index += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const page = await document_.getPage(index + 1);
      const content = await page.getTextContent();
      pages.push({ lines: groupIntoLines(content.items) });
      onPage?.(index + 1, document_.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/**
 * Reads every page's text items with their raw PDF.js positions, ungrouped, for tools that need
 * real column geometry rather than the flattened `PdfTextLine[]` `extractPdfText` produces —
 * currently PDF to Excel's position-based column clustering
 * (`features/pdf/pdf_to_excel/processor.ts`). Shares the same pdf.js loader and page-iteration
 * shape as `extractPdfText` so both readers behave identically for worker setup, abort handling
 * and progress reporting.
 */
export async function extractPdfTextItems(
  file: File,
  signal?: AbortSignal,
  onPage?: (done: number, total: number) => void,
): Promise<PdfTextPageItems[]> {
  const library = await loadPdfjsText();
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const task = library.getDocument({ data });
  const document_ = await task.promise;

  try {
    const pages: PdfTextPageItems[] = [];
    for (let index = 0; index < document_.numPages; index += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const page = await document_.getPage(index + 1);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const raw of content.items) if (isTextItem(raw)) items.push(toPdfTextItem(raw));
      pages.push({ items });
      onPage?.(index + 1, document_.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
