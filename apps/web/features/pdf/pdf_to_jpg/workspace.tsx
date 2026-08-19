'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ImageDown, Loader2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { PageGrid, type PageGridItem } from '@/components/pdf/page_grid';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPages } from '@/lib/pdf/pdf_pages';
import type { ImageFormat } from '@/lib/pdf/pdf_to_images';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = { mime_types: ['application/pdf'], extensions: ['pdf'], max_files: 1, max_bytes: MAX_BYTES };

const FORMATS: Array<[ImageFormat, string]> = [
  ['jpeg', 'JPG'],
  ['png', 'PNG'],
  ['webp', 'WebP'],
];

const RESOLUTIONS: Array<[number, string]> = [
  [72, 'Screen (72 DPI)'],
  [150, 'Standard (150 DPI)'],
  [300, 'High (300 DPI)'],
];

interface Result {
  artifact: ProcessorArtifact;
  count: number;
}

export function PdfToJpgWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageGridItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [format, setFormat] = useState<ImageFormat>('jpeg');
  const [dpi, setDpi] = useState(150);
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
            { id: `page-${page.index}`, pageIndex: page.index, thumbnail: page.thumbnail, rotation: 0, selected: true },
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

  function toggle(id: string) {
    setResult(null);
    setPages((current) => current.map((page) => (page.id === id ? { ...page, selected: !page.selected } : page)));
  }

  const selectedCount = pages.filter((page) => page.selected).length;
  const busy = progress !== null;
  const canRun = selectedCount > 0 && !busy;

  async function run() {
    if (!file || !canRun) return;
    const selected = pages.filter((page) => page.selected).map((page) => page.pageIndex);

    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.pdf-to-jpg');
      const output = await processor(
        { files: [file], options: { format, dpi, pages: selected } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact, count: Number(output.text ?? 0) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be completed.');
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
          {pageCount > 0 ? `${pageCount} pages` : 'Reading…'}
          {selectedCount > 0 && (
            <>
              {' · '}
              <span className="text-foreground font-semibold">{selectedCount}</span> selected
            </>
          )}
        </p>
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <PageGrid items={pages} selectable zoomable onToggle={toggle} onZoom={setZoomPage} busy={busy} />
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          Every page is selected by default. Tap a page to leave it out. One page downloads as an
          image; more than one downloads as a ZIP.
        </p>

        <label className="text-sm">
          <span className="font-semibold">Format</span>
          <select
            name="format"
            value={format}
            onChange={(event) => setFormat(event.target.value as ImageFormat)}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            {FORMATS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Resolution</span>
          <select
            name="resolution"
            value={dpi}
            onChange={(event) => setDpi(Number(event.target.value))}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            {RESOLUTIONS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>

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
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImageDown aria-hidden className="size-4" />}
          {busy ? `Rendering ${percent}%` : 'Convert to images'}
        </Button>

        {result && (
          <section aria-label="Rendered images" className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.count} page{result.count === 1 ? '' : 's'} · {formatBytes(result.artifact.blob.size)}
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

      {zoomPage !== null && <PageDetailModal file={file} pageIndex={zoomPage} onClose={() => setZoomPage(null)} />}
    </div>
  );
}
