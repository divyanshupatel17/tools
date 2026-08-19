'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, EyeOff, Loader2, Maximize2, TriangleAlert, X } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import type { RedactionBox } from '@/lib/pdf/redact_pdf';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};
const PREVIEW_WIDTH = 420;
const MIN_BOX = 0.01;

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

export function RedactPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [boxesByPage, setBoxesByPage] = useState<Record<number, RedactionBox[]>>({});
  const [draftBox, setDraftBox] = useState<RedactionBox | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  async function loadPage(sourceFile: File, index: number) {
    setPreviewSrc(null);
    setPageSize(null);
    try {
      const [size, image] = await Promise.all([
        getPdfPageSize(sourceFile, index),
        renderPdfPage(sourceFile, index, PREVIEW_WIDTH),
      ]);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = image;
      setPageSize(size);
      setPreviewSrc(image);
    } catch {
      setNotice('That page could not be rendered.');
    }
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setResultFile(null);
    setNotice(null);
    setBoxesByPage({});
    setPageIndex(0);

    try {
      const preview = await readPdfPreview(next);
      if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
      setPageCount(preview.pages);
      await loadPage(next, 0);
    } catch {
      setNotice('That file could not be read as a PDF.');
    }
  }

  function fractionAt(clientX: number, clientY: number): { x: number; y: number } {
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  }

  function onOverlayPointerDown(event: React.PointerEvent) {
    if (!previewSrc) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    const point = fractionAt(event.clientX, event.clientY);
    dragStart.current = point;
    setDraftBox({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    const start = dragStart.current;
    if (!start) return;
    const point = fractionAt(event.clientX, event.clientY);
    setDraftBox({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  }

  function onOverlayPointerUp() {
    dragStart.current = null;
    setDraftBox((current) => {
      if (current && current.width > MIN_BOX && current.height > MIN_BOX) {
        setBoxesByPage((pages) => ({
          ...pages,
          [pageIndex]: [...(pages[pageIndex] ?? []), current],
        }));
        setResult(null);
        setResultFile(null);
      }
      return null;
    });
  }

  function removeBox(index: number) {
    setBoxesByPage((pages) => ({
      ...pages,
      [pageIndex]: (pages[pageIndex] ?? []).filter((_, i) => i !== index),
    }));
    setResult(null);
    setResultFile(null);
  }

  const pageBoxes = boxesByPage[pageIndex] ?? [];
  const totalBoxes = Object.values(boxesByPage).reduce((sum, boxes) => sum + boxes.length, 0);
  const busy = progress !== null;
  const canRun = file !== null && totalBoxes > 0 && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.redact-pdf');
      const output = await processor(
        { files: [file], options: { redactions: boxesByPage } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, pages: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The document could not be redacted.');
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
      <div className="border-border bg-surface flex flex-col items-center rounded-2xl border p-4">
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          page {pageIndex + 1} of {pageCount ?? '·'}
        </p>

        <div
          ref={overlayRef}
          onPointerDown={onOverlayPointerDown}
          onPointerMove={onOverlayPointerMove}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={onOverlayPointerUp}
          className="border-border bg-cream relative touch-none overflow-hidden rounded-xl border shadow-sm select-none"
          style={{
            width: PREVIEW_WIDTH,
            aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : '3 / 4',
            cursor: 'crosshair',
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt={`Page ${pageIndex + 1} preview`}
              className="pointer-events-none size-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            </div>
          )}

          {pageBoxes.map((box, index) => (
            <button
              key={index}
              type="button"
              onClick={() => removeBox(index)}
              aria-label={`Remove redaction box ${index + 1}`}
              className="group absolute flex items-center justify-center bg-black/85"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
            >
              <X
                aria-hidden
                className="size-3.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          ))}

          {draftBox && (
            <div
              className="pointer-events-none absolute bg-black/60"
              style={{
                left: `${draftBox.x * 100}%`,
                top: `${draftBox.y * 100}%`,
                width: `${draftBox.width * 100}%`,
                height: `${draftBox.height * 100}%`,
              }}
            />
          )}
        </div>
        <p className="text-muted mt-2 text-center text-xs">
          Drag to black out an area · click a box to remove it
        </p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          The content under each box is removed from the file, not just covered. Those pages are
          no longer searchable or selectable; pages with no box are unchanged.
        </p>

        <label className="text-sm">
          <span className="font-semibold">Page</span>
          <NumberField
            value={pageIndex + 1}
            onChange={(value) => {
              const index = Math.min(Math.max(value - 1, 0), (pageCount ?? 1) - 1);
              setPageIndex(index);
              if (file) void loadPage(file, index);
            }}
            min={1}
            max={pageCount ?? 1}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <p className="text-muted text-xs">
          {totalBoxes === 0
            ? 'No redaction boxes yet.'
            : `${totalBoxes} box${totalBoxes === 1 ? '' : 'es'} across the document.`}
        </p>

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
            <EyeOff aria-hidden className="size-4" />
          )}
          {busy ? `Redacting ${percent}%` : 'Redact PDF'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Redacted document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} page{result.pages === 1 ? '' : 's'} flattened ·{' '}
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
            setFile(null);
            setPreviewSrc(null);
            setBoxesByPage({});
            setResult(null);
            setResultFile(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {viewingResult && resultFile && (
        <PageDetailModal
          file={resultFile}
          pageIndex={pageIndex}
          onClose={() => setViewingResult(false)}
        />
      )}
    </div>
  );
}
