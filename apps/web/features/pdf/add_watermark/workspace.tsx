'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Maximize2, Stamp, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, validateFile, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { watermarkPositions } from '@/lib/pdf/watermark';
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

type Kind = 'text' | 'image';

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

export function AddWatermarkWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(60);
  const [color, setColor] = useState('#808080');
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(30);
  const [opacity, setOpacity] = useState(25);
  const [rotation, setRotation] = useState(-45);
  const [tile, setTile] = useState(true);
  const [pagesInput, setPagesInput] = useState('');

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const imagePreviewUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      if (imagePreviewUrl.current) URL.revokeObjectURL(imagePreviewUrl.current);
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

  function addWatermarkImage(files: File[]) {
    const next = files[0];
    if (!next) return;
    const check = validateFile(next, IMAGE_RULE);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That image could not be used.');
      return;
    }
    if (imagePreviewUrl.current) URL.revokeObjectURL(imagePreviewUrl.current);
    const url = URL.createObjectURL(next);
    imagePreviewUrl.current = url;
    setWatermarkImage(next);
    setImagePreview(url);
    setResult(null);
    setResultFile(null);
    setNotice(null);
  }

  const tiles = useMemo(
    () => (pageSize ? watermarkPositions(pageSize.width, pageSize.height, tile) : []),
    [pageSize, tile],
  );

  const busy = progress !== null;
  const canRun =
    file !== null && !busy && (kind === 'text' ? text.trim().length > 0 : watermarkImage !== null);

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.add-watermark');
      const output = await processor(
        {
          files: kind === 'image' && watermarkImage ? [file, watermarkImage] : [file],
          options: {
            kind,
            text,
            font_size: fontSize,
            color,
            opacity: opacity / 100,
            rotation,
            tile,
            image_scale: imageScale,
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
      setNotice(error instanceof Error ? error.message : 'The watermark could not be added.');
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

  const scalePx = pageSize ? PREVIEW_WIDTH / pageSize.width : 1;
  const previewFontPx = fontSize * scalePx;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border-border bg-surface flex flex-col items-center rounded-2xl border p-4">
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount ?? '·'} pages · {formatBytes(file.size)}
        </p>

        <div
          className="border-border bg-cream relative overflow-hidden rounded-xl border shadow-sm"
          style={{
            width: PREVIEW_WIDTH,
            aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : '3 / 4',
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt="Page 1 preview" className="size-full object-contain" />
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

          {previewSrc &&
            pageSize &&
            tiles.map((position, index) => {
              const leftPercent = (position.x / pageSize.width) * 100;
              const topPercent = (1 - position.y / pageSize.height) * 100;
              return (
                <div
                  key={index}
                  className="pointer-events-none absolute"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                    opacity: opacity / 100,
                  }}
                >
                  {kind === 'text' ? (
                    <span
                      className="font-bold whitespace-nowrap"
                      style={{ fontSize: `${previewFontPx}px`, color }}
                    >
                      {text || 'Watermark'}
                    </span>
                  ) : imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt=""
                      style={{ width: `${pageSize.width * (imageScale / 100) * scalePx}px` }}
                    />
                  ) : null}
                </div>
              );
            })}
        </div>
        <p className="text-muted mt-2 text-center text-xs">
          Live preview of page 1 · click the corner icon to view the full document
        </p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <div className="flex gap-2">
          {(['text', 'image'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setKind(value);
                setResult(null);
                setResultFile(null);
              }}
              disabled={busy}
              className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                kind === value
                  ? 'bg-brand border-brand text-on-brand'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {value === 'text' ? 'Text' : 'Image'}
            </button>
          ))}
        </div>

        {kind === 'text' ? (
          <>
            <label className="text-sm">
              <span className="font-semibold">Watermark text</span>
              <input
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setResult(null);
                  setResultFile(null);
                }}
                disabled={busy}
                className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex-1 text-sm">
                <span className="font-semibold">Font size</span>
                <NumberField
                  value={fontSize}
                  onChange={setFontSize}
                  min={8}
                  max={200}
                  disabled={busy}
                  className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold">Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  disabled={busy}
                  className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <FileUpload
              rule={IMAGE_RULE}
              accept="image/png,image/jpeg"
              onFiles={addWatermarkImage}
            />
            {watermarkImage && (
              <p className="text-muted text-xs">{safeFileName(watermarkImage.name)}</p>
            )}
            <label className="text-sm">
              <span className="font-semibold">Size ({imageScale}% of page width)</span>
              <input
                type="range"
                min={5}
                max={80}
                value={imageScale}
                onChange={(event) => setImageScale(Number(event.target.value))}
                disabled={busy}
                className="accent-brand mt-1.5 w-full"
              />
            </label>
          </>
        )}

        <label className="text-sm">
          <span className="font-semibold">Opacity ({opacity}%)</span>
          <input
            type="range"
            min={2}
            max={100}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            disabled={busy}
            className="accent-brand mt-1.5 w-full"
          />
        </label>

        <label className="text-sm">
          <span className="font-semibold">Rotation</span>
          <NumberField
            value={rotation}
            onChange={setRotation}
            min={-180}
            max={180}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={tile}
            onChange={(event) => setTile(event.target.checked)}
            disabled={busy}
            className="accent-brand size-4"
          />
          <span className="font-semibold">Repeat across the page</span>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Pages</span>
          <input
            value={pagesInput}
            onChange={(event) => setPagesInput(event.target.value)}
            disabled={busy}
            placeholder={`All pages (e.g. 1 to 3, 5)`}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
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
            <Stamp aria-hidden className="size-4" />
          )}
          {busy ? `Stamping ${percent}%` : 'Add watermark'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Watermarked document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} page{result.pages === 1 ? '' : 's'} stamped ·{' '}
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
            if (imagePreviewUrl.current) URL.revokeObjectURL(imagePreviewUrl.current);
            previewUrl.current = null;
            imagePreviewUrl.current = null;
            setFile(null);
            setPreviewSrc(null);
            setWatermarkImage(null);
            setImagePreview(null);
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
