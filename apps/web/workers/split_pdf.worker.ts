/// <reference lib="webworker" />
import { PDFDocument } from 'pdf-lib';

export type SplitMode = 'ranges' | 'every_n' | 'each';

export interface SplitRequest {
  source: ArrayBuffer;
  mode: SplitMode;
  /** Comma-separated ranges, e.g. "1-3,5,7-9", 1-based and inclusive. Used when mode is "ranges". */
  ranges?: string;
  /** Pages per output file. Used when mode is "every_n". */
  every_n?: number;
}

export interface SplitPart {
  name: string;
  bytes: ArrayBuffer;
}

export type SplitResponse =
  | { type: 'progress'; ratio: number; done: number; total: number }
  | { type: 'done'; parts: SplitPart[] }
  | { type: 'error'; message: string };

const post = (message: SplitResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);

/** Parses "1-3,5,7-9" into 0-based inclusive [start, end] pairs, clamped to the page count. */
function parseRanges(input: string, pageCount: number): Array<[number, number]> {
  const parts: Array<[number, number]> = [];
  for (const raw of input.split(',')) {
    const chunk = raw.trim();
    if (chunk.length === 0) continue;

    const match = /^(\d+)(?:-(\d+))?$/.exec(chunk);
    if (!match) throw new Error(`"${chunk}" is not a valid page or range.`);

    const start = Number(match[1]) - 1;
    const end = match[2] !== undefined ? Number(match[2]) - 1 : start;
    if (start < 0 || end < start || end >= pageCount) {
      throw new Error(`"${chunk}" is outside the document's ${pageCount} pages.`);
    }
    parts.push([start, end]);
  }
  if (parts.length === 0) throw new Error('Enter at least one page or range.');
  return parts;
}

function chunkRanges(pageCount: number, size: number): Array<[number, number]> {
  if (size < 1) throw new Error('Pages per file must be at least 1.');
  const parts: Array<[number, number]> = [];
  for (let start = 0; start < pageCount; start += size) {
    parts.push([start, Math.min(start + size, pageCount) - 1]);
  }
  return parts;
}

self.onmessage = async (event: MessageEvent<SplitRequest>) => {
  const { source, mode, ranges, every_n } = event.data;

  try {
    const document_ = await PDFDocument.load(source, { ignoreEncryption: true });
    const pageCount = document_.getPageCount();

    const groups: Array<[number, number]> =
      mode === 'ranges'
        ? parseRanges(ranges ?? '', pageCount)
        : mode === 'every_n'
          ? chunkRanges(pageCount, every_n ?? 1)
          : Array.from({ length: pageCount }, (_, index) => [index, index]);

    const digits = String(groups.length).length;
    const parts: SplitPart[] = [];

    for (const [groupIndex, [start, end]] of groups.entries()) {
      const output = await PDFDocument.create();
      const indices = Array.from({ length: end - start + 1 }, (_, index) => start + index);
      const pages = await output.copyPages(document_, indices);
      for (const page of pages) output.addPage(page);

      const bytes = await output.save({ useObjectStreams: true });
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;

      const label =
        start === end
          ? `page-${String(start + 1).padStart(digits, '0')}`
          : `pages-${String(start + 1).padStart(digits, '0')}-${String(end + 1).padStart(digits, '0')}`;
      parts.push({ name: `${label}.pdf`, bytes: buffer });

      post({
        type: 'progress',
        ratio: (groupIndex + 1) / groups.length,
        done: groupIndex + 1,
        total: groups.length,
      });
    }

    post(
      { type: 'done', parts },
      parts.map((part) => part.bytes),
    );
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'The document could not be split.',
    });
  }
};
