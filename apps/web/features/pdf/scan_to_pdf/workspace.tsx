'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Crop,
  Download,
  GripVertical,
  Info,
  Loader2,
  Maximize2,
  Plus,
  RotateCw,
  ScanLine,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { formatBytes, safeFileName, validateFiles, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { CameraCapture } from '@/components/pdf/camera_capture';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { ScanCropModal } from '@/components/pdf/scan_crop_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import type { ImagesToPdfMargin, ImagesToPdfPageSize } from '@/lib/pdf/images_to_pdf';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_FILES = 30;
const MAX_BYTES = 25 * 1024 * 1024;

const RULE: FileRule = {
  mime_types: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['jpg', 'jpeg', 'png', 'webp'],
  max_files: MAX_FILES,
  max_bytes: MAX_BYTES,
};

interface Item {
  id: string;
  file: File;
  thumbnail: string;
  rotation: 0 | 90 | 180 | 270;
}

interface Result {
  artifact: ProcessorArtifact;
  count: number;
}

const PAGE_SIZES: Array<[ImagesToPdfPageSize, string]> = [
  ['fit', 'Fit to page'],
  ['a4', 'A4'],
  ['letter', 'Letter'],
];

const MARGINS: Array<[ImagesToPdfMargin, string]> = [
  ['none', 'None'],
  ['normal', 'Normal'],
  ['wide', 'Wide'],
];

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

type CropTarget = { kind: 'new'; blob: Blob } | { kind: 'existing'; itemId: string; blob: File };

/**
 * Scan to PDF: photograph a page (`CameraCapture`, `getUserMedia`) or upload one, crop it
 * (`ScanCropModal` — freeform rectangle, ratio-locked rectangle, or a draggable four-corner
 * perspective quad seeded by an edge-energy auto-detect), reorder/rotate the resulting pages,
 * then hand them to the same `buildPdfFromImages` pipeline Images to PDF uses. Every step runs
 * on-device: nothing captured or uploaded here is ever sent anywhere.
 */
export function ScanToPdfWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<ImagesToPdfPageSize>('fit');
  const [margin, setMargin] = useState<ImagesToPdfMargin>('none');
  const [outputName, setOutputName] = useState('scan');
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [viewingResult, setViewingResult] = useState(false);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);

  const hintId = 'scan-to-pdf-hint';
  const listRef = useRef<HTMLOListElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const thumbnails = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const itemsRef = useRef<Item[]>([]);
  const commit = useCallback((next: Item[] | ((current: Item[]) => Item[])) => {
    const value = typeof next === 'function' ? next(itemsRef.current) : next;
    itemsRef.current = value;
    setItems(value);
  }, []);

  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of thumbnails.current) URL.revokeObjectURL(url);
      thumbnails.current.clear();
    },
    [],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      setResult(null);
      setResultFile(null);

      const check = validateFiles(files, { ...RULE, max_files: undefined });
      if (!check.ok) {
        setNotice(check.errors[0] ?? 'Those files could not be added.');
        return;
      }
      setNotice(null);

      const room = MAX_FILES - itemsRef.current.length;
      if (room <= 0) {
        setNotice(`You can combine at most ${MAX_FILES} pages at a time.`);
        return;
      }
      if (files.length > room) {
        setNotice(`Only ${room} more page${room === 1 ? '' : 's'} fit; the limit is ${MAX_FILES}.`);
      }

      const accepted: Item[] = files.slice(0, room).map((file) => {
        sequence.current += 1;
        const thumbnail = URL.createObjectURL(file);
        thumbnails.current.add(thumbnail);
        return { id: `scan-${sequence.current}`, file, thumbnail, rotation: 0 as const };
      });

      commit((current) => [...current, ...accepted]);
    },
    [commit],
  );

  const addCapturedBlob = useCallback((blob: Blob) => {
    setCameraOpen(false);
    setCropTarget({ kind: 'new', blob });
  }, []);

  function finishNewCrop(blob: Blob) {
    if (itemsRef.current.length >= MAX_FILES) {
      setNotice(`You can combine at most ${MAX_FILES} pages at a time.`);
      setCropTarget(null);
      return;
    }
    sequence.current += 1;
    const file = new File([blob], `scan-${sequence.current}.png`, { type: 'image/png' });
    const thumbnail = URL.createObjectURL(file);
    thumbnails.current.add(thumbnail);
    setResult(null);
    setResultFile(null);
    commit((current) => [
      ...current,
      { id: `scan-${sequence.current}`, file, thumbnail, rotation: 0 as const },
    ]);
    setCropTarget(null);
  }

  function finishExistingCrop(itemId: string, blob: Blob) {
    const file = new File([blob], `scan.png`, { type: 'image/png' });
    setResult(null);
    setResultFile(null);
    commit((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        URL.revokeObjectURL(item.thumbnail);
        thumbnails.current.delete(item.thumbnail);
        const thumbnail = URL.createObjectURL(file);
        thumbnails.current.add(thumbnail);
        return { ...item, file, thumbnail };
      }),
    );
    setCropTarget(null);
  }

  const remove = useCallback(
    (id: string) => {
      setResult(null);
      setResultFile(null);
      commit((current) => {
        const target = current.find((item) => item.id === id);
        if (target) {
          URL.revokeObjectURL(target.thumbnail);
          thumbnails.current.delete(target.thumbnail);
        }
        return current.filter((item) => item.id !== id);
      });
    },
    [commit],
  );

  const rotate = useCallback(
    (id: string) => {
      setResult(null);
      setResultFile(null);
      commit((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, rotation: ((item.rotation + 90) % 360) as Item['rotation'] }
            : item,
        ),
      );
    },
    [commit],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      setResult(null);
      setResultFile(null);
      commit((current) => move(current, from, to));
    },
    [commit],
  );

  const clearAll = useCallback(() => {
    setResult(null);
    setResultFile(null);
    setNotice(null);
    for (const url of thumbnails.current) URL.revokeObjectURL(url);
    thumbnails.current.clear();
    commit([]);
  }, [commit]);

  const busy = progress !== null;
  const canRun = items.length > 0 && !busy;

  const drag = useRef<{ id: string; x: number; y: number; node: HTMLElement } | null>(null);

  const endDrag = useCallback(() => {
    if (drag.current) drag.current.node.style.transform = '';
    drag.current = null;
    setDraggingId(null);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = drag.current;
      const list = listRef.current;
      if (!state || !list) return;

      state.node.style.transform = `translate(${event.clientX - state.x}px, ${event.clientY - state.y}px)`;

      const cards = [...list.children].filter((child): child is HTMLElement =>
        child.hasAttribute('data-card'),
      );
      const from = cards.indexOf(state.node);
      const over = cards.findIndex((card) => {
        if (card === state.node) return false;
        const box = card.getBoundingClientRect();
        return (
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom
        );
      });

      if (from !== -1 && over !== -1) {
        reorder(from, over);
        state.x = event.clientX;
        state.y = event.clientY;
        state.node.style.transform = '';
      }
    },
    [reorder],
  );

  useEffect(() => {
    if (!draggingId) return;
    const up = () => endDrag();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [draggingId, onPointerMove, endDrag]);

  function startDrag(event: React.PointerEvent<HTMLLIElement>, id: string) {
    if (busy || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-no-drag]')) return;
    if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return;

    const node = event.currentTarget;
    event.preventDefault();
    drag.current = { id, x: event.clientX, y: event.clientY, node };
    setDraggingId(id);
  }

  function onHandleKeyDown(event: React.KeyboardEvent, index: number) {
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!back && !forward) return;
    event.preventDefault();
    reorder(index, index + (back ? -1 : 1));
  }

  async function run() {
    if (!canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.scan-to-pdf');
      const output = await processor(
        {
          files: items.map((item) => item.file),
          options: {
            page_size: pageSize,
            orientation: 'auto',
            margin,
            rotations: items.map((item) => item.rotation),
            file_name: outputName,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, count: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be completed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(Array.from(event.dataTransfer.files));
          }}
          className="border-border bg-surface rounded-card flex flex-col items-center gap-4 border-2 border-dashed p-10 text-center"
        >
          <ScanLine aria-hidden className="text-muted size-8" />
          <p className="text-sm font-medium">Photograph a page or upload one to get started</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setCameraOpen(true)}>
              <Camera aria-hidden className="size-4" />
              Take photo
            </Button>
            <Button variant="secondary" onClick={() => addInputRef.current?.click()}>
              <Upload aria-hidden className="size-4" />
              Upload image
            </Button>
          </div>
          <input
            ref={addInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>
        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}
        {cameraOpen && (
          <CameraCapture onCapture={addCapturedBlob} onClose={() => setCameraOpen(false)} />
        )}
        {cropTarget?.kind === 'new' && (
          <ScanCropModal
            file={cropTarget.blob}
            onCancel={() => setCropTarget(null)}
            onApply={finishNewCrop}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) addFiles(Array.from(event.dataTransfer.files));
        }}
        className="border-border bg-surface rounded-2xl border p-4"
      >
        <p className="text-muted mb-3 text-sm">
          <span className="text-foreground font-semibold">{items.length}</span> of {MAX_FILES} pages
          {' · '}
          {formatBytes(totalBytes)}
        </p>

        <ol
          ref={listRef}
          className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5"
          aria-describedby={hintId}
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              data-card
              onPointerDown={(event) => startDrag(event, item.id)}
              className={`border-border bg-surface relative flex touch-pan-y flex-col rounded-xl border p-1.5 select-none ${
                draggingId === item.id
                  ? 'z-20 scale-105 cursor-grabbing shadow-lg'
                  : 'z-0 cursor-grab transition-transform'
              }`}
            >
              <span className="bg-cream relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail}
                  alt=""
                  draggable={false}
                  className="size-full object-contain transition-transform"
                  style={{ transform: `rotate(${item.rotation}deg)` }}
                />
                <span className="bg-brand text-ink absolute top-1 left-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold">
                  {index + 1}
                </span>
                <button
                  type="button"
                  data-no-drag
                  onClick={() => setViewingItemId(item.id)}
                  aria-label={`View page ${index + 1}`}
                  className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
                >
                  <Maximize2 aria-hidden className="size-3.5" />
                </button>
              </span>

              <span
                className="mt-1.5 truncate text-[11px] font-semibold"
                title={safeFileName(item.file.name)}
              >
                {safeFileName(item.file.name)}
              </span>
              <span className="text-muted text-[10.5px]">{formatBytes(item.file.size)}</span>

              <span className="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  data-drag-handle
                  onKeyDown={(event) => onHandleKeyDown(event, index)}
                  disabled={busy}
                  aria-label={`Reorder page ${index + 1}, position ${index + 1} of ${items.length}`}
                  aria-describedby={hintId}
                  className="text-muted hover:text-foreground flex size-7 cursor-grab touch-none items-center justify-center rounded-lg disabled:opacity-40"
                >
                  <GripVertical aria-hidden className="size-4" />
                </button>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    data-no-drag
                    onClick={() =>
                      setCropTarget({ kind: 'existing', itemId: item.id, blob: item.file })
                    }
                    disabled={busy}
                    aria-label={`Crop page ${index + 1}`}
                    className="text-muted hover:text-foreground flex size-7 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
                  >
                    <Crop aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => rotate(item.id)}
                    disabled={busy}
                    aria-label={`Rotate page ${index + 1}`}
                    className="text-muted hover:text-foreground flex size-7 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
                  >
                    <RotateCw aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => remove(item.id)}
                    disabled={busy}
                    aria-label={`Remove page ${index + 1}`}
                    className="text-muted hover:text-danger flex size-7 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </span>
              </span>
            </li>
          ))}

          <li>
            <div className="border-border flex size-full min-h-[128px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-2">
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                disabled={busy || items.length >= MAX_FILES}
                className="hover:border-brand text-muted hover:text-foreground flex flex-col items-center gap-1 text-[11px] font-medium transition-colors disabled:opacity-40"
              >
                <Camera aria-hidden className="size-5" />
                Take photo
              </button>
              <span className="text-muted text-[10px]">or</span>
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                disabled={busy || items.length >= MAX_FILES}
                className="hover:border-brand text-muted hover:text-foreground flex flex-col items-center gap-1 text-[11px] font-medium transition-colors disabled:opacity-40"
              >
                <Plus aria-hidden className="size-5" />
                Upload
              </button>
            </div>
            <input
              ref={addInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </li>
        </ol>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p
          id={hintId}
          className="bg-cream text-ink/80 flex items-start gap-2 rounded-xl p-3 text-xs"
        >
          <Info aria-hidden className="text-brand-strong mt-px size-4 shrink-0" />
          Use the crop icon on any page for perspective, ratio or freeform cropping. Drag a card to
          reorder; the rotate icon turns one 90° at a time.
        </p>

        <label className="text-sm">
          <span className="font-semibold">Page size</span>
          <select
            name="page-size"
            value={pageSize}
            onChange={(event) => setPageSize(event.target.value as ImagesToPdfPageSize)}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            {PAGE_SIZES.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Margin</span>
          <select
            name="margin"
            value={margin}
            onChange={(event) => setMargin(event.target.value as ImagesToPdfMargin)}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            {MARGINS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">File name</span>
          <span className="border-border bg-background mt-1.5 flex h-11 items-center rounded-full border px-4">
            <input
              name="output-name"
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              disabled={busy}
              className="w-full min-w-0 bg-transparent outline-none"
            />
            <span className="text-muted shrink-0">.pdf</span>
          </span>
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
            <ScanLine aria-hidden className="size-4" />
          )}
          {busy ? `Building ${percent}%` : 'Save as PDF'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Scanned document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.count} page{result.count === 1 ? '' : 's'} ·{' '}
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

        <Button size="sm" variant="ghost" onClick={clearAll} disabled={busy}>
          Clear all
        </Button>
      </aside>

      {viewingResult && resultFile && (
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewingResult(false)} />
      )}
      {viewingItemId &&
        (() => {
          const item = items.find((entry) => entry.id === viewingItemId);
          if (!item) return null;
          return (
            <PageDetailModal
              file={item.file}
              pageIndex={0}
              rotations={{ 0: item.rotation }}
              onClose={() => setViewingItemId(null)}
            />
          );
        })()}
      {cameraOpen && (
        <CameraCapture onCapture={addCapturedBlob} onClose={() => setCameraOpen(false)} />
      )}
      {cropTarget?.kind === 'new' && (
        <ScanCropModal
          file={cropTarget.blob}
          onCancel={() => setCropTarget(null)}
          onApply={finishNewCrop}
        />
      )}
      {cropTarget?.kind === 'existing' && (
        <ScanCropModal
          file={cropTarget.blob}
          onCancel={() => setCropTarget(null)}
          onApply={(blob) => finishExistingCrop(cropTarget.itemId, blob)}
        />
      )}
    </div>
  );
}
