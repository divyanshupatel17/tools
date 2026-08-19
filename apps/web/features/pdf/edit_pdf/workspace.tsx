'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, Maximize2, SquarePen, Trash2, TriangleAlert, Type } from 'lucide-react';
import { formatBytes, safeFileName, validateFile, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { loadProcessor } from '@/lib/processing/processor_registry';
import type { EditPdfElement } from './processor';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = { mime_types: ['application/pdf'], extensions: ['pdf'], max_files: 1, max_bytes: MAX_BYTES };
const IMAGE_RULE: FileRule = { mime_types: ['image/png', 'image/jpeg'], extensions: ['png', 'jpg', 'jpeg'], max_files: 1, max_bytes: 10 * 1024 * 1024 };
const PREVIEW_WIDTH = 420;

interface EditElement {
  id: string;
  pageIndex: number;
  kind: 'text' | 'image';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  imageFile: File | null;
  imagePreview: string | null;
  scale: number;
}

interface Result {
  artifact: ProcessorArtifact;
}

export function EditPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [elements, setElements] = useState<EditElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const sequence = useRef(0);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      for (const element of elements) if (element.imagePreview) URL.revokeObjectURL(element.imagePreview);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only, deliberately not re-subscribing per render
    [],
  );

  async function loadPage(sourceFile: File, index: number) {
    setPreviewSrc(null);
    setPageSize(null);
    try {
      const [size, image] = await Promise.all([getPdfPageSize(sourceFile, index), renderPdfPage(sourceFile, index, PREVIEW_WIDTH)]);
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
    setElements([]);
    setSelectedId(null);

    try {
      const preview = await readPdfPreview(next);
      if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
      setPageCount(preview.pages);
      setPageIndex(0);
      await loadPage(next, 0);
    } catch {
      setNotice('That file could not be read as a PDF.');
    }
  }

  function addTextElement() {
    sequence.current += 1;
    const id = `el-${sequence.current}`;
    setElements((current) => [
      ...current,
      { id, pageIndex, kind: 'text', x: 0.5, y: 0.5, text: 'Text', fontSize: 18, color: '#1a1a1a', imageFile: null, imagePreview: null, scale: 0.3 },
    ]);
    setSelectedId(id);
    setResult(null);
    setResultFile(null);
  }

  function addImageElement(files: File[]) {
    const imageFile = files[0];
    if (!imageFile) return;
    const check = validateFile(imageFile, IMAGE_RULE);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That image could not be used.');
      return;
    }
    sequence.current += 1;
    const id = `el-${sequence.current}`;
    const imagePreview = URL.createObjectURL(imageFile);
    setElements((current) => [
      ...current,
      { id, pageIndex, kind: 'image', x: 0.5, y: 0.5, text: '', fontSize: 18, color: '#1a1a1a', imageFile, imagePreview, scale: 0.3 },
    ]);
    setSelectedId(id);
    setResult(null);
    setResultFile(null);
  }

  function updateElement(id: string, patch: Partial<EditElement>) {
    setElements((current) => current.map((element) => (element.id === id ? { ...element, ...patch } : element)));
    setResult(null);
    setResultFile(null);
  }

  function removeElement(id: string) {
    setElements((current) => {
      const target = current.find((element) => element.id === id);
      if (target?.imagePreview) URL.revokeObjectURL(target.imagePreview);
      return current.filter((element) => element.id !== id);
    });
    setSelectedId((current) => (current === id ? null : current));
    setResult(null);
    setResultFile(null);
  }

  function onElementPointerDown(event: React.PointerEvent, id: string) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragging.current = id;
    setSelectedId(id);
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    const id = dragging.current;
    if (!id) return;
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    updateElement(id, { x, y });
  }

  function onOverlayPointerUp() {
    dragging.current = null;
  }

  const pageElements = elements.filter((element) => element.pageIndex === pageIndex);
  const selected = elements.find((element) => element.id === selectedId) ?? null;

  const busy = progress !== null;
  const canRun = file !== null && elements.length > 0 && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const imageFiles = elements.filter((element) => element.kind === 'image' && element.imageFile).map((element) => element.imageFile!);
      const files = [file, ...imageFiles];

      const elementPayload: EditPdfElement[] = elements.map((element) => ({
        page_index: element.pageIndex,
        kind: element.kind,
        x: element.x,
        y: element.y,
        ...(element.kind === 'text'
          ? { text: element.text, font_size: element.fontSize, color: element.color }
          : { file_index: 1 + imageFiles.indexOf(element.imageFile!), scale: element.scale }),
      }));

      const processor = await loadProcessor('pdf.edit-pdf');
      const output = await processor(
        { files, options: { elements: elementPayload } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This PDF could not be edited.');
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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border-border bg-surface flex flex-col items-center rounded-2xl border p-4">
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          page {pageIndex + 1} of {pageCount ?? '·'}
        </p>

        <div
          ref={overlayRef}
          onPointerMove={onOverlayPointerMove}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={onOverlayPointerUp}
          onPointerDown={() => setSelectedId(null)}
          className="border-border bg-cream relative touch-none overflow-hidden rounded-xl border shadow-sm select-none"
          style={{ width: PREVIEW_WIDTH, aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : '3 / 4' }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none size-full object-contain" draggable={false} />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            </div>
          )}

          {pageElements.map((element) => (
            <div
              key={element.id}
              onPointerDown={(event) => onElementPointerDown(event, element.id)}
              className={`absolute cursor-grab touch-none rounded px-1 py-0.5 active:cursor-grabbing ${
                selectedId === element.id ? 'outline-brand outline-2' : 'outline-transparent outline-2 hover:outline-brand/50'
              }`}
              style={{ left: `${element.x * 100}%`, top: `${(1 - element.y) * 100}%`, transform: 'translate(-50%, -50%)' }}
            >
              {element.kind === 'text' ? (
                <span
                  className="pointer-events-none font-semibold whitespace-nowrap"
                  style={{ fontSize: `${element.fontSize * (pageSize ? PREVIEW_WIDTH / pageSize.width : 1)}px`, color: element.color }}
                >
                  {element.text || 'Text'}
                </span>
              ) : element.imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={element.imagePreview}
                  alt=""
                  className="pointer-events-none"
                  style={{ width: `${(pageSize ? pageSize.width * element.scale * (PREVIEW_WIDTH / pageSize.width) : 100)}px` }}
                />
              ) : null}
            </div>
          ))}
        </div>
        <p className="text-muted mt-2 text-center text-xs">Drag an element to reposition it · click it to select it</p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          Adds new text and images on top of the page. Existing content cannot be edited or
          moved.
        </p>

        <label className="text-sm">
          <span className="font-semibold">Page</span>
          <NumberField
            value={pageIndex + 1}
            onChange={(value) => {
              const index = Math.min(Math.max(value - 1, 0), (pageCount ?? 1) - 1);
              setPageIndex(index);
              setSelectedId(null);
              if (file) void loadPage(file, index);
            }}
            min={1}
            max={pageCount ?? 1}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={addTextElement} disabled={busy}>
            <Type aria-hidden className="size-4" />
            Add text
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => imageInputRef.current?.click()} disabled={busy}>
            <ImagePlus aria-hidden className="size-4" />
            Add image
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              addImageElement(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>

        {selected && (
          <div className="border-border flex flex-col gap-2.5 rounded-xl border p-3">
            <p className="text-sm font-semibold">{selected.kind === 'text' ? 'Text box' : 'Image'}</p>
            {selected.kind === 'text' ? (
              <>
                <input
                  aria-label="Text box content"
                  value={selected.text}
                  onChange={(event) => updateElement(selected.id, { text: event.target.value })}
                  disabled={busy}
                  className="border-border bg-background h-10 w-full rounded-full border px-3 text-sm outline-none"
                />
                <div className="flex gap-2">
                  <label className="flex-1 text-xs">
                    <span className="font-medium">Size</span>
                    <NumberField
                      value={selected.fontSize}
                      onChange={(value) => updateElement(selected.id, { fontSize: value })}
                      min={8}
                      max={96}
                      disabled={busy}
                      className="border-border bg-background mt-1 h-9 w-full rounded-full border px-3 text-xs outline-none"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="font-medium">Color</span>
                    <input
                      type="color"
                      value={selected.color}
                      onChange={(event) => updateElement(selected.id, { color: event.target.value })}
                      disabled={busy}
                      className="border-border bg-background mt-1 h-9 w-14 cursor-pointer rounded-full border p-1"
                    />
                  </label>
                </div>
              </>
            ) : (
              <label className="text-xs">
                <span className="font-medium">Size ({Math.round(selected.scale * 100)}% of page width)</span>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={Math.round(selected.scale * 100)}
                  onChange={(event) => updateElement(selected.id, { scale: Number(event.target.value) / 100 })}
                  disabled={busy}
                  className="accent-brand mt-1 w-full"
                />
              </label>
            )}
            <Button size="sm" variant="ghost" onClick={() => removeElement(selected.id)} disabled={busy}>
              <Trash2 aria-hidden className="size-4" />
              Remove
            </Button>
          </div>
        )}

        {elements.length > 0 && (
          <p className="text-muted text-xs">
            {elements.length} element{elements.length === 1 ? '' : 's'} across the document.
          </p>
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
              <div className="bg-brand h-full rounded-full transition-[width] duration-200" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-muted mt-1.5 text-xs">
              {progress?.label ?? 'Working'} · {percent}%
            </p>
          </div>
        )}

        <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <SquarePen aria-hidden className="size-4" />}
          {busy ? `Saving ${percent}%` : 'Save PDF'}
        </Button>

        {result && resultFile && (
          <section aria-label="Edited document" className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">{formatBytes(result.artifact.blob.size)}</span>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setViewingResult(true)}>
                <Maximize2 aria-hidden className="size-4" />
                View
              </Button>
              <Button className="flex-1" onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}>
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
            for (const element of elements) if (element.imagePreview) URL.revokeObjectURL(element.imagePreview);
            setFile(null);
            setPreviewSrc(null);
            setElements([]);
            setSelectedId(null);
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
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewingResult(false)} />
      )}
    </div>
  );
}
