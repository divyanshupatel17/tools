'use client';

import { useEffect, useRef, useState } from 'react';
import { Crop, Loader2, Maximize2 } from 'lucide-react';
import { safeFileName } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
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
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { ImageResultCard, type ImageResultItem } from '@/components/image/image_result_card';
import { fitBox } from '@/lib/image/canvas';
import { decodeImage, type DecodedImage } from '@/lib/image/decode';
import {
  IMAGE_ACCEPT,
  IMAGE_LABEL,
  OUTPUT_FORMATS,
  imageRule,
  isLossy,
  supportsAlpha,
  type OutputFormat,
} from '@/lib/image/image_formats';
import type { Point } from '@/lib/image/perspective';
import { loadProcessor } from '@/lib/processing/processor_registry';

type CropStyle = 'rectangle' | 'perspective';

const CROP_STYLE_OPTIONS: readonly { value: CropStyle; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'perspective', label: 'Perspective' },
];

/** Corner order used everywhere a quad appears: top left, top right, bottom right, bottom left. */
type Quad = [Point, Point, Point, Point];

function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(0, point.x), width),
    y: Math.min(Math.max(0, point.y), height),
  };
}

const MAX_BYTES = 60 * 1024 * 1024;
const RULE = imageRule({ max_files: 1, max_bytes: MAX_BYTES });
const BOX = { width: 480, height: 480 };
const MIN_DISPLAY_SIZE = 24;

type AspectKey =
  'free' | '1:1' | '4:5' | '9:16' | '16:9' | '4:3' | '3:2' | '2:3' | '3:4' | '1.91:1' | '4:1';

const ASPECT_RATIOS: Record<Exclude<AspectKey, 'free'>, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '1.91:1': 1.91,
  '4:1': 4,
};

const ASPECT_OPTIONS: readonly { value: AspectKey; label: string; hint: string }[] = [
  { value: 'free', label: 'Free', hint: 'Any shape' },
  { value: '1:1', label: '1:1', hint: 'Square, Instagram post' },
  { value: '4:5', label: '4:5', hint: 'Instagram portrait' },
  { value: '9:16', label: '9:16', hint: 'Story, Reel, TikTok, Shorts' },
  { value: '16:9', label: '16:9', hint: 'YouTube, widescreen' },
  { value: '4:3', label: '4:3', hint: 'Classic photo' },
  { value: '3:2', label: '3:2', hint: 'DSLR photo' },
  { value: '2:3', label: '2:3', hint: 'Pinterest pin' },
  { value: '3:4', label: '3:4', hint: 'Portrait' },
  { value: '1.91:1', label: '1.91:1', hint: 'Facebook, X link' },
  { value: '4:1', label: '4:1', hint: 'LinkedIn banner' },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';
type Edge = 'n' | 's' | 'e' | 'w';
type Handle = Corner | Edge;

interface DragState {
  kind: 'move' | 'resize';
  handle?: Handle;
  startPointer: { x: number; y: number };
  startRect: Rect;
}

function clampRect(rect: Rect, boundsWidth: number, boundsHeight: number, minSize: number): Rect {
  let width = Math.max(minSize, Math.min(rect.width, boundsWidth));
  let height = Math.max(minSize, Math.min(rect.height, boundsHeight));
  const x = Math.min(Math.max(0, rect.x), boundsWidth - width);
  const y = Math.min(Math.max(0, rect.y), boundsHeight - height);
  width = Math.min(width, boundsWidth - x);
  height = Math.min(height, boundsHeight - y);
  return { x, y, width, height };
}

function cornerAnchor(corner: Corner, rect: Rect): { x: number; y: number } {
  switch (corner) {
    case 'nw':
      return { x: rect.x + rect.width, y: rect.y + rect.height };
    case 'ne':
      return { x: rect.x, y: rect.y + rect.height };
    case 'se':
      return { x: rect.x, y: rect.y };
    case 'sw':
      return { x: rect.x + rect.width, y: rect.y };
  }
}

function resizeFromCorner(
  corner: Corner,
  startRect: Rect,
  pointer: { x: number; y: number },
  ratio: number | null,
): Rect {
  const anchor = cornerAnchor(corner, startRect);
  const isRight = corner === 'ne' || corner === 'se';
  const isBottom = corner === 'se' || corner === 'sw';

  const width = isRight ? pointer.x - anchor.x : anchor.x - pointer.x;
  let height = isBottom ? pointer.y - anchor.y : anchor.y - pointer.y;

  if (ratio) height = width / ratio;

  const x = isRight ? anchor.x : anchor.x - width;
  const y = isBottom ? anchor.y : anchor.y - height;
  return { x, y, width, height };
}

function resizeFromEdge(edge: Edge, startRect: Rect, pointer: { x: number; y: number }): Rect {
  switch (edge) {
    case 'e': {
      const width = pointer.x - startRect.x;
      return { x: startRect.x, y: startRect.y, width, height: startRect.height };
    }
    case 'w': {
      const anchorX = startRect.x + startRect.width;
      const width = anchorX - pointer.x;
      return { x: anchorX - width, y: startRect.y, width, height: startRect.height };
    }
    case 's': {
      const height = pointer.y - startRect.y;
      return { x: startRect.x, y: startRect.y, width: startRect.width, height };
    }
    case 'n': {
      const anchorY = startRect.y + startRect.height;
      const height = anchorY - pointer.y;
      return { x: startRect.x, y: anchorY - height, width: startRect.width, height };
    }
  }
}

const HANDLE_LABEL: Record<Handle, string> = {
  nw: 'top left',
  ne: 'top right',
  se: 'bottom right',
  sw: 'bottom left',
  n: 'top',
  s: 'bottom',
  e: 'right',
  w: 'left',
};

export function CropImageWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [style, setStyle] = useState<CropStyle>('rectangle');
  const [selection, setSelection] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState<AspectKey>('free');
  const [quad, setQuad] = useState<Quad | null>(null);
  const [outputWidth, setOutputWidth] = useState(800);
  const [outputHeight, setOutputHeight] = useState(600);
  const [circle, setCircle] = useState(false);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(82);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<ImageResultItem | null>(null);
  const [viewingSource, setViewingSource] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const decodedRef = useRef<DecodedImage | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const quadDragIndex = useRef<number | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      decodedRef.current?.bitmap.close();
    },
    [],
  );

  // Circle crops need transparency; JPG cannot carry it, so switch away rather than
  // silently producing a filled square.
  function onCircleChange(checked: boolean) {
    setCircle(checked);
    if (checked && !supportsAlpha(format)) setFormat('png');
  }

  function onFormatChange(next: OutputFormat) {
    setFormat(next);
    if (circle && !supportsAlpha(next)) setCircle(false);
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    decodedRef.current?.bitmap.close();
    setFile(next);
    setDecoded(null);
    setSelection(null);
    setQuad(null);
    setResult(null);
    setNotice(null);
    setAspect('free');
    setStyle('rectangle');

    try {
      const image = await decodeImage(next);
      decodedRef.current = image;
      setDecoded(image);
      const width = image.width * 0.8;
      const height = image.height * 0.8;
      setSelection({
        x: (image.width - width) / 2,
        y: (image.height - height) / 2,
        width,
        height,
      });
      setQuad([
        { x: image.width * 0.1, y: image.height * 0.1 },
        { x: image.width * 0.9, y: image.height * 0.1 },
        { x: image.width * 0.9, y: image.height * 0.9 },
        { x: image.width * 0.1, y: image.height * 0.9 },
      ]);
      setOutputWidth(Math.round(width));
      setOutputHeight(Math.round(height));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'That file could not be read as an image.',
      );
    }
  }

  function resetFile() {
    decodedRef.current?.bitmap.close();
    decodedRef.current = null;
    setFile(null);
    setDecoded(null);
    setSelection(null);
    setQuad(null);
    setResult(null);
    setNotice(null);
  }

  const display = decoded
    ? fitBox({ width: decoded.width, height: decoded.height }, BOX, 'contain')
    : null;
  const displayWidth = display ? Math.round(display.width) : 0;
  const displayHeight = display ? Math.round(display.height) : 0;
  const scale = decoded && displayWidth > 0 ? displayWidth / decoded.width : 1;
  const minSizeReal = scale > 0 ? Math.max(4, Math.round(MIN_DISPLAY_SIZE / scale)) : 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded || displayWidth === 0 || displayHeight === 0) return;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.drawImage(decoded.bitmap, 0, 0, displayWidth, displayHeight);
  }, [decoded, displayWidth, displayHeight]);

  function applyAspect(next: AspectKey) {
    setAspect(next);
    if (next === 'free' || !decoded) return;
    const ratio = ASPECT_RATIOS[next];
    setSelection((current) => {
      if (!current) return current;
      const height = current.width / ratio;
      return clampRect({ ...current, height }, decoded.width, decoded.height, minSizeReal);
    });
  }

  function pointerToReal(clientX: number, clientY: number): { x: number; y: number } {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || scale === 0) return { x: 0, y: 0 };
    return {
      x: (((clientX - rect.left) / rect.width) * displayWidth) / scale,
      y: (((clientY - rect.top) / rect.height) * displayHeight) / scale,
    };
  }

  // Reads the pointer position and the current selection here rather than in the JSX
  // callbacks, so nothing touches a ref while the component is rendering.
  function beginDrag(event: React.PointerEvent, kind: DragState['kind'], handle?: Handle) {
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragState.current = {
      kind,
      ...(handle ? { handle } : {}),
      startPointer: pointerToReal(event.clientX, event.clientY),
      startRect: selection,
    };
    setResult(null);
  }

  // Reads which corner is being dragged here, matching beginDrag's shape, so the corner
  // handle's own onPointerDown stays a one line call.
  function beginQuadDrag(event: React.PointerEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    quadDragIndex.current = index;
    setResult(null);
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    if (quadDragIndex.current !== null && decoded) {
      const index = quadDragIndex.current;
      const pointer = clampPoint(
        pointerToReal(event.clientX, event.clientY),
        decoded.width,
        decoded.height,
      );
      setQuad((current) => {
        if (!current) return current;
        const next = [...current] as Quad;
        next[index] = pointer;
        return next;
      });
      return;
    }

    const drag = dragState.current;
    if (!drag || !decoded) return;
    const pointer = pointerToReal(event.clientX, event.clientY);

    setSelection((current) => {
      if (!current) return current;
      let next: Rect;

      if (drag.kind === 'move') {
        const dx = pointer.x - drag.startPointer.x;
        const dy = pointer.y - drag.startPointer.y;
        next = { ...drag.startRect, x: drag.startRect.x + dx, y: drag.startRect.y + dy };
      } else if (
        drag.handle &&
        (drag.handle === 'n' || drag.handle === 's' || drag.handle === 'e' || drag.handle === 'w')
      ) {
        next = resizeFromEdge(drag.handle, drag.startRect, pointer);
      } else if (drag.handle) {
        const ratio = aspect === 'free' ? null : ASPECT_RATIOS[aspect];
        next = resizeFromCorner(drag.handle as Corner, drag.startRect, pointer, ratio);
      } else {
        return current;
      }

      return clampRect(next, decoded.width, decoded.height, minSizeReal);
    });
  }

  function onOverlayPointerUp() {
    dragState.current = null;
    quadDragIndex.current = null;
  }

  function nudgeSelection(dx: number, dy: number) {
    if (!decoded) return;
    setSelection((current) => {
      if (!current) return current;
      return clampRect(
        { ...current, x: current.x + dx, y: current.y + dy },
        decoded.width,
        decoded.height,
        minSizeReal,
      );
    });
  }

  function onSelectionKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudgeSelection(-step, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudgeSelection(step, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudgeSelection(0, -step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudgeSelection(0, step);
    }
  }

  function updateDimension(key: 'x' | 'y' | 'width' | 'height', value: number) {
    if (!decoded) return;
    setSelection((current) => {
      if (!current) return current;
      const next: Rect = { ...current, [key]: value };
      if (aspect !== 'free') {
        const ratio = ASPECT_RATIOS[aspect];
        if (key === 'width') next.height = value / ratio;
        if (key === 'height') next.width = value * ratio;
      }
      return clampRect(next, decoded.width, decoded.height, minSizeReal);
    });
  }

  const busy = progress !== null;
  const canRun =
    file !== null &&
    decoded !== null &&
    !busy &&
    (style === 'rectangle'
      ? selection !== null
      : quad !== null && outputWidth > 0 && outputHeight > 0);

  async function run() {
    if (!file || !decoded || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.crop-image');
      const output = await processor(
        {
          files: [file],
          options:
            style === 'perspective' && quad
              ? {
                  x: 0,
                  y: 0,
                  width: outputWidth,
                  height: outputHeight,
                  perspective: {
                    corners: quad,
                    output_width: outputWidth,
                    output_height: outputHeight,
                  },
                  circle,
                  format,
                  quality: isLossy(format) ? quality / 100 : undefined,
                }
              : {
                  x: Math.round(selection!.x),
                  y: Math.round(selection!.y),
                  width: Math.round(selection!.width),
                  height: Math.round(selection!.height),
                  circle,
                  format,
                  quality: isLossy(format) ? quality / 100 : undefined,
                },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, caption: output.text ?? undefined });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The image could not be cropped.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFile} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const selDisplay = selection
    ? {
        x: selection.x * scale,
        y: selection.y * scale,
        width: selection.width * scale,
        height: selection.height * scale,
      }
    : null;

  const cornerHandles: Corner[] = ['nw', 'ne', 'se', 'sw'];
  // Edge handles only make sense without a locked ratio. Selected here rather than with a
  // conditional in the JSX, which the compiler lint cannot see past.
  const edgeHandles: Edge[] = aspect === 'free' ? ['n', 's', 'e', 'w'] : [];

  return (
    <>
      <ImageWorkspaceLayout
        preview={
          <div className="flex flex-col items-center">
            <p className="text-muted mb-3 self-start text-sm">
              <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
              {decoded && (
                <>
                  {' · '}
                  {decoded.width} x {decoded.height} px
                </>
              )}
            </p>

            <div
              ref={overlayRef}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
              onPointerCancel={onOverlayPointerUp}
              className="border-border bg-cream relative touch-none overflow-hidden rounded-xl border shadow-sm select-none"
              style={{ width: displayWidth || BOX.width, height: displayHeight || BOX.height }}
            >
              {decoded ? (
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 size-full"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
                </div>
              )}

              {decoded && (
                <button
                  type="button"
                  onClick={() => setViewingSource(true)}
                  aria-label={`View ${safeFileName(file.name)}`}
                  title="View the full image"
                  className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
                >
                  <Maximize2 aria-hidden className="size-3.5" />
                </button>
              )}

              {decoded && selDisplay && style === 'rectangle' && (
                <>
                  {/* Dim everything outside the crop rectangle so the result is obvious at a glance. */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 bg-black/45"
                    style={{ height: `${selDisplay.y}px` }}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45"
                    style={{ height: `${displayHeight - selDisplay.y - selDisplay.height}px` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 bg-black/45"
                    style={{
                      top: `${selDisplay.y}px`,
                      height: `${selDisplay.height}px`,
                      width: `${selDisplay.x}px`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute right-0 bg-black/45"
                    style={{
                      top: `${selDisplay.y}px`,
                      height: `${selDisplay.height}px`,
                      width: `${displayWidth - selDisplay.x - selDisplay.width}px`,
                    }}
                  />

                  <div
                    role="group"
                    tabIndex={0}
                    aria-label="Crop selection. Use the arrow keys to move it."
                    onKeyDown={onSelectionKeyDown}
                    onPointerDown={(event) => beginDrag(event, 'move')}
                    className={`border-brand focus-visible:ring-brand absolute cursor-move touch-none border-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${circle ? 'rounded-full' : ''}`}
                    style={{
                      left: `${selDisplay.x}px`,
                      top: `${selDisplay.y}px`,
                      width: `${selDisplay.width}px`,
                      height: `${selDisplay.height}px`,
                    }}
                  />

                  {cornerHandles.map((corner) => {
                    const left =
                      corner === 'nw' || corner === 'sw'
                        ? selDisplay.x
                        : selDisplay.x + selDisplay.width;
                    const top =
                      corner === 'nw' || corner === 'ne'
                        ? selDisplay.y
                        : selDisplay.y + selDisplay.height;
                    return (
                      <button
                        key={corner}
                        type="button"
                        aria-label={`Drag the ${HANDLE_LABEL[corner]} corner`}
                        onPointerDown={(event) => beginDrag(event, 'resize', corner)}
                        className="border-brand-strong bg-brand absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow-sm active:cursor-grabbing"
                        style={{ left: `${left}px`, top: `${top}px` }}
                      />
                    );
                  })}

                  {edgeHandles.map((edge) => {
                    const isHorizontal = edge === 'n' || edge === 's';
                    const left = isHorizontal
                      ? selDisplay.x + selDisplay.width / 2
                      : edge === 'w'
                        ? selDisplay.x
                        : selDisplay.x + selDisplay.width;
                    const top = isHorizontal
                      ? edge === 'n'
                        ? selDisplay.y
                        : selDisplay.y + selDisplay.height
                      : selDisplay.y + selDisplay.height / 2;
                    return (
                      <button
                        key={edge}
                        type="button"
                        aria-label={`Drag the ${HANDLE_LABEL[edge]} edge`}
                        onPointerDown={(event) => beginDrag(event, 'resize', edge)}
                        className={`border-brand-strong bg-brand absolute z-10 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 shadow-sm ${
                          isHorizontal ? 'h-3 w-6 cursor-ns-resize' : 'h-6 w-3 cursor-ew-resize'
                        }`}
                        style={{ left: `${left}px`, top: `${top}px` }}
                      />
                    );
                  })}
                </>
              )}

              {decoded && quad && style === 'perspective' && (
                <>
                  <svg
                    className="pointer-events-none absolute inset-0 size-full"
                    viewBox={`0 0 ${displayWidth} ${displayHeight}`}
                  >
                    <polygon
                      points={quad
                        .map((point) => `${point.x * scale},${point.y * scale}`)
                        .join(' ')}
                      className="fill-brand/20 stroke-brand-strong"
                      strokeWidth={2}
                    />
                  </svg>

                  {quad.map((point, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Drag the ${['top left', 'top right', 'bottom right', 'bottom left'][index]} corner`}
                      onPointerDown={(event) => beginQuadDrag(event, index)}
                      className="border-brand-strong bg-brand absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow-sm active:cursor-grabbing"
                      style={{ left: `${point.x * scale}px`, top: `${point.y * scale}px` }}
                    />
                  ))}
                </>
              )}
            </div>

            <p className="text-muted mt-2 text-center text-xs">
              {style === 'perspective'
                ? 'Drag each corner over the edges of the area to straighten'
                : selection
                  ? `${Math.round(selection.width)} x ${Math.round(selection.height)} px selected`
                  : 'Drag the selection to crop'}
            </p>
          </div>
        }
        panel={
          <ControlPanel>
            <Field label="Crop style">
              <SegmentedControl
                options={CROP_STYLE_OPTIONS}
                value={style}
                onChange={(value) => {
                  setStyle(value);
                  setResult(null);
                }}
                disabled={busy}
              />
            </Field>

            {style === 'rectangle' ? (
              <>
                <Field label="Aspect ratio">
                  <div className="flex flex-wrap gap-2">
                    {ASPECT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => applyAspect(option.value)}
                        disabled={busy}
                        aria-pressed={aspect === option.value}
                        title={option.hint}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                          aspect === option.value
                            ? 'bg-brand border-brand text-on-brand'
                            : 'border-border text-muted hover:text-foreground'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {aspect !== 'free' && (
                    <p className="text-muted mt-1.5 text-xs">
                      {ASPECT_OPTIONS.find((option) => option.value === aspect)?.hint}
                    </p>
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Width">
                    <NumberField
                      value={selection ? Math.round(selection.width) : 0}
                      onChange={(value) => updateDimension('width', value)}
                      min={minSizeReal}
                      max={decoded ? decoded.width : undefined}
                      disabled={busy || !decoded}
                      aria-label="Crop width in pixels"
                      className="border-border bg-background h-10 w-full rounded-lg border px-3 outline-none"
                    />
                  </Field>
                  <Field label="Height">
                    <NumberField
                      value={selection ? Math.round(selection.height) : 0}
                      onChange={(value) => updateDimension('height', value)}
                      min={minSizeReal}
                      max={decoded ? decoded.height : undefined}
                      disabled={busy || !decoded}
                      aria-label="Crop height in pixels"
                      className="border-border bg-background h-10 w-full rounded-lg border px-3 outline-none"
                    />
                  </Field>
                  <Field label="X offset">
                    <NumberField
                      value={selection ? Math.round(selection.x) : 0}
                      onChange={(value) => updateDimension('x', value)}
                      min={0}
                      max={decoded ? decoded.width : undefined}
                      disabled={busy || !decoded}
                      aria-label="Crop x offset in pixels"
                      className="border-border bg-background h-10 w-full rounded-lg border px-3 outline-none"
                    />
                  </Field>
                  <Field label="Y offset">
                    <NumberField
                      value={selection ? Math.round(selection.y) : 0}
                      onChange={(value) => updateDimension('y', value)}
                      min={0}
                      max={decoded ? decoded.height : undefined}
                      disabled={busy || !decoded}
                      aria-label="Crop y offset in pixels"
                      className="border-border bg-background h-10 w-full rounded-lg border px-3 outline-none"
                    />
                  </Field>
                </div>
              </>
            ) : (
              <Field
                label="Output size"
                hint="The corners you drag are warped flat to fill exactly this size."
              >
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    value={outputWidth}
                    onChange={(value) => {
                      setOutputWidth(value);
                      setResult(null);
                    }}
                    min={1}
                    max={10000}
                    disabled={busy}
                    aria-label="Output width in pixels"
                    className="border-border bg-background h-10 w-full rounded-lg border px-3 outline-none"
                  />
                  <NumberField
                    value={outputHeight}
                    onChange={(value) => {
                      setOutputHeight(value);
                      setResult(null);
                    }}
                    min={1}
                    max={10000}
                    disabled={busy}
                    aria-label="Output height in pixels"
                    className="border-border bg-background h-10 w-full rounded-lg border px-3 outline-none"
                  />
                </div>
              </Field>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={circle}
                onChange={(event) => onCircleChange(event.target.checked)}
                disabled={busy}
                className="accent-brand size-4"
              />
              <span className="font-semibold">Circle crop</span>
            </label>
            {circle && (
              <p className="text-muted -mt-2 text-xs">
                Needs a format that keeps transparency, so JPG switches to PNG automatically.
              </p>
            )}

            <Field label="Format">
              <SegmentedControl
                options={OUTPUT_FORMATS.map((value) => ({ value, label: IMAGE_LABEL[value] }))}
                value={format}
                onChange={onFormatChange}
                disabled={busy}
              />
            </Field>

            {isLossy(format) && (
              <SliderField
                label="Quality"
                value={quality}
                onChange={setQuality}
                min={1}
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
                <Crop aria-hidden className="size-4" />
              )}
              {busy ? `Cropping ${percent}%` : 'Crop image'}
            </Button>

            {result && <ImageResultCard artifacts={[result]} />}

            <Button size="sm" variant="ghost" onClick={resetFile} disabled={busy}>
              Choose a different file
            </Button>
          </ControlPanel>
        }
      />
      {viewingSource && (
        <PageDetailModal file={file} pageIndex={0} onClose={() => setViewingSource(false)} />
      )}
    </>
  );
}
