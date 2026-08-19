'use client';

import { useEffect, useRef, useState } from 'react';
import { Crop, Download, Loader2, Maximize2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};
const PREVIEW_WIDTH = 420;

/** Insets as fractions of the page, 0-1. */
interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const DEFAULT_INSETS: Insets = { left: 0.06, right: 0.06, top: 0.06, bottom: 0.06 };

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

type Corner = 'tl' | 'tr' | 'br' | 'bl';

export function CropPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [insets, setInsets] = useState<Insets>(DEFAULT_INSETS);
  const [pagesInput, setPagesInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragCorner = useRef<Corner | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setResultFile(null);
    setNotice(null);
    setPreviewSrc(null);
    setPageSize(null);
    setInsets(DEFAULT_INSETS);

    try {
      const [preview, size, image] = await Promise.all([
        readPdfPreview(next),
        getPdfPageSize(next, 0),
        renderPdfPage(next, 0, PREVIEW_WIDTH),
      ]);
      if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
      setPageCount(preview.pages);
      setPageSize(size);
      previewUrl.current = image;
      setPreviewSrc(image);
    } catch {
      setNotice('That file could not be read as a PDF.');
    }
  }

  function pointerToFraction(clientX: number, clientY: number): { x: number; y: number } {
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  }

  function onCornerPointerDown(event: React.PointerEvent, corner: Corner) {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragCorner.current = corner;
    setResult(null);
    setResultFile(null);
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    const corner = dragCorner.current;
    if (!corner) return;
    const point = pointerToFraction(event.clientX, event.clientY);

    setInsets((current) => {
      const next = { ...current };
      const MIN_GAP = 0.04;
      if (corner === 'tl' || corner === 'bl')
        next.left = Math.min(point.x, 1 - current.right - MIN_GAP);
      if (corner === 'tr' || corner === 'br')
        next.right = Math.min(1 - point.x, 1 - current.left - MIN_GAP);
      if (corner === 'tl' || corner === 'tr')
        next.top = Math.min(point.y, 1 - current.bottom - MIN_GAP);
      if (corner === 'bl' || corner === 'br')
        next.bottom = Math.min(1 - point.y, 1 - current.top - MIN_GAP);
      return next;
    });
  }

  function onOverlayPointerUp() {
    dragCorner.current = null;
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.crop-pdf');
      const output = await processor(
        {
          files: [file],
          options: {
            inset_left: insets.left,
            inset_right: insets.right,
            inset_top: insets.top,
            inset_bottom: insets.bottom,
            pages: pagesInput,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, pages: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The document could not be cropped.');
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

  const cropLeft = insets.left * 100;
  const cropTop = insets.top * 100;
  const cropRight = 100 - insets.right * 100;
  const cropBottom = 100 - insets.bottom * 100;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface flex flex-col items-center rounded-2xl border p-4">
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount ?? '·'} pages · {formatBytes(file.size)}
        </p>

        <div
          ref={overlayRef}
          onPointerMove={onOverlayPointerMove}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={onOverlayPointerUp}
          className="border-border bg-cream relative touch-none overflow-hidden rounded-xl border shadow-sm select-none"
          style={{
            width: PREVIEW_WIDTH,
            aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : '3 / 4',
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt="Page 1 preview"
              className="pointer-events-none size-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            </div>
          )}

          {previewSrc && (
            <button
              type="button"
              onClick={() => setViewingSource(true)}
              aria-label={`View ${safeFileName(file.name)}`}
              title="View the full document"
              className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
            >
              <Maximize2 aria-hidden className="size-3.5" />
            </button>
          )}

          {previewSrc && (
            <>
              {/* Dim everything outside the crop rectangle. */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 bg-black/45"
                style={{ height: `${cropTop}%` }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45"
                style={{ height: `${100 - cropBottom}%` }}
              />
              <div
                className="pointer-events-none absolute left-0 bg-black/45"
                style={{
                  top: `${cropTop}%`,
                  bottom: `${100 - cropBottom}%`,
                  width: `${cropLeft}%`,
                }}
              />
              <div
                className="pointer-events-none absolute right-0 bg-black/45"
                style={{
                  top: `${cropTop}%`,
                  bottom: `${100 - cropBottom}%`,
                  width: `${100 - cropRight}%`,
                }}
              />
              <div
                className="border-brand pointer-events-none absolute border-2"
                style={{
                  left: `${cropLeft}%`,
                  top: `${cropTop}%`,
                  right: `${100 - cropRight}%`,
                  bottom: `${100 - cropBottom}%`,
                }}
              />

              {(
                [
                  ['tl', cropLeft, cropTop],
                  ['tr', cropRight, cropTop],
                  ['br', cropRight, cropBottom],
                  ['bl', cropLeft, cropBottom],
                ] as const
              ).map(([corner, leftPercent, topPercent]) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Drag ${corner} crop corner`}
                  onPointerDown={(event) => onCornerPointerDown(event, corner)}
                  className="border-brand-strong bg-brand absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow-sm active:cursor-grabbing"
                  style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
                />
              ))}
            </>
          )}
        </div>
        <p className="text-muted mt-2 text-center text-xs">
          Drag a corner to set the crop area · click the corner icon to view the full document
        </p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          The hidden area is not deleted. You can always undo this by opening the original file
          again.
        </p>

        <label className="text-sm">
          <span className="font-semibold">Pages</span>
          <input
            value={pagesInput}
            onChange={(event) => setPagesInput(event.target.value)}
            disabled={busy}
            placeholder="All pages (e.g. 1 to 3, 5)"
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <Button
          size="sm"
          variant="secondary"
          onClick={() => setInsets(DEFAULT_INSETS)}
          disabled={busy}
        >
          Reset crop
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

        <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Crop aria-hidden className="size-4" />
          )}
          {busy ? `Cropping ${percent}%` : 'Crop PDF'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Cropped document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} page{result.pages === 1 ? '' : 's'} cropped ·{' '}
                {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setViewingResult(true)}>
                <Maximize2 aria-hidden className="size-4" />
                View
              </Button>
              <Button
                className="flex-1"
                onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
              >
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            </div>
          </section>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = null;
            setFile(null);
            setPreviewSrc(null);
            setResult(null);
            setResultFile(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {viewingSource && (
        <PageDetailModal file={file} pageIndex={0} onClose={() => setViewingSource(false)} />
      )}
      {viewingResult && resultFile && (
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewingResult(false)} />
      )}
    </div>
  );
}
