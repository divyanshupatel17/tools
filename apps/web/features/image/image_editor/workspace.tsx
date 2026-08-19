'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Circle,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Paintbrush,
  Redo2,
  RotateCw,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { safeFileName, validateFiles } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import {
  ControlPanel,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  SliderField,
} from '@/components/image/control_panel';
import { ImageResultCard, type ImageResultItem } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { fitBox } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import {
  IMAGE_ACCEPT,
  IMAGE_LABEL,
  OUTPUT_FORMATS,
  imageRule,
  isLossy,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { renderComposition } from './compositor';
import {
  createDocument,
  createImageLayer,
  createPathLayer,
  createShapeLayer,
  createTextLayer,
  layerBounds,
  type Layer,
  type PathLayer,
  type ShapeLayer,
  type TextLayer,
} from './editor_state';
import { screenToDocumentPoint, stageFinalSize, type StageGeometry } from './geometry';
import { useEditorHistory } from './history';

const MAX_BYTES = 40 * 1024 * 1024;
const RULE_BASE = imageRule({ max_files: 1, max_bytes: MAX_BYTES });
const RULE_OVERLAY = imageRule({ max_files: 1, max_bytes: MAX_BYTES });
const PREVIEW_MAX_DIM = 640;

type Tool = 'select' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'brush';

const TOOL_OPTIONS: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'brush', label: 'Brush', icon: Paintbrush },
];

type Drag =
  | { kind: 'move'; layerId: string; origin: { x: number; y: number }; snapshot: Layer }
  | { kind: 'shape'; layerId: string }
  | { kind: 'path'; layerId: string };

/**
 * Reads a theme colour for the canvas. `getPropertyValue` hands back the literal `var(--other)`
 * text when a token aliases another token, and canvas silently ignores a colour it cannot parse,
 * so the alias chain is followed here until a real value appears.
 */
function resolveThemeColor(name: string, depth = 0): string | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return null;
  const alias = /^var\(\s*(--[\w-]+)/.exec(raw);
  if (alias?.[1]) return depth >= 4 ? null : resolveThemeColor(alias[1], depth + 1);
  return raw;
}

/** Local, UI-only mirror of the compositor's forward transform, used to place the selection outline. */
function documentPointToStage(
  point: { x: number; y: number },
  geometry: StageGeometry,
): { x: number; y: number } {
  const contentWidth = geometry.documentWidth * geometry.scale;
  const contentHeight = geometry.documentHeight * geometry.scale;
  const final = stageFinalSize(geometry);

  const localX = point.x * geometry.scale - contentWidth / 2;
  const localY = point.y * geometry.scale - contentHeight / 2;
  const flippedX = geometry.transform.flip_h ? -localX : localX;
  const flippedY = geometry.transform.flip_v ? -localY : localY;

  const rad = (geometry.transform.rotate * Math.PI) / 180;
  const rotatedX = flippedX * Math.cos(rad) - flippedY * Math.sin(rad);
  const rotatedY = flippedX * Math.sin(rad) + flippedY * Math.cos(rad);

  return { x: rotatedX + final.width / 2, y: rotatedY + final.height / 2 };
}

function hitTestLayer(layers: readonly Layer[], point: { x: number; y: number }): Layer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]!;
    const bounds = layerBounds(layer);
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return layer;
    }
  }
  return null;
}

function translateLayer(layer: Layer, dx: number, dy: number): Layer {
  if (layer.type === 'path') {
    return {
      ...layer,
      points: layer.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    };
  }
  return { ...layer, x: layer.x + dx, y: layer.y + dy };
}

function layerTypeLabel(layer: Layer): string {
  switch (layer.type) {
    case 'text':
      return `Text: ${layer.text || 'Empty'}`;
    case 'shape':
      return layer.shape.charAt(0).toUpperCase() + layer.shape.slice(1);
    case 'path':
      return 'Freehand';
    case 'image':
      return 'Picture';
    default:
      return 'Layer';
  }
}

function nextRotation(rotate: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return ((rotate + 90) % 360) as 0 | 90 | 180 | 270;
}

export function ImageEditorWorkspace() {
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [baseBitmap, setBaseBitmap] = useState<ImageBitmap | null>(null);
  const [overlayFiles, setOverlayFiles] = useState<File[]>([]);
  const [overlayBitmaps, setOverlayBitmaps] = useState<ReadonlyMap<string, ImageBitmap>>(new Map());

  const { doc, selectedLayerId, commit, replace, select, undo, redo, reset, canUndo, canRedo } =
    useEditorHistory(createDocument());

  const [tool, setTool] = useState<Tool>('select');
  const [brushColor, setBrushColor] = useState('#1b1a17');
  const [brushSize, setBrushSize] = useState(10);

  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<ImageResultItem[]>([]);
  const [viewingSource, setViewingSource] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const baseBitmapRef = useRef<ImageBitmap | null>(null);
  const overlayBitmapsRef = useRef<ReadonlyMap<string, ImageBitmap>>(new Map());
  // The file list is mirrored in a ref so two quick overlay picks cannot both read the same
  // stale length and claim the same file index.
  const overlayFilesRef = useRef<File[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const gestureStartRef = useRef<{ doc: typeof doc; selected: string | null } | null>(null);

  useEffect(() => {
    baseBitmapRef.current = baseBitmap;
  }, [baseBitmap]);
  useEffect(() => {
    overlayBitmapsRef.current = overlayBitmaps;
  }, [overlayBitmaps]);

  useEffect(
    () => () => {
      abort.current?.abort();
      baseBitmapRef.current?.close();
      for (const bitmap of overlayBitmapsRef.current.values()) bitmap.close();
    },
    [],
  );

  const documentWidth = baseBitmap?.width ?? 0;
  const documentHeight = baseBitmap?.height ?? 0;
  const scale =
    documentWidth > 0 ? Math.min(1, PREVIEW_MAX_DIM / Math.max(documentWidth, documentHeight)) : 1;

  const geometry: StageGeometry = useMemo(
    () => ({
      documentWidth,
      documentHeight,
      scale,
      transform: doc.transform,
      borderPx: doc.border.width * scale,
    }),
    [documentWidth, documentHeight, scale, doc.transform, doc.border.width],
  );

  /** Pixel size of the file the run button will write, border and rotation included. */
  const exportSize = useMemo(
    () =>
      stageFinalSize({
        documentWidth,
        documentHeight,
        scale: 1,
        transform: doc.transform,
        borderPx: doc.border.width,
      }),
    [documentWidth, documentHeight, doc.transform, doc.border.width],
  );

  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseBitmap) return;

    const rendered = renderComposition({
      base: baseBitmap,
      documentWidth,
      documentHeight,
      layers: doc.layers,
      imageBitmaps: overlayBitmaps,
      adjustments: doc.adjustments,
      border: doc.border,
      background: doc.background,
      transform: doc.transform,
      scale,
    });

    const final = stageFinalSize(geometry);
    canvas.width = Math.max(1, Math.round(final.width));
    canvas.height = Math.max(1, Math.round(final.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rendered.canvas, 0, 0);

    if (selectedLayer) {
      const bounds = layerBounds(selectedLayer);
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
      ].map((corner) => documentPointToStage(corner, geometry));

      ctx.save();
      const ring = resolveThemeColor('--focus-ring') ?? resolveThemeColor('--ink');
      if (ring) ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(corners[0]!.x, corners[0]!.y);
      for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }, [
    baseBitmap,
    documentWidth,
    documentHeight,
    doc,
    overlayBitmaps,
    scale,
    geometry,
    selectedLayer,
  ]);

  function closeEverything() {
    baseBitmapRef.current?.close();
    baseBitmapRef.current = null;
    for (const bitmap of overlayBitmapsRef.current.values()) bitmap.close();
    overlayBitmapsRef.current = new Map();
    overlayFilesRef.current = [];
  }

  async function addBaseFile(files: File[]) {
    setNotice(null);
    const check = validateFiles(files, RULE_BASE);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That file could not be used.');
      return;
    }
    const picked = files[0];
    if (!picked) return;

    try {
      const decoded = await decodeImage(picked);
      closeEverything();
      setBaseFile(picked);
      setBaseBitmap(decoded.bitmap);
      setOverlayFiles([]);
      setOverlayBitmaps(new Map());
      setTool('select');
      reset(createDocument());
      setResult([]);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'That file could not be read as an image.',
      );
    }
  }

  function resetFile() {
    abort.current?.abort();
    closeEverything();
    setBaseFile(null);
    setBaseBitmap(null);
    setOverlayFiles([]);
    setOverlayBitmaps(new Map());
    setTool('select');
    reset(createDocument());
    setResult([]);
    setNotice(null);
  }

  async function handleOverlayFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (!picked || !baseBitmap) return;

    const check = validateFiles([picked], RULE_OVERLAY);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That file could not be used.');
      return;
    }

    try {
      const decoded = await decodeImage(picked);
      // Index 0 is the base image, so the first overlay lands at 1.
      const fileIndex = 1 + overlayFilesRef.current.length;
      overlayFilesRef.current = [...overlayFilesRef.current, picked];

      const box = Math.min(documentWidth, documentHeight) * 0.4;
      const fitted = fitBox(
        { width: decoded.width, height: decoded.height },
        { width: box, height: box },
        'contain',
      );
      const x = (documentWidth - fitted.width) / 2;
      const y = (documentHeight - fitted.height) / 2;
      const layer = createImageLayer(x, y, fitted.width, fitted.height, fileIndex);

      setOverlayFiles([...overlayFilesRef.current]);
      setOverlayBitmaps((prev) => {
        const next = new Map(prev);
        next.set(layer.id, decoded.bitmap);
        return next;
      });
      commit({ ...doc, layers: [...doc.layers, layer] }, layer.id);
      setTool('select');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That picture could not be read.');
    }
  }

  function getDocPoint(
    event: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas || !baseBitmap) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    // The canvas is allowed to shrink below its backing store on a narrow screen, so pointer
    // offsets are scaled back into backing store pixels before the geometry inversion.
    const ratio = canvas.width / rect.width;
    return screenToDocumentPoint(
      rect.left + (event.clientX - rect.left) * ratio,
      rect.top + (event.clientY - rect.top) * ratio,
      rect,
      geometry,
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!baseBitmap) return;
    const point = getDocPoint(event);
    if (!point) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'select') {
      const hit = hitTestLayer(doc.layers, point);
      select(hit?.id ?? null);
      if (hit) {
        gestureStartRef.current = { doc, selected: selectedLayerId };
        dragRef.current = { kind: 'move', layerId: hit.id, origin: point, snapshot: hit };
      }
      return;
    }

    if (tool === 'text') {
      const layer = createTextLayer(point.x, point.y);
      commit({ ...doc, layers: [...doc.layers, layer] }, layer.id);
      setTool('select');
      return;
    }

    if (tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
      const layer = createShapeLayer(tool, point.x, point.y);
      gestureStartRef.current = { doc, selected: selectedLayerId };
      replace({ ...doc, layers: [...doc.layers, layer] }, layer.id);
      dragRef.current = { kind: 'shape', layerId: layer.id };
      return;
    }

    if (tool === 'brush') {
      const layer = createPathLayer(point.x, point.y, brushColor, brushSize);
      gestureStartRef.current = { doc, selected: selectedLayerId };
      replace({ ...doc, layers: [...doc.layers, layer] }, layer.id);
      dragRef.current = { kind: 'path', layerId: layer.id };
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = getDocPoint(event);
    if (!point) return;

    if (drag.kind === 'move') {
      const dx = point.x - drag.origin.x;
      const dy = point.y - drag.origin.y;
      const moved = translateLayer(drag.snapshot, dx, dy);
      replace({
        ...doc,
        layers: doc.layers.map((layer) => (layer.id === moved.id ? moved : layer)),
      });
      return;
    }

    if (drag.kind === 'shape') {
      replace({
        ...doc,
        layers: doc.layers.map((layer) =>
          layer.id === drag.layerId && layer.type === 'shape'
            ? { ...layer, width: point.x - layer.x, height: point.y - layer.y }
            : layer,
        ),
      });
      return;
    }

    if (drag.kind === 'path') {
      replace({
        ...doc,
        layers: doc.layers.map((layer) =>
          layer.id === drag.layerId && layer.type === 'path'
            ? { ...layer, points: [...layer.points, point] }
            : layer,
        ),
      });
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start) return;

    if (drag.kind === 'shape') {
      const layer = doc.layers.find((item) => item.id === drag.layerId);
      const tooSmall =
        layer?.type === 'shape' && Math.abs(layer.width) < 2 && Math.abs(layer.height) < 2;
      if (tooSmall) {
        replace(start.doc, start.selected);
        setTool('select');
        return;
      }
    }

    // Rewind to the state the gesture began from, then commit the finished state on top, so the
    // whole drag collapses into a single undo step that also restores the earlier selection.
    replace(start.doc, start.selected);
    commit(doc, selectedLayerId);
    if (drag.kind !== 'move') setTool('select');
  }

  function patchLayer<T extends Layer>(id: string, patch: Partial<T>) {
    commit({
      ...doc,
      layers: doc.layers.map((layer) =>
        layer.id === id ? ({ ...layer, ...patch } as Layer) : layer,
      ),
    });
  }

  function moveSelected(direction: 'up' | 'down') {
    if (!selectedLayerId) return;
    const index = doc.layers.findIndex((layer) => layer.id === selectedLayerId);
    if (index < 0) return;
    const swapWith = direction === 'up' ? index + 1 : index - 1;
    if (swapWith < 0 || swapWith >= doc.layers.length) return;
    const layers = [...doc.layers];
    const a = layers[index]!;
    const b = layers[swapWith]!;
    layers[index] = b;
    layers[swapWith] = a;
    commit({ ...doc, layers });
  }

  function deleteSelected() {
    if (!selectedLayerId) return;
    commit({ ...doc, layers: doc.layers.filter((layer) => layer.id !== selectedLayerId) }, null);
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedLayer) return;
    const moved = translateLayer(selectedLayer, dx, dy);
    commit({
      ...doc,
      layers: doc.layers.map((layer) => (layer.id === moved.id ? moved : layer)),
    });
  }

  // Keyboard path for the canvas: the arrow keys move whatever is selected and Delete removes it.
  // Bound to the canvas itself rather than the window, so nothing fires while a panel input has
  // focus.
  function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!selectedLayer) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
      return;
    }
    const step = (event.shiftKey ? 10 : 1) / (scale || 1);
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudgeSelected(-step, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudgeSelected(step, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudgeSelected(0, -step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudgeSelected(0, step);
    }
  }

  const busy = progress !== null;
  const canRun = baseBitmap !== null && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  async function run() {
    if (!canRun || !baseFile) return;
    setNotice(null);
    setResult([]);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.image-editor');
      const output = await processor(
        {
          files: [baseFile, ...overlayFiles],
          options: {
            layers: doc.layers,
            adjustments: doc.adjustments,
            border: doc.border,
            background: doc.background,
            transform: doc.transform,
            output_format: format,
            quality: quality / 100,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult([
          {
            artifact,
            caption: `${Math.round(exportSize.width)} x ${Math.round(exportSize.height)} px`,
          },
        ]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The image could not be edited.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  if (!baseFile || !baseBitmap) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE_BASE} accept={IMAGE_ACCEPT} onFiles={addBaseFile} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const cursorClass = tool === 'select' ? 'cursor-default' : 'cursor-crosshair';
  const pillClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${
      active
        ? 'bg-brand border-brand text-on-brand'
        : 'border-border text-muted hover:text-foreground'
    }`;

  return (
    <>
      <ImageWorkspaceLayout
        preview={
          <div className="flex flex-col items-center">
            <p className="text-muted mb-3 self-start text-sm">
              <span className="text-foreground font-semibold">{safeFileName(baseFile.name)}</span>
              {' · '}
              {documentWidth} x {documentHeight} px
            </p>

            <div className="mb-3 flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={undo} disabled={!canUndo}>
                <Undo2 aria-hidden className="size-4" />
                Undo
              </Button>
              <Button variant="secondary" size="sm" onClick={redo} disabled={!canRedo}>
                <Redo2 aria-hidden className="size-4" />
                Redo
              </Button>
            </div>

            <div className="relative">
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="application"
                aria-label="Editing canvas. Click or drag to use the selected tool. Arrow keys move the selected item and Delete removes it."
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleCanvasKeyDown}
                className={`border-border focus-visible:ring-brand block h-auto max-w-full touch-none rounded-xl border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${cursorClass}`}
              />
              <button
                type="button"
                onClick={() => setViewingSource(true)}
                aria-label={`View ${safeFileName(baseFile.name)}`}
                title="View the full image"
                className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
              >
                <Maximize2 aria-hidden className="size-3.5" />
              </button>
            </div>

            <p className="text-muted mt-2 text-center text-xs">
              Live preview at {Math.round(exportSize.width)} x {Math.round(exportSize.height)} px
              when saved
            </p>
          </div>
        }
        panel={
          <ControlPanel>
            <Field label="Tool" hint="One tool is active at a time.">
              <div className="flex flex-wrap gap-2">
                {TOOL_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setTool(option.id);
                        select(null);
                      }}
                      aria-pressed={tool === option.id}
                      className={`inline-flex items-center gap-1.5 ${pillClass(tool === option.id)}`}
                    >
                      <Icon aria-hidden className="size-4" />
                      {option.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => overlayInputRef.current?.click()}
                  className={`inline-flex items-center gap-1.5 ${pillClass(false)}`}
                >
                  <ImagePlus aria-hidden className="size-4" />
                  Picture
                </button>
              </div>
            </Field>

            {tool === 'brush' && (
              <div className="flex gap-3">
                <label className="text-sm">
                  <span className="font-semibold">Brush colour</span>
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(event) => setBrushColor(event.target.value)}
                    className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
                  />
                </label>
                <div className="flex-1">
                  <SliderField
                    label="Brush size"
                    value={brushSize}
                    onChange={setBrushSize}
                    min={1}
                    max={80}
                  />
                </div>
              </div>
            )}

            <input
              ref={overlayInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              onChange={handleOverlayFile}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />

            <Field label="Layers">
              {doc.layers.length === 0 ? (
                <p className="text-muted text-xs">
                  Nothing added yet. Draw or place something on the picture.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {doc.layers.map((layer, index) => (
                    <li key={layer.id}>
                      <button
                        type="button"
                        onClick={() => {
                          select(layer.id);
                          setTool('select');
                        }}
                        aria-pressed={selectedLayerId === layer.id}
                        className={`w-full truncate rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                          selectedLayerId === layer.id
                            ? 'bg-brand border-brand text-on-brand'
                            : 'border-border text-muted hover:text-foreground'
                        }`}
                      >
                        {index + 1}. {layerTypeLabel(layer)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            {selectedLayer && (
              <div className="border-border flex flex-col gap-3 rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{layerTypeLabel(selectedLayer)}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveSelected('up')}
                      aria-label="Bring forward"
                      title="Bring forward"
                    >
                      <ChevronUp aria-hidden className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveSelected('down')}
                      aria-label="Send backward"
                      title="Send backward"
                    >
                      <ChevronDown aria-hidden className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deleteSelected}
                      aria-label="Delete layer"
                      title="Delete layer"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                </div>

                {selectedLayer.type === 'text' && (
                  <>
                    <Field label="Text">
                      <input
                        type="text"
                        value={selectedLayer.text}
                        onChange={(event) =>
                          patchLayer<TextLayer>(selectedLayer.id, { text: event.target.value })
                        }
                        className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                      />
                    </Field>
                    <SliderField
                      label="Size"
                      value={selectedLayer.font_size}
                      onChange={(value) =>
                        patchLayer<TextLayer>(selectedLayer.id, { font_size: value })
                      }
                      min={12}
                      max={200}
                    />
                    <div className="flex gap-3">
                      <label className="flex-1 text-sm">
                        <span className="font-semibold">Colour</span>
                        <input
                          type="color"
                          value={selectedLayer.color}
                          onChange={(event) =>
                            patchLayer<TextLayer>(selectedLayer.id, { color: event.target.value })
                          }
                          className="border-border bg-background mt-1.5 h-11 w-full cursor-pointer rounded-full border p-1"
                        />
                      </label>
                      <Field label="Weight">
                        <SegmentedControl
                          options={[
                            { value: 'regular', label: 'Regular' },
                            { value: 'bold', label: 'Bold' },
                          ]}
                          value={selectedLayer.font_weight === 700 ? 'bold' : 'regular'}
                          onChange={(value) =>
                            patchLayer<TextLayer>(selectedLayer.id, {
                              font_weight: value === 'bold' ? 700 : 400,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Align">
                      <SegmentedControl
                        options={[
                          { value: 'left', label: 'Left' },
                          { value: 'center', label: 'Center' },
                          { value: 'right', label: 'Right' },
                        ]}
                        value={selectedLayer.align}
                        onChange={(value) =>
                          patchLayer<TextLayer>(selectedLayer.id, { align: value })
                        }
                      />
                    </Field>
                  </>
                )}

                {selectedLayer.type === 'shape' && (
                  <>
                    <SliderField
                      label="Stroke width"
                      value={selectedLayer.stroke_width}
                      onChange={(value) =>
                        patchLayer<ShapeLayer>(selectedLayer.id, { stroke_width: value })
                      }
                      min={0}
                      max={60}
                    />
                    <label className="text-sm">
                      <span className="font-semibold">Stroke colour</span>
                      <input
                        type="color"
                        value={selectedLayer.stroke_color}
                        onChange={(event) =>
                          patchLayer<ShapeLayer>(selectedLayer.id, {
                            stroke_color: event.target.value,
                          })
                        }
                        className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
                      />
                    </label>
                    <Field label="Fill">
                      <SegmentedControl
                        options={[
                          { value: 'hollow', label: 'Hollow' },
                          { value: 'filled', label: 'Filled' },
                        ]}
                        value={selectedLayer.fill_color ? 'filled' : 'hollow'}
                        onChange={(value) =>
                          patchLayer<ShapeLayer>(selectedLayer.id, {
                            fill_color:
                              value === 'filled' ? (selectedLayer.fill_color ?? '#ffc928') : null,
                          })
                        }
                      />
                    </Field>
                    {selectedLayer.fill_color && (
                      <label className="text-sm">
                        <span className="font-semibold">Fill colour</span>
                        <input
                          type="color"
                          value={selectedLayer.fill_color}
                          onChange={(event) =>
                            patchLayer<ShapeLayer>(selectedLayer.id, {
                              fill_color: event.target.value,
                            })
                          }
                          className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
                        />
                      </label>
                    )}
                  </>
                )}

                {selectedLayer.type === 'path' && (
                  <>
                    <SliderField
                      label="Brush size"
                      value={selectedLayer.size}
                      onChange={(value) => patchLayer<PathLayer>(selectedLayer.id, { size: value })}
                      min={1}
                      max={80}
                    />
                    <label className="text-sm">
                      <span className="font-semibold">Colour</span>
                      <input
                        type="color"
                        value={selectedLayer.color}
                        onChange={(event) =>
                          patchLayer<PathLayer>(selectedLayer.id, { color: event.target.value })
                        }
                        className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
                      />
                    </label>
                  </>
                )}

                {selectedLayer.type === 'image' && (
                  <p className="text-muted text-xs">Drag it on the picture to move it.</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Adjustments</p>
              <SliderField
                label="Brightness"
                value={doc.adjustments.brightness}
                onChange={(value) =>
                  commit({ ...doc, adjustments: { ...doc.adjustments, brightness: value } })
                }
                min={50}
                max={150}
                suffix="%"
              />
              <SliderField
                label="Contrast"
                value={doc.adjustments.contrast}
                onChange={(value) =>
                  commit({ ...doc, adjustments: { ...doc.adjustments, contrast: value } })
                }
                min={50}
                max={150}
                suffix="%"
              />
              <SliderField
                label="Saturation"
                value={doc.adjustments.saturation}
                onChange={(value) =>
                  commit({ ...doc, adjustments: { ...doc.adjustments, saturation: value } })
                }
                min={0}
                max={200}
                suffix="%"
              />
              <SliderField
                label="Blur"
                value={doc.adjustments.blur}
                onChange={(value) =>
                  commit({ ...doc, adjustments: { ...doc.adjustments, blur: value } })
                }
                min={0}
                max={20}
              />
            </div>

            <Field label="Border" hint="Width in pixels, plus its colour.">
              <div className="flex gap-3">
                <NumberField
                  value={doc.border.width}
                  onChange={(value) => commit({ ...doc, border: { ...doc.border, width: value } })}
                  min={0}
                  max={200}
                  aria-label="Border width in pixels"
                  className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                />
                <input
                  type="color"
                  aria-label="Border colour"
                  value={doc.border.color}
                  onChange={(event) =>
                    commit({ ...doc, border: { ...doc.border, color: event.target.value } })
                  }
                  className="border-border bg-background h-11 w-14 shrink-0 cursor-pointer rounded-full border p-1"
                />
              </div>
            </Field>

            <label className="text-sm">
              <span className="font-semibold">Background</span>
              <input
                type="color"
                value={doc.background}
                onChange={(event) => commit({ ...doc, background: event.target.value })}
                className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
              />
            </label>

            <Field label="Rotate and flip">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Rotate a quarter turn"
                  onClick={() =>
                    commit({
                      ...doc,
                      transform: { ...doc.transform, rotate: nextRotation(doc.transform.rotate) },
                    })
                  }
                >
                  <RotateCw aria-hidden className="size-4" />
                  Rotate
                </Button>
                <Button
                  variant={doc.transform.flip_h ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={doc.transform.flip_h}
                  aria-label="Flip left to right"
                  onClick={() =>
                    commit({
                      ...doc,
                      transform: { ...doc.transform, flip_h: !doc.transform.flip_h },
                    })
                  }
                >
                  <FlipHorizontal2 aria-hidden className="size-4" />
                  Flip
                </Button>
                <Button
                  variant={doc.transform.flip_v ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={doc.transform.flip_v}
                  aria-label="Flip top to bottom"
                  onClick={() =>
                    commit({
                      ...doc,
                      transform: { ...doc.transform, flip_v: !doc.transform.flip_v },
                    })
                  }
                >
                  <FlipVertical2 aria-hidden className="size-4" />
                  Flip
                </Button>
              </div>
            </Field>

            <Field label="Format">
              <SegmentedControl
                options={OUTPUT_FORMATS.map((value) => ({ value, label: IMAGE_LABEL[value] }))}
                value={format}
                onChange={setFormat}
                disabled={busy}
              />
            </Field>

            {isLossy(format) && (
              <SliderField
                label="Quality"
                value={quality}
                onChange={setQuality}
                min={10}
                max={100}
                suffix="%"
                disabled={busy}
              />
            )}

            {notice && <Notice>{notice}</Notice>}

            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
              {busy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden className="size-4" />
              )}
              {busy ? `Rendering ${percent}%` : 'Save the edited picture'}
            </Button>

            <ImageResultCard artifacts={result} label="Result" />

            <Button size="sm" variant="ghost" onClick={resetFile} disabled={busy}>
              Choose a different file
            </Button>
          </ControlPanel>
        }
      />
      {viewingSource && (
        <PageDetailModal file={baseFile} pageIndex={0} onClose={() => setViewingSource(false)} />
      )}
    </>
  );
}
