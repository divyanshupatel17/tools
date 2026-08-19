'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Maximize2, PenLine, TriangleAlert, Upload } from 'lucide-react';
import { safeFileName, validateFile, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { canvasToPngBlob, renderTypedSignature, trimToContent } from '@/lib/pdf/signature_capture';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};
const IMAGE_RULE: FileRule = {
  mime_types: ['image/png', 'image/jpeg'],
  extensions: ['png', 'jpg', 'jpeg'],
  max_files: 1,
  max_bytes: 10 * 1024 * 1024,
};
const PREVIEW_WIDTH = 420;

type Method = 'draw' | 'type' | 'upload';

interface Result {
  artifact: ProcessorArtifact;
  pageIndex: number;
}

export function SignPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const [method, setMethod] = useState<Method>('draw');
  const [typedText, setTypedText] = useState('Your name');
  const [hasDrawing, setHasDrawing] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);

  const [position, setPosition] = useState({ x: 0.7, y: 0.15 });
  const [sizePercent, setSizePercent] = useState(30);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const signaturePreviewUrl = useRef<string | null>(null);
  const padRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      if (signaturePreviewUrl.current) URL.revokeObjectURL(signaturePreviewUrl.current);
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

    try {
      const preview = await readPdfPreview(next);
      if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
      setPageCount(preview.pages);
      const lastPage = Math.max(0, preview.pages - 1);
      setPageIndex(lastPage);
      await loadPage(next, lastPage);
    } catch {
      setNotice('That file could not be read as a PDF.');
    }
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = padRef.current;
    if (!canvas) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = canvas.getContext('2d')!;
    const box = canvas.getBoundingClientRect();
    context.beginPath();
    context.moveTo(
      ((event.clientX - box.left) / box.width) * canvas.width,
      ((event.clientY - box.top) / box.height) * canvas.height,
    );
  }

  function continueDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = padRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d')!;
    const box = canvas.getBoundingClientRect();
    context.lineTo(
      ((event.clientX - box.left) / box.width) * canvas.width,
      ((event.clientY - box.top) / box.height) * canvas.height,
    );
    context.strokeStyle = '#1a1a1a';
    context.lineWidth = 3;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();
    setHasDrawing(true);
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearPad() {
    const canvas = padRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  async function useDrawnSignature() {
    const canvas = padRef.current;
    if (!canvas) return;
    const trimmed = trimToContent(canvas);
    if (!trimmed) {
      setNotice('Draw a signature first.');
      return;
    }
    await applySignatureCanvas(trimmed);
  }

  async function useTypedSignature() {
    if (!typedText.trim()) {
      setNotice('Type a name first.');
      return;
    }
    const canvas = renderTypedSignature(typedText.trim());
    await applySignatureCanvas(canvas);
  }

  async function applySignatureCanvas(canvas: HTMLCanvasElement) {
    const blob = await canvasToPngBlob(canvas);
    const signature = new File([blob], 'signature.png', { type: 'image/png' });
    if (signaturePreviewUrl.current) URL.revokeObjectURL(signaturePreviewUrl.current);
    const url = URL.createObjectURL(signature);
    signaturePreviewUrl.current = url;
    setSignatureFile(signature);
    setSignaturePreview(url);
    setResult(null);
    setResultFile(null);
    setNotice(null);
  }

  function addUploadedSignature(files: File[]) {
    const next = files[0];
    if (!next) return;
    const check = validateFile(next, IMAGE_RULE);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That image could not be used.');
      return;
    }
    if (signaturePreviewUrl.current) URL.revokeObjectURL(signaturePreviewUrl.current);
    const url = URL.createObjectURL(next);
    signaturePreviewUrl.current = url;
    setSignatureFile(next);
    setSignaturePreview(url);
    setResult(null);
    setResultFile(null);
    setNotice(null);
  }

  function onOverlayPointerDown(event: React.PointerEvent) {
    if (!signaturePreview) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragging.current = true;
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPosition({
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height)),
    });
  }

  function onOverlayPointerUp() {
    dragging.current = false;
  }

  const busy = progress !== null;
  const canRun = file !== null && signatureFile !== null && !busy;

  async function run() {
    if (!file || !signatureFile || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.sign-pdf');
      const output = await processor(
        {
          files: [file, signatureFile],
          options: {
            page_index: pageIndex,
            x: position.x,
            y: position.y,
            scale: sizePercent / 100,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, pageIndex: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The document could not be signed.');
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

  const signatureWidthPx = pageSize
    ? pageSize.width * (sizePercent / 100) * (PREVIEW_WIDTH / pageSize.width)
    : 0;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border-border bg-surface flex flex-col items-center rounded-2xl border p-4">
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount ?? '·'} pages
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
              alt={`Page ${pageIndex + 1} preview`}
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
              aria-label="View the full document"
              className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
            >
              <Maximize2 aria-hidden className="size-3.5" />
            </button>
          )}
          {previewSrc && signaturePreview && (
            <div
              onPointerDown={onOverlayPointerDown}
              className="absolute cursor-grab touch-none active:cursor-grabbing"
              style={{
                left: `${position.x * 100}%`,
                top: `${(1 - position.y) * 100}%`,
                width: signatureWidthPx,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signaturePreview}
                alt="Signature"
                className="pointer-events-none w-full"
                draggable={false}
              />
            </div>
          )}
        </div>
        <p className="text-muted mt-2 text-center text-xs">Drag the signature to place it</p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
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

        <div className="flex gap-2">
          {(['draw', 'type', 'upload'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMethod(value)}
              disabled={busy}
              className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                method === value
                  ? 'bg-brand border-brand text-on-brand'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {method === 'draw' && (
          <div className="flex flex-col gap-2">
            <canvas
              ref={padRef}
              width={500}
              height={160}
              onPointerDown={startDraw}
              onPointerMove={continueDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              className="border-border bg-surface h-32 w-full touch-none rounded-xl border"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={clearPad}
                disabled={busy || !hasDrawing}
              >
                Clear
              </Button>
              <Button size="sm" onClick={useDrawnSignature} disabled={busy || !hasDrawing}>
                Use this signature
              </Button>
            </div>
          </div>
        )}

        {method === 'type' && (
          <div className="flex flex-col gap-2">
            <input
              value={typedText}
              onChange={(event) => setTypedText(event.target.value)}
              disabled={busy}
              className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
            />
            <p
              className="text-2xl italic"
              style={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive' }}
            >
              {typedText || 'Your name'}
            </p>
            <Button size="sm" onClick={useTypedSignature} disabled={busy}>
              <PenLine aria-hidden className="size-4" />
              Use this signature
            </Button>
          </div>
        )}

        {method === 'upload' && (
          <FileUpload
            rule={IMAGE_RULE}
            accept="image/png,image/jpeg"
            onFiles={addUploadedSignature}
          />
        )}

        {signatureFile && (
          <label className="text-sm">
            <span className="font-semibold">Size ({sizePercent}% of page width)</span>
            <input
              type="range"
              min={8}
              max={70}
              value={sizePercent}
              onChange={(event) => setSizePercent(Number(event.target.value))}
              disabled={busy}
              className="accent-brand mt-1.5 w-full"
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
            <Upload aria-hidden className="size-4" />
          )}
          {busy ? `Signing ${percent}%` : 'Sign PDF'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Signed document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                Signed on page {result.pageIndex + 1}
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
            if (signaturePreviewUrl.current) URL.revokeObjectURL(signaturePreviewUrl.current);
            setFile(null);
            setPreviewSrc(null);
            setSignatureFile(null);
            setSignaturePreview(null);
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
        <PageDetailModal
          file={file}
          pageIndex={pageIndex}
          onClose={() => setViewingSource(false)}
        />
      )}
      {viewingResult && resultFile && (
        <PageDetailModal
          file={resultFile}
          pageIndex={result?.pageIndex ?? 0}
          onClose={() => setViewingResult(false)}
        />
      )}
    </div>
  );
}
