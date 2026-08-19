'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Scissors, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { PageGrid, type PageGridItem } from '@/components/pdf/page_grid';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPages } from '@/lib/pdf/pdf_pages';
import { parsePageRanges } from '@/lib/pdf/page_ranges';
import { loadProcessor } from '@/lib/processing/processor_registry';
import type { SplitMode } from '@/workers/split_pdf.worker';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = { mime_types: ['application/pdf'], extensions: ['pdf'], max_files: 1, max_bytes: MAX_BYTES };

interface Result {
  artifact: ProcessorArtifact;
  parts: number;
}

export function SplitPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageGridItem[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [mode, setMode] = useState<SplitMode>('ranges');
  const [ranges, setRanges] = useState('');
  const [everyN, setEveryN] = useState(2);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const abort = useRef<AbortController | null>(null);
  const thumbnails = useRef(new Set<string>());

  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of thumbnails.current) URL.revokeObjectURL(url);
      thumbnails.current.clear();
    },
    [],
  );

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setNotice(null);
    setPages([]);
    setPageCount(null);

    const controller = new AbortController();
    abort.current = controller;
    try {
      const total = await readPdfPages(
        next,
        (page) => {
          if (page.thumbnail) thumbnails.current.add(page.thumbnail);
          setPages((current) => [
            ...current,
            { id: `page-${page.index}`, pageIndex: page.index, thumbnail: page.thumbnail, rotation: 0, selected: false },
          ]);
        },
        controller.signal,
      );
      setPageCount(total);
    } catch {
      setNotice('That file could not be read as a PDF.');
    } finally {
      abort.current = null;
    }
  }

  // Highlights, in the preview, which pages the current settings will cut on — a visual
  // "here's where the split lands" rather than making the user guess from the numbers alone.
  const highlighted = useMemo(() => {
    if (mode === 'ranges') return parsePageRanges(ranges, pageCount ?? 0);
    if (mode === 'each') return new Set(pages.map((page) => page.pageIndex));
    if (mode === 'every_n' && everyN > 0) {
      const set = new Set<number>();
      for (let index = 0; index < (pageCount ?? 0); index += everyN) set.add(index);
      return set;
    }
    return new Set<number>();
  }, [mode, ranges, everyN, pageCount, pages]);

  const previewItems = useMemo(
    () => pages.map((page) => ({ ...page, selected: highlighted.has(page.pageIndex) })),
    [pages, highlighted],
  );

  const busy = progress !== null;
  const canSplit =
    file !== null &&
    !busy &&
    (mode !== 'ranges' || ranges.trim().length > 0) &&
    (mode !== 'every_n' || everyN >= 1);

  async function split() {
    if (!file || !canSplit) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.split-pdf');
      const output = await processor(
        { files: [file], options: { mode, ranges, every_n: everyN } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact, parts: Number(output.text ?? 0) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The split failed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept="application/pdf,.pdf" onFiles={addFile} />
        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <p className="text-muted mb-3 text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount !== null ? `${pageCount} pages` : 'Reading…'} · {formatBytes(file.size)}
        </p>
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <PageGrid items={previewItems} zoomable onZoom={setZoomPage} busy={busy} />
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Split by</legend>
          {(
            [
              ['ranges', 'Custom ranges'],
              ['every_n', 'Every N pages'],
              ['each', 'One file per page'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="split-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
                disabled={busy}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {mode === 'ranges' && (
          <label className="text-sm">
            <span className="font-semibold">Pages or ranges</span>
            <input
              name="ranges"
              value={ranges}
              onChange={(event) => setRanges(event.target.value)}
              disabled={busy}
              placeholder="e.g. 1 to 4, 2 to 7, 8, 6"
              className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
            />
            <span className="text-muted mt-1 block text-xs">
              Each range becomes its own file. Ranges can overlap, so the same page can land in
              more than one output{pageCount ? ` · document has ${pageCount} pages` : ''}.
            </span>
          </label>
        )}

        {mode === 'every_n' && (
          <label className="text-sm">
            <span className="font-semibold">Pages per file</span>
            <NumberField
              value={everyN}
              onChange={setEveryN}
              min={1}
              max={pageCount ?? undefined}
              disabled={busy}
              className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
            />
          </label>
        )}

        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-xs">
            <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
            {notice}
          </p>
        )}

        {busy && (
          <div>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Split progress"
              className="bg-cream h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-brand h-full rounded-full transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-muted mt-1.5 text-xs">
              {progress?.label ?? 'Working'} · {percent}%
            </p>
          </div>
        )}

        <Button onClick={split} disabled={!canSplit} className="h-12 w-full text-base">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Scissors aria-hidden className="size-4" />}
          {busy ? `Splitting ${percent}%` : 'Split PDF'}
        </Button>

        {result && (
          <section
            aria-label="Split result"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.parts} file{result.parts === 1 ? '' : 's'} · {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <Button className="w-full" onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </section>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            for (const url of thumbnails.current) URL.revokeObjectURL(url);
            thumbnails.current.clear();
            setFile(null);
            setPages([]);
            setResult(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {zoomPage !== null && file && <PageDetailModal file={file} pageIndex={zoomPage} onClose={() => setZoomPage(null)} />}
    </div>
  );
}
