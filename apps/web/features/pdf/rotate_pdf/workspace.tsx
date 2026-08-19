'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RotateCw, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { PageGrid, type PageGridItem } from '@/components/pdf/page_grid';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPages } from '@/lib/pdf/pdf_pages';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = { mime_types: ['application/pdf'], extensions: ['pdf'], max_files: 1, max_bytes: MAX_BYTES };

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

export function RotatePdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageGridItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [zoomPage, setZoomPage] = useState<number | null>(null);

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
    setPageCount(0);

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

  function rotateOne(id: string) {
    setResult(null);
    setPages((current) =>
      current.map((page) =>
        page.id === id ? { ...page, rotation: ((page.rotation + 90) % 360) as PageGridItem['rotation'] } : page,
      ),
    );
  }

  function rotateAll() {
    setResult(null);
    setPages((current) =>
      current.map((page) => ({ ...page, rotation: ((page.rotation + 90) % 360) as PageGridItem['rotation'] })),
    );
  }

  const rotatedCount = pages.filter((page) => page.rotation !== 0).length;
  const busy = progress !== null;
  const canRun = pageCount > 0 && rotatedCount > 0 && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.rotate-pdf');
      const rotations = Object.fromEntries(
        pages.filter((page) => page.rotation !== 0).map((page) => [page.pageIndex, page.rotation]),
      );
      const output = await processor(
        { files: [file], options: { rotations } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact, pages: Number(output.text ?? 0) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The rotation failed.');
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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <p className="text-muted mb-3 text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount > 0 ? `${pageCount} pages` : 'Reading…'}
        </p>
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <PageGrid items={pages} rotatable zoomable onRotate={rotateOne} onZoom={setZoomPage} busy={busy} />
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          Click a page to view it. Use the rotate icon on a page to turn it 90°, or rotate every
          page at once.
        </p>

        <Button size="sm" variant="secondary" onClick={rotateAll} disabled={busy}>
          <RotateCw aria-hidden className="size-4" />
          Rotate all pages
        </Button>

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
              aria-label="Progress"
              className="bg-cream h-2 w-full overflow-hidden rounded-full"
            >
              <div className="bg-brand h-full rounded-full transition-[width] duration-200" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-muted mt-1.5 text-xs">
              {progress?.label ?? 'Working'} · {percent}%
            </p>
          </div>
        )}

        <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RotateCw aria-hidden className="size-4" />}
          {busy ? `Rotating ${percent}%` : 'Rotate PDF'}
        </Button>

        {result && (
          <section aria-label="Rotated document" className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} pages · {formatBytes(result.artifact.blob.size)}
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

      {zoomPage !== null && file && (
        <PageDetailModal
          file={file}
          pageIndex={zoomPage}
          rotations={Object.fromEntries(pages.map((page) => [page.pageIndex, page.rotation]))}
          onClose={() => setZoomPage(null)}
        />
      )}
    </div>
  );
}
