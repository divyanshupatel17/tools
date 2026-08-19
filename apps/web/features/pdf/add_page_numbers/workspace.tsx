'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Hash, Loader2, Maximize2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { PAGE_NUMBER_MARGIN_PT, pageNumberLabel, type PageNumberFormat, type PageNumberPosition } from './format';
import type { PageNumberCustomPosition } from './processor';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = { mime_types: ['application/pdf'], extensions: ['pdf'], max_files: 1, max_bytes: MAX_BYTES };
const PREVIEW_WIDTH = 420;

const POSITIONS: Array<[PageNumberPosition, string]> = [
  ['top-left', 'Top left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right'],
];

const FORMATS: Array<[PageNumberFormat, string]> = [
  ['n', '1, 2, 3…'],
  ['page-n', 'Page 1, Page 2…'],
  ['n-of-total', '1 of N, 2 of N…'],
  ['roman', 'i, ii, iii…'],
];

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

/** Converts a preset to a fractional page position, origin bottom left, so switching into drag mode starts near the preset. */
function presetToFraction(
  preset: PageNumberPosition,
  pageSize: { width: number; height: number } | null,
): PageNumberCustomPosition {
  const xMargin = pageSize ? PAGE_NUMBER_MARGIN_PT / pageSize.width : 0.08;
  const yMargin = pageSize ? PAGE_NUMBER_MARGIN_PT / pageSize.height : 0.08;
  const x = preset.endsWith('left') ? xMargin : preset.endsWith('right') ? 1 - xMargin : 0.5;
  const y = preset.startsWith('top') ? 1 - yMargin : yMargin;
  return { x, y };
}

export function AddPageNumbersWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center');
  const [placementMode, setPlacementMode] = useState<'preset' | 'custom'>('preset');
  const [customPosition, setCustomPosition] = useState<PageNumberCustomPosition | null>(null);
  const [format, setFormat] = useState<PageNumberFormat>('n');
  const [start, setStart] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [viewing, setViewing] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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
    setNotice(null);
    setPreviewSrc(null);
    setPageSize(null);

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

  function setDragPlacement(fraction: PageNumberCustomPosition) {
    setCustomPosition(fraction);
    setResult(null);
  }

  function switchToCustomPlacement() {
    setCustomPosition((current) => current ?? presetToFraction(position, pageSize));
    setPlacementMode('custom');
    setResult(null);
  }

  function onHandlePointerDown(event: React.PointerEvent) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragging.current = true;
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    setDragPlacement({ x, y });
  }

  function onOverlayPointerUp() {
    dragging.current = false;
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy && start >= 1 && fontSize >= 6;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    const resolvedPosition = placementMode === 'custom' && customPosition ? customPosition : position;

    try {
      const processor = await loadProcessor('pdf.add-page-numbers');
      const output = await processor(
        { files: [file], options: { position: resolvedPosition, format, start, font_size: fontSize } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact, pages: Number(output.text ?? 0) });
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

  const scale = pageSize ? PREVIEW_WIDTH / pageSize.width : 1;
  const marginPx = PAGE_NUMBER_MARGIN_PT * scale;
  const fontPx = fontSize * scale;
  const label = pageNumberLabel(format, start, pageCount ?? start);

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
          onPointerMove={placementMode === 'custom' ? onOverlayPointerMove : undefined}
          onPointerUp={placementMode === 'custom' ? onOverlayPointerUp : undefined}
          onPointerCancel={placementMode === 'custom' ? onOverlayPointerUp : undefined}
          className={`border-border bg-cream relative overflow-hidden rounded-xl border shadow-sm ${placementMode === 'custom' ? 'touch-none select-none' : ''}`}
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
              className={`size-full object-contain ${placementMode === 'custom' ? 'pointer-events-none' : ''}`}
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
              onClick={() => setViewing(true)}
              aria-label={`View ${safeFileName(file.name)}`}
              title="View the full document"
              className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
            >
              <Maximize2 aria-hidden className="size-3.5" />
            </button>
          )}
          {previewSrc && placementMode === 'preset' && (
            <span
              className="absolute font-medium text-black"
              style={{
                fontSize: `${fontPx}px`,
                lineHeight: 1,
                ...(position.startsWith('top') ? { top: marginPx } : { bottom: marginPx }),
                ...(position.endsWith('left')
                  ? { left: marginPx }
                  : position.endsWith('right')
                    ? { right: marginPx }
                    : { left: '50%', transform: 'translateX(-50%)' }),
              }}
            >
              {label}
            </span>
          )}
          {previewSrc && placementMode === 'custom' && customPosition && (
            <span
              onPointerDown={onHandlePointerDown}
              className="border-brand bg-surface/90 absolute cursor-grab touch-none rounded px-1.5 py-0.5 font-medium text-black active:cursor-grabbing"
              style={{
                fontSize: `${fontPx}px`,
                lineHeight: 1,
                left: `${customPosition.x * 100}%`,
                top: `${(1 - customPosition.y) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {label}
            </span>
          )}
        </div>
        <p className="text-muted mt-2 text-center text-xs">
          {placementMode === 'custom'
            ? 'Drag the number anywhere on the page'
            : 'Live preview of page 1 · click the corner icon to view the full document'}
        </p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <div className="text-sm">
          <span className="font-semibold">Position</span>
          <div className="border-border bg-background mt-1.5 flex rounded-full border p-1">
            <button
              type="button"
              onClick={() => {
                setPlacementMode('preset');
                setResult(null);
              }}
              disabled={busy}
              className={`h-9 flex-1 rounded-full text-sm transition-colors ${
                placementMode === 'preset' ? 'bg-brand text-ink' : 'text-muted'
              }`}
            >
              Preset
            </button>
            <button
              type="button"
              onClick={switchToCustomPlacement}
              disabled={busy}
              className={`h-9 flex-1 rounded-full text-sm transition-colors ${
                placementMode === 'custom' ? 'bg-brand text-ink' : 'text-muted'
              }`}
            >
              Drag to place
            </button>
          </div>
          {placementMode === 'preset' && (
            <select
              value={position}
              onChange={(event) => setPosition(event.target.value as PageNumberPosition)}
              disabled={busy}
              className="border-border bg-background mt-2 h-11 w-full rounded-full border px-4 outline-none"
            >
              {POSITIONS.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          )}
          {placementMode === 'custom' && (
            <p className="text-muted mt-2 text-xs">Drag the number on the preview to place it anywhere on the page.</p>
          )}
        </div>

        <label className="text-sm">
          <span className="font-semibold">Format</span>
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as PageNumberFormat)}
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

        <div className="flex gap-3">
          <label className="flex-1 text-sm">
            <span className="font-semibold">Start at</span>
            <NumberField
              value={start}
              onChange={setStart}
              min={1}
              disabled={busy}
              className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="font-semibold">Font size</span>
            <NumberField
              value={fontSize}
              onChange={setFontSize}
              min={6}
              max={72}
              disabled={busy}
              className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
            />
          </label>
        </div>

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
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Hash aria-hidden className="size-4" />}
          {busy ? `Numbering ${percent}%` : 'Add page numbers'}
        </Button>

        {result && (
          <section aria-label="Numbered document" className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3">
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
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = null;
            setFile(null);
            setPreviewSrc(null);
            setResult(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {viewing && <PageDetailModal file={file} pageIndex={0} onClose={() => setViewing(false)} />}
    </div>
  );
}
