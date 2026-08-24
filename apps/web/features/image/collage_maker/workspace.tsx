'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Layers,
  LayoutGrid,
  Loader2,
  Maximize2,
  X,
} from 'lucide-react';
import { formatBytes, safeFileName, validateFiles } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { ControlPanel, Field, Notice, ProgressBar, SegmentedControl, SliderField } from '@/components/image/control_panel';
import { ImageResultCard, type ImageResultItem } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { fitBox } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { canEncode } from '@/lib/image/encode';
import { IMAGE_ACCEPT, IMAGE_LABEL, OUTPUT_FORMATS, imageRule, isLossy, type OutputFormat } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { drawCollage, drawFreeCollage } from './draw_collage';
import { ImagePositionModal } from './image_position_modal';
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO_ID, DEFAULT_LAYOUT_ID, EXPORT_LONG_EDGE, LAYOUTS, autoLayoutFor, computeCanvasSize, findLayout } from './layout_options';
import type { CollageMakerOptions, FreeItemOption, GridCellOption } from './processor';

const MAX_FILES = 12;
const RULE = imageRule({ max_files: MAX_FILES, max_bytes: 40 * 1024 * 1024 });
const PREVIEW_LONG_EDGE = 560;
const PREVIEW_FRAME_WIDTH = 560;
const THUMBNAIL_SIZE = 160;
const FREE_PREVIEW_LONG_EDGE = 480;

interface CollageImage {
  id: string;
  file: File;
  bitmap: ImageBitmap;
  /** Square 160x160 cover crop, for the uniform Pictures list and Layers list rows only. */
  thumbnail: string;
  /**
   * Same aspect ratio as `bitmap`, for the free layout artboard: that canvas item is drawn at
   * the picture's real proportions (see `drawFreeCollage`), so its on screen preview has to
   * keep those proportions too, or every control anchored to its edges lands in the wrong spot.
   */
  preview: string;
}
/** Stacking order lives in array position, not a field: index 0 is the bottom of the stack. */
interface FreeItem { image_id: string; x: number; y: number; width: number; }
interface PointerDrag { image_id: string; action: 'move' | 'resize'; offset_x: number; offset_y: number; }

let idSeed = 0;
function nextId(): string { idSeed += 1; return `picture-${idSeed}`; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

function makeThumbnail(bitmap: ImageBitmap): string {
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const fitted = fitBox({ width: bitmap.width, height: bitmap.height }, { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }, 'cover');
  ctx.drawImage(bitmap, (THUMBNAIL_SIZE - fitted.width) / 2, (THUMBNAIL_SIZE - fitted.height) / 2, fitted.width, fitted.height);
  return canvas.toDataURL('image/png');
}

/** Downscaled but never cropped, so it renders at the same aspect ratio as the source. */
function makePreview(bitmap: ImageBitmap): string {
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, FREE_PREVIEW_LONG_EDGE / longEdge);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

const PILL = 'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors';
const pillClass = (selected: boolean) => `${PILL} ${selected ? 'bg-brand border-brand text-on-brand' : 'border-border text-muted hover:text-foreground'}`;
const TOOLBAR_BUTTON = 'flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-cream hover:text-foreground';

export function CollageMakerWorkspace() {
  const [images, setImages] = useState<CollageImage[]>([]);
  const [mode, setMode] = useState<'grid' | 'free'>('grid');
  const [layoutId, setLayoutId] = useState(DEFAULT_LAYOUT_ID);
  // False until the visitor deliberately picks a grid preset. Until then, the layout keeps
  // reshaping itself to fit however many pictures are actually on the board.
  const [layoutTouched, setLayoutTouched] = useState(false);
  const [customGrid, setCustomGrid] = useState(false);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [cells, setCells] = useState<(string | null)[]>(Array(4).fill(null));
  // Which part of a picture shows when it is cropped to its cell, keyed by picture id so the
  // choice travels with the picture if it moves to a different cell. Unset means centered.
  const [imageFocals, setImageFocals] = useState<Record<string, { x: number; y: number }>>({});
  const [positionCellIndex, setPositionCellIndex] = useState<number | null>(null);
  const [freeItems, setFreeItems] = useState<FreeItem[]>([]);
  const [selectedFreeId, setSelectedFreeId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [aspectRatioId, setAspectRatioId] = useState(DEFAULT_ASPECT_RATIO_ID);
  const [spacing, setSpacing] = useState(16);
  const [borderWidth, setBorderWidth] = useState(0);
  const [borderColor, setBorderColor] = useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState('#f2f0ea');
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [formatOptions, setFormatOptions] = useState<OutputFormat[]>([...OUTPUT_FORMATS]);
  const [quality, setQuality] = useState(90);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<ImageResultItem[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const abort = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<CollageImage[]>([]);
  const dragId = useRef<string | null>(null);
  const pointerDrag = useRef<PointerDrag | null>(null);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => () => { abort.current?.abort(); imagesRef.current.forEach((image) => image.bitmap.close()); }, []);
  useEffect(() => {
    let cancelled = false;
    canEncode('avif').then((ok) => {
      if (!ok && !cancelled) { setFormatOptions(OUTPUT_FORMATS.filter((value) => value !== 'avif')); setFormat((value) => value === 'avif' ? 'jpeg' : value); }
    });
    return () => { cancelled = true; };
  }, []);

  const presetLayout = findLayout(layoutId);
  const layout = useMemo(() => ({ ...presetLayout, rows: customGrid ? rows : presetLayout.rows, cols: customGrid ? cols : presetLayout.cols }), [presetLayout, customGrid, rows, cols]);
  const cellCount = layout.rows * layout.cols;
  const exportSize = computeCanvasSize(layout, aspectRatioId, EXPORT_LONG_EDGE);
  const previewSize = computeCanvasSize(layout, aspectRatioId, PREVIEW_LONG_EDGE);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const busy = progress !== null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCells((previous) => Array.from({ length: cellCount }, (_, index) => previous[index] ?? null));
  }, [cellCount]);

  function clearResult(): void { setResult([]); }

  function focalFor(id: string): { x: number; y: number } {
    return imageFocals[id] ?? { x: 0.5, y: 0.5 };
  }

  function draw(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number, includeFreeItems = true): void {
    if (mode === 'free') {
      if (!includeFreeItems) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        return;
      }
      drawFreeCollage(ctx, width, height, freeItems.map((item) => ({ ...item, image: imageById.get(item.image_id)?.bitmap })).filter((item): item is FreeItem & { image: ImageBitmap } => Boolean(item.image)), backgroundColor);
      return;
    }
    const gridCells = cells.map((id) => {
      if (!id) return null;
      const image = imageById.get(id);
      return image ? { image: image.bitmap, focal: focalFor(id) } : null;
    });
    drawCollage(ctx, width, height, gridCells, layout, { spacing: spacing * scale, borderWidth: borderWidth * scale, borderColor, backgroundColor });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = previewSize.width;
    canvas.height = previewSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    draw(ctx, previewSize.width, previewSize.height, previewSize.width / exportSize.width, false);
  }, [images, mode, cells, freeItems, imageFocals, layout, previewSize.width, previewSize.height, exportSize.width, spacing, borderWidth, borderColor, backgroundColor]);

  async function addFiles(files: File[]): Promise<void> {
    setNotice(null); setReading(true);
    const room = MAX_FILES - images.length;
    if (room <= 0) { setNotice(`A collage holds up to ${MAX_FILES} pictures.`); setReading(false); return; }
    const accepted: CollageImage[] = [];
    for (const file of files.slice(0, room)) {
      const check = validateFiles([file], RULE);
      if (!check.ok) { setNotice(check.errors[0] ?? 'One picture could not be used.'); continue; }
      try { const decoded = await decodeImage(file); accepted.push({ id: nextId(), file, bitmap: decoded.bitmap, thumbnail: makeThumbnail(decoded.bitmap), preview: makePreview(decoded.bitmap) }); }
      catch { setNotice(`${safeFileName(file.name)} could not be read as an image.`); }
    }
    if (accepted.length) {
      const autoGrid = !layoutTouched && !customGrid ? autoLayoutFor(images.length + accepted.length) : null;
      if (autoGrid) setLayoutId(autoGrid.id);
      setImages((previous) => [...previous, ...accepted]);
      setCells((previous) => {
        const next = autoGrid
          ? Array.from({ length: autoGrid.rows * autoGrid.cols }, (_, index) => previous[index] ?? null)
          : [...previous];
        for (const image of accepted) { const open = next.indexOf(null); if (open >= 0) next[open] = image.id; }
        return next;
      });
      clearResult();
    }
    if (files.length > room) setNotice(`Only ${MAX_FILES} pictures fit in one collage.`);
    setReading(false);
  }

  function removeImage(id: string): void {
    const stillPresent = images.some((item) => item.id === id);
    if (stillPresent && !layoutTouched && !customGrid) setLayoutId(autoLayoutFor(images.length - 1).id);
    setImages((previous) => { const image = previous.find((item) => item.id === id); image?.bitmap.close(); return previous.filter((item) => item.id !== id); });
    setCells((previous) => previous.map((value) => value === id ? null : value));
    setFreeItems((previous) => previous.filter((item) => item.image_id !== id));
    setImageFocals((previous) => { if (!(id in previous)) return previous; const next = { ...previous }; delete next[id]; return next; });
    if (selectedFreeId === id) { setSelectedFreeId(null); setLayersOpen(false); }
    clearResult();
  }

  function updateFocal(id: string, focal: { x: number; y: number }): void {
    setImageFocals((previous) => ({ ...previous, [id]: focal }));
    clearResult();
  }

  function removeFreeItem(id: string): void {
    setFreeItems((previous) => previous.filter((item) => item.image_id !== id));
    if (selectedFreeId === id) { setSelectedFreeId(null); setLayersOpen(false); }
    clearResult();
  }

  function placeInCell(id: string, target: number): void {
    setCells((previous) => {
      const next = [...previous];
      const source = next.indexOf(id);
      const displaced = next[target] ?? null;
      next[target] = id;
      if (source >= 0 && source !== target) next[source] = displaced;
      return next;
    });
    clearResult();
  }

  function placeFree(id: string, clientX: number, clientY: number): void {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width - 0.12, 0, 0.9);
    const y = clamp((clientY - rect.top) / rect.height - 0.08, 0, 0.9);
    setFreeItems((previous) => {
      const existing = previous.find((item) => item.image_id === id);
      const rest = previous.filter((item) => item.image_id !== id);
      return [...rest, { image_id: id, x, y, width: existing?.width ?? 0.35 }];
    });
    setSelectedFreeId(id); clearResult();
  }

  /** Moves a free item within the stacking array. `previous` is bottom to top order. */
  function reorderFree(id: string, reorder: (previous: FreeItem[], index: number) => FreeItem[]): void {
    setFreeItems((previous) => {
      const index = previous.findIndex((item) => item.image_id === id);
      if (index === -1) return previous;
      return reorder(previous, index);
    });
    clearResult();
  }

  function bringToFront(id: string): void {
    reorderFree(id, (previous, index) => {
      if (index === previous.length - 1) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1) as [FreeItem];
      next.push(item);
      return next;
    });
  }

  function sendToBack(id: string): void {
    reorderFree(id, (previous, index) => {
      if (index === 0) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1) as [FreeItem];
      next.unshift(item);
      return next;
    });
  }

  function bringForward(id: string): void {
    reorderFree(id, (previous, index) => {
      if (index === previous.length - 1) return previous;
      const next = [...previous];
      const swap = next[index]!;
      next[index] = next[index + 1]!;
      next[index + 1] = swap;
      return next;
    });
  }

  function sendBackward(id: string): void {
    reorderFree(id, (previous, index) => {
      if (index === 0) return previous;
      const next = [...previous];
      const swap = next[index]!;
      next[index] = next[index - 1]!;
      next[index - 1] = swap;
      return next;
    });
  }

  function startFreeDrag(id: string, action: PointerDrag['action'], clientX: number, clientY: number, pointer: number): void {
    const frame = frameRef.current;
    const item = freeItems.find((value) => value.image_id === id);
    if (!frame || !item) return;
    const rect = frame.getBoundingClientRect();
    pointerDrag.current = {
      image_id: id,
      action,
      offset_x: (clientX - rect.left) / rect.width - item.x,
      offset_y: (clientY - rect.top) / rect.height - item.y,
    };
    frame.setPointerCapture(pointer);
    setSelectedFreeId(id);
  }

  function updateFreeDrag(clientX: number, clientY: number): void {
    const frame = frameRef.current;
    const drag = pointerDrag.current;
    if (!frame || !drag || mode !== 'free') return;
    const rect = frame.getBoundingClientRect();
    setFreeItems((previous) => previous.map((item) => {
      if (item.image_id !== drag.image_id) return item;
      if (drag.action === 'resize') {
        return { ...item, width: clamp((clientX - rect.left) / rect.width - item.x, 0.1, 0.9) };
      }
      return {
        ...item,
        x: clamp((clientX - rect.left) / rect.width - drag.offset_x, 0, 1 - item.width),
        y: clamp((clientY - rect.top) / rect.height - drag.offset_y, 0, 0.95),
      };
    }));
    clearResult();
  }

  function endFreeDrag(pointer: number): void {
    if (frameRef.current?.hasPointerCapture(pointer)) frameRef.current.releasePointerCapture(pointer);
    pointerDrag.current = null;
  }

  function resetAll(): void { imagesRef.current.forEach((image) => image.bitmap.close()); setImages([]); setCells([]); setFreeItems([]); setImageFocals({}); setPositionCellIndex(null); setSelectedFreeId(null); setLayersOpen(false); setLayoutTouched(false); setCustomGrid(false); clearResult(); setNotice(null); }

  async function run(): Promise<void> {
    if (!images.length || busy || reading) return;
    setNotice(null); clearResult(); setProgress({ ratio: 0, label: 'Starting' });
    const controller = new AbortController(); abort.current = controller;
    try {
      const fileIndex = new Map(images.map((image, index) => [image.id, index]));
      const options = {
        mode, layout: layoutId, rows: layout.rows, cols: layout.cols, aspect_ratio: aspectRatioId, spacing, border_width: borderWidth, border_color: borderColor, background_color: backgroundColor, format, quality,
        grid_cells: cells.map((id): GridCellOption | null => {
          if (!id) return null;
          const index = fileIndex.get(id);
          if (index === undefined) return null;
          const focal = focalFor(id);
          return { file_index: index, focal_x: focal.x, focal_y: focal.y };
        }),
        free_items: freeItems.map((item): FreeItemOption | null => { const index = fileIndex.get(item.image_id); return index === undefined ? null : { file_index: index, x: item.x, y: item.y, width: item.width }; }).filter((item): item is FreeItemOption => item !== null),
      } satisfies CollageMakerOptions;
      const processor = await loadProcessor('image.collage-maker');
      const output = await processor({ files: images.map((image) => image.file), options }, { signal: controller.signal, on_progress: setProgress });
      const artifact = output.artifacts[0];
      if (artifact) setResult([{ artifact, caption: `${exportSize.width} x ${exportSize.height} px` }]);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The collage could not be made.'); }
    finally { abort.current = null; setProgress(null); }
  }

  function openPreview(): void {
    const canvas = document.createElement('canvas'); canvas.width = exportSize.width; canvas.height = exportSize.height;
    const ctx = canvas.getContext('2d'); if (!ctx) return; draw(ctx, exportSize.width, exportSize.height, 1);
    canvas.toBlob((blob) => { if (blob) setPreviewFile(new File([blob], 'collage preview.png', { type: 'image/png' })); }, 'image/png');
  }

  if (!images.length) return <div className="flex flex-col gap-4"><FileUpload rule={RULE} accept={IMAGE_ACCEPT} multiple onFiles={addFiles} />{reading && <p className="text-muted text-sm">Reading the pictures</p>}{notice && <Notice>{notice}</Notice>}</div>;

  return <><ImageWorkspaceLayout preview={<div className="flex items-start justify-center gap-3">
    <aside className="border-border bg-surface w-24 shrink-0 rounded-2xl border p-2">
      <p className="mb-2 text-center text-xs font-semibold">Pictures</p>
      <ul className="flex max-h-[560px] flex-col gap-2 overflow-y-auto" aria-label="Uploaded pictures">
        {images.map((image) => <li key={image.id} draggable={!busy} onDragStart={() => { dragId.current = image.id; }} onDragEnd={() => { dragId.current = null; }} className="border-border bg-cream relative overflow-hidden rounded-xl border p-1"><img src={image.thumbnail} alt={safeFileName(image.file.name)} className="size-[70px] rounded-lg object-cover" /><button type="button" onClick={() => removeImage(image.id)} disabled={busy} aria-label={`Remove ${safeFileName(image.file.name)}`} className="bg-surface/90 border-border absolute top-1 right-1 flex size-5 items-center justify-center rounded-full border"><X aria-hidden className="size-3" /></button><span className="text-muted block truncate pt-1 text-[10px]">{formatBytes(image.file.size)}</span></li>)}
      </ul>
    </aside>
    <div className="flex min-w-0 flex-col items-center gap-3">
    <div
      ref={frameRef}
      className="border-border bg-cream relative w-full overflow-hidden rounded-2xl border shadow-sm"
      style={{ maxWidth: PREVIEW_FRAME_WIDTH, aspectRatio: `${previewSize.width} / ${previewSize.height}` }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); if (mode === 'free' && dragId.current) placeFree(dragId.current, event.clientX, event.clientY); }}
      onPointerMove={(event) => updateFreeDrag(event.clientX, event.clientY)}
      onPointerUp={(event) => endFreeDrag(event.pointerId)}
      onPointerCancel={(event) => endFreeDrag(event.pointerId)}
    >
      <canvas ref={canvasRef} className="size-full" />
      {mode === 'grid' && <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`, gap: `${Math.max(0, spacing * (PREVIEW_FRAME_WIDTH / exportSize.width))}px` }}>{cells.map((id, index) => <div key={index} draggable={Boolean(id) && !busy} onDragStart={() => { dragId.current = id; }} onDragEnd={() => { dragId.current = null; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragId.current) placeInCell(dragId.current, index); }} onClick={() => { if (id && !busy) setPositionCellIndex(index); }} className={`outline-brand/50 group relative outline outline-1 outline-offset-[-1px] ${id ? 'cursor-pointer' : 'cursor-grab'}`}>{!id && <span className="bg-surface/85 text-muted absolute inset-2 flex items-center justify-center rounded text-center text-[10px]">Drop picture here</span>}{id && <span className="bg-ink/60 text-paper pointer-events-none absolute inset-2 flex items-center justify-center rounded text-center text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">Click to adjust position</span>}</div>)}</div>}
      {mode === 'free' && freeItems.map((item, index) => {
        const image = imageById.get(item.image_id);
        const selected = selectedFreeId === item.image_id;
        if (!image) return null;
        return (
          <div
            key={item.image_id}
            role="button"
            tabIndex={0}
            onPointerDown={(event) => startFreeDrag(item.image_id, 'move', event.clientX, event.clientY, event.pointerId)}
            onClick={() => setSelectedFreeId(item.image_id)}
            className={`absolute cursor-move touch-none rounded-lg shadow-lg ${selected ? 'ring-brand ring-2 ring-offset-2' : 'ring-surface ring-1'}`}
            style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, zIndex: index + 1 }}
            aria-label={`Move ${safeFileName(image.file.name)}`}
          >
            <img src={image.preview} alt="" draggable={false} className="block h-auto w-full rounded-lg" />
          </div>
        );
      })}
      {mode === 'free' && selectedFreeId && (() => {
        const item = freeItems.find((value) => value.image_id === selectedFreeId);
        const image = item ? imageById.get(item.image_id) : undefined;
        if (!item || !image) return null;
        const toolbarBelow = item.y < 0.14;
        return (
          // A sibling overlaid above every picture, not a child of the selected picture's own
          // box: an absolute child can never outrank a sibling picture with a higher z-index,
          // however high its own z-index is, so the controls have to live outside that box.
          <div
            className="pointer-events-none absolute z-40"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              aspectRatio: `${image.bitmap.width} / ${image.bitmap.height}`,
            }}
          >
            <button
              type="button"
              onPointerDown={(event) => { event.stopPropagation(); startFreeDrag(item.image_id, 'resize', event.clientX, event.clientY, event.pointerId); }}
              aria-label={`Resize ${safeFileName(image.file.name)}`}
              title="Drag to resize"
              className="border-brand-strong bg-brand focus-visible:ring-brand pointer-events-auto absolute -right-1.5 -bottom-1.5 size-4 cursor-se-resize touch-none rounded-full border-2 outline-none focus-visible:ring-2 active:cursor-grabbing"
            />
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); removeFreeItem(item.image_id); }}
              aria-label={`Remove ${safeFileName(image.file.name)} from the artboard`}
              title="Remove from artboard"
              className="bg-surface/90 border-border text-muted hover:text-foreground focus-visible:ring-brand pointer-events-auto absolute -top-2 -right-2 flex size-5 cursor-pointer items-center justify-center rounded-full border outline-none focus-visible:ring-2"
            >
              <X aria-hidden className="size-3" />
            </button>
            <div
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className={`border-border bg-surface pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border p-1 shadow-md ${toolbarBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}
            >
              <button type="button" onClick={() => bringToFront(item.image_id)} aria-label={`Bring ${safeFileName(image.file.name)} to front`} title="Bring to front" className={TOOLBAR_BUTTON}><ArrowUpToLine aria-hidden className="size-3.5" /></button>
              <button type="button" onClick={() => bringForward(item.image_id)} aria-label={`Bring ${safeFileName(image.file.name)} forward`} title="Bring forward" className={TOOLBAR_BUTTON}><ArrowUp aria-hidden className="size-3.5" /></button>
              <button type="button" onClick={() => sendBackward(item.image_id)} aria-label={`Send ${safeFileName(image.file.name)} backward`} title="Send backward" className={TOOLBAR_BUTTON}><ArrowDown aria-hidden className="size-3.5" /></button>
              <button type="button" onClick={() => sendToBack(item.image_id)} aria-label={`Send ${safeFileName(image.file.name)} to back`} title="Send to back" className={TOOLBAR_BUTTON}><ArrowDownToLine aria-hidden className="size-3.5" /></button>
              <span className="bg-border mx-0.5 h-4 w-px" aria-hidden />
              <button type="button" onClick={() => setLayersOpen((open) => !open)} aria-label="Show layers" aria-pressed={layersOpen} title="Show layers" className={TOOLBAR_BUTTON}><Layers aria-hidden className="size-3.5" /></button>
            </div>
          </div>
        );
      })()}
      {mode === 'free' && layersOpen && freeItems.length > 0 && (
        <div className="border-border bg-surface absolute top-2 right-2 z-30 w-44 rounded-xl border p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-semibold">Layers</span>
            <button type="button" onClick={() => setLayersOpen(false)} aria-label="Close layers" className="text-muted hover:text-foreground flex size-5 items-center justify-center rounded-full"><X aria-hidden className="size-3.5" /></button>
          </div>
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto" aria-label="Layer order, front to back">
            {[...freeItems].reverse().map((item) => {
              const image = imageById.get(item.image_id);
              if (!image) return null;
              const selected = selectedFreeId === item.image_id;
              return (
                <li key={item.image_id} className={`flex items-center gap-1 rounded-lg p-1 ${selected ? 'bg-brand/15' : ''}`}>
                  <button type="button" onClick={() => setSelectedFreeId(item.image_id)} className={`flex min-w-0 flex-1 items-center gap-2 text-left text-xs ${selected ? 'text-foreground' : 'text-muted hover:text-foreground'}`}>
                    <img src={image.thumbnail} alt="" className="size-6 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate">{safeFileName(image.file.name)}</span>
                  </button>
                  <button type="button" onClick={() => removeFreeItem(item.image_id)} aria-label={`Remove ${safeFileName(image.file.name)} from the artboard`} className="text-muted hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-full"><X aria-hidden className="size-3" /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <button type="button" onClick={openPreview} aria-label="View the collage full size" className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-50 flex size-6 items-center justify-center rounded-full border shadow-sm"><Maximize2 aria-hidden className="size-3.5" /></button>
    </div>
    <p className="text-muted text-center text-xs">Live preview · exports at {exportSize.width} x {exportSize.height} px</p>
    </div>
  </div>} panel={<ControlPanel>
    <FileUpload rule={RULE} accept={IMAGE_ACCEPT} multiple onFiles={addFiles} disabled={busy || reading} />
    <Field label="Layout mode"><SegmentedControl options={[{ value: 'grid', label: 'Grid' }, { value: 'free', label: 'Free layout' }]} value={mode} onChange={(value) => { setMode(value); setSelectedFreeId(null); setLayersOpen(false); clearResult(); }} disabled={busy} /></Field>
    {mode === 'grid' && <><Field label="Grid"><div className="flex flex-wrap gap-2">{LAYOUTS.map((option) => <button key={option.id} type="button" onClick={() => { setLayoutId(option.id); setLayoutTouched(true); setCustomGrid(false); clearResult(); }} disabled={busy} aria-pressed={!customGrid && layoutId === option.id} className={pillClass(!customGrid && layoutId === option.id)}>{option.label}</button>)}<button type="button" onClick={() => { setCustomGrid(true); setLayoutTouched(true); clearResult(); }} disabled={busy} aria-pressed={customGrid} className={pillClass(customGrid)}>Custom</button></div></Field>{customGrid && <div className="flex gap-3"><Field label="Rows"><NumberField value={rows} onChange={setRows} min={1} max={4} disabled={busy} aria-label="Grid rows" className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none" /></Field><Field label="Columns"><NumberField value={cols} onChange={setCols} min={1} max={4} disabled={busy} aria-label="Grid columns" className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none" /></Field></div>}<Field label="Spacing"><NumberField value={spacing} onChange={(value) => { setSpacing(value); clearResult(); }} min={0} max={120} disabled={busy} aria-label="Spacing in pixels" className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none" /></Field></>}
    <Field label="Shape"><div className="flex flex-wrap gap-2">{ASPECT_RATIOS.map((option) => <button key={option.id} type="button" onClick={() => { setAspectRatioId(option.id); clearResult(); }} disabled={busy} aria-pressed={aspectRatioId === option.id} className={pillClass(aspectRatioId === option.id)}>{option.label}</button>)}</div></Field>
    <div className="flex gap-3"><Field label="Border"><NumberField value={borderWidth} onChange={(value) => { setBorderWidth(value); clearResult(); }} min={0} max={60} disabled={busy} aria-label="Border size in pixels" className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none" /></Field><label className="text-sm"><span className="font-semibold">Border colour</span><input type="color" value={borderColor} onChange={(event) => { setBorderColor(event.target.value); clearResult(); }} disabled={busy} className="border-border bg-background mt-1.5 h-11 w-14 rounded-full border p-1" /></label></div>
    <label className="text-sm"><span className="font-semibold">Background</span><input type="color" value={backgroundColor} onChange={(event) => { setBackgroundColor(event.target.value); clearResult(); }} disabled={busy} className="border-border bg-background mt-1.5 h-11 w-14 rounded-full border p-1" /></label>
    <Field label="Format"><SegmentedControl options={formatOptions.map((value) => ({ value, label: IMAGE_LABEL[value] }))} value={format} onChange={(value) => { setFormat(value); clearResult(); }} disabled={busy} /></Field>
    {isLossy(format) && <SliderField label="Quality" value={quality} onChange={(value) => { setQuality(value); clearResult(); }} min={10} max={100} suffix="%" disabled={busy} />}
    {notice && <Notice>{notice}</Notice>}{busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}
    <Button onClick={run} disabled={!images.length || busy || reading} className="h-12 w-full text-base">{busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <LayoutGrid aria-hidden className="size-4" />}{busy ? 'Making the collage' : 'Make the collage'}</Button>
    <ImageResultCard artifacts={result} label="Collage" /><Button size="sm" variant="ghost" onClick={resetAll} disabled={busy}>Choose different files</Button>
  </ControlPanel>} />
  {previewFile && <PageDetailModal file={previewFile} pageIndex={0} onClose={() => setPreviewFile(null)} />}
  {positionCellIndex !== null && (() => {
    const id = cells[positionCellIndex];
    const image = id ? imageById.get(id) : undefined;
    if (!image) return null;
    const cellWidth = (exportSize.width - spacing * (layout.cols - 1)) / layout.cols;
    const cellHeight = (exportSize.height - spacing * (layout.rows - 1)) / layout.rows;
    return (
      <ImagePositionModal
        file={image.file}
        cellAspect={cellWidth / cellHeight}
        focal={focalFor(image.id)}
        onChange={(focal) => updateFocal(image.id, focal)}
        onClose={() => setPositionCellIndex(null)}
      />
    );
  })()}</>;
}
