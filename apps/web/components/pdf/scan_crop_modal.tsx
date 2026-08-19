'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crop,
  Loader2,
  RectangleHorizontal,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  applyPerspectiveCrop,
  applyRectCrop,
  canvasToBlob,
  detectCorners,
  loadFileToCanvas,
} from '@/lib/pdf/scan_capture';
import type { Point } from '@/lib/pdf/scan_geometry';
import { cn } from '@/lib/utils/cn';

export interface ScanCropModalProps {
  file: File | Blob;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}

type Mode = 'perspective' | 'rect' | 'ratio';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const RATIOS: Array<[string, number | null]> = [
  ['Free', null],
  ['Square', 1],
  ['A4 portrait', 1 / 1.41421],
  ['A4 landscape', 1.41421],
  ['Letter portrait', 8.5 / 11],
  ['Letter landscape', 11 / 8.5],
  ['4:3', 4 / 3],
  ['3:4', 3 / 4],
];

function quadFromRect(rect: Rect): [Point, Point, Point, Point] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

function rectFromQuad(quad: readonly [Point, Point, Point, Point]): Rect {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Crops one scanned image: freeform rectangle, ratio-locked rectangle, or a four-corner
 * perspective quad ("Auto detect" seeds it from `detectDocumentCorners`, then the user drags
 * corners to fix it up). All three modes share one canvas loaded once on mount; only the last
 * apply step differs (`applyRectCrop` vs. `applyPerspectiveCrop`), both fully on-device.
 */
export function ScanCropModal({ file, onApply, onCancel }: ScanCropModalProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mode, setMode] = useState<Mode>('perspective');
  const [ratio, setRatio] = useState<number | null>(null);
  const [quad, setQuad] = useState<[Point, Point, Point, Point] | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [applying, setApplying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Mirrors naturalSizeRef for render-time reads (aspect ratio, corner percentages): a ref read
  // during render is a lint error (react-hooks/refs) and can go stale across concurrent renders.
  const [naturalSizeState, setNaturalSizeState] = useState({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const naturalSize = useRef({ width: 0, height: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: 'corner' | 'move';
    index: number;
    startX: number;
    startY: number;
    origin: Rect | [Point, Point, Point, Point];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const canvas = await loadFileToCanvas(file);
        if (cancelled) return;
        canvasRef.current = canvas;
        naturalSize.current = { width: canvas.width, height: canvas.height };
        setNaturalSizeState({ width: canvas.width, height: canvas.height });

        const initialRect: Rect = {
          x: canvas.width * 0.04,
          y: canvas.height * 0.04,
          w: canvas.width * 0.92,
          h: canvas.height * 0.92,
        };
        setRect(initialRect);
        setQuad(detectCorners(canvas));

        objectUrl = canvas.toDataURL('image/png');
        setPreviewUrl(objectUrl);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const clampPoint = useCallback((point: Point): Point => {
    const { width, height } = naturalSize.current;
    return { x: Math.min(Math.max(point.x, 0), width), y: Math.min(Math.max(point.y, 0), height) };
  }, []);

  const toNatural = useCallback((clientX: number, clientY: number): Point => {
    const box = overlayRef.current?.getBoundingClientRect();
    const { width, height } = naturalSize.current;
    if (!box || box.width === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - box.left) / box.width) * width,
      y: ((clientY - box.top) / box.height) * height,
    };
  }, []);

  const runAutoDetect = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setQuad(detectCorners(canvas));
  }, []);

  const applyRatioToRect = useCallback((base: Rect, targetRatio: number | null): Rect => {
    if (targetRatio === null) return base;
    const { height } = naturalSize.current;
    let w = base.w;
    let h = w / targetRatio;
    if (h > height - base.y) {
      h = height - base.y;
      w = h * targetRatio;
    }
    return { x: base.x, y: base.y, w, h };
  }, []);

  function onCornerPointerDown(event: React.PointerEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'corner',
      index,
      startX: event.clientX,
      startY: event.clientY,
      origin: mode === 'perspective' ? quad! : rect!,
    };
  }

  function onOverlayPointerDown(event: React.PointerEvent) {
    if (mode === 'perspective' || !rect) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'move',
      index: -1,
      startX: event.clientX,
      startY: event.clientY,
      origin: rect,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const { width, height } = naturalSize.current;

    if (mode === 'perspective') {
      const origin = drag.origin as [Point, Point, Point, Point];
      const point = clampPoint(toNatural(event.clientX, event.clientY));
      const next = [...origin] as [Point, Point, Point, Point];
      next[drag.index] = point;
      setQuad(next);
      return;
    }

    const origin = drag.origin as Rect;
    const scaleBox = overlayRef.current?.getBoundingClientRect();
    if (!scaleBox || scaleBox.width === 0) return;
    const dx = ((event.clientX - drag.startX) / scaleBox.width) * width;
    const dy = ((event.clientY - drag.startY) / scaleBox.height) * height;

    if (drag.kind === 'move') {
      const x = Math.min(Math.max(origin.x + dx, 0), width - origin.w);
      const y = Math.min(Math.max(origin.y + dy, 0), height - origin.h);
      setRect({ ...origin, x, y });
      return;
    }

    // Corner resize: index 0 tl, 1 tr, 2 br, 3 bl — each drags two edges, anchoring the opposite corner.
    let next: Rect = { ...origin };
    if (drag.index === 0) {
      next = { x: origin.x + dx, y: origin.y + dy, w: origin.w - dx, h: origin.h - dy };
    } else if (drag.index === 1) {
      next = { x: origin.x, y: origin.y + dy, w: origin.w + dx, h: origin.h - dy };
    } else if (drag.index === 2) {
      next = { x: origin.x, y: origin.y, w: origin.w + dx, h: origin.h + dy };
    } else {
      next = { x: origin.x + dx, y: origin.y, w: origin.w - dx, h: origin.h + dy };
    }
    next.w = Math.max(20, Math.min(next.w, width - next.x));
    next.h = Math.max(20, Math.min(next.h, height - next.y));
    next.x = Math.min(Math.max(next.x, 0), width - 20);
    next.y = Math.min(Math.max(next.y, 0), height - 20);

    setRect(applyRatioToRect(next, ratio));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const displayQuad = mode === 'perspective' ? quad : rect ? quadFromRect(rect) : null;

  const svgPoints = useMemo(() => {
    if (!displayQuad) return '';
    const { width, height } = naturalSizeState;
    if (width === 0) return '';
    return displayQuad.map((p) => `${(p.x / width) * 100},${(p.y / height) * 100}`).join(' ');
  }, [displayQuad, naturalSizeState]);

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setApplying(true);
    try {
      let output: HTMLCanvasElement;
      if (mode === 'perspective' && quad) {
        output = applyPerspectiveCrop(canvas, quad);
      } else if (rect) {
        output = applyRectCrop(canvas, rect.x, rect.y, rect.w, rect.h);
      } else {
        return;
      }
      const blob = await canvasToBlob(output, 'image/png');
      onApply(blob);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop scanned page"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
    >
      <div className="bg-surface flex max-h-full w-full max-w-2xl flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold">Crop this page</span>
          <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Cancel">
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['perspective', 'Perspective', Sparkles],
              ['rect', 'Freeform', Crop],
              ['ratio', 'Ratio', RectangleHorizontal],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value === mode) return;
                if (value === 'perspective') {
                  setQuad(rect ? quadFromRect(rect) : quad);
                } else if (quad && !rect) {
                  setRect(rectFromQuad(quad));
                } else if (mode === 'perspective' && quad) {
                  setRect(rectFromQuad(quad));
                }
                setMode(value);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                mode === value
                  ? 'bg-brand border-brand text-on-brand'
                  : 'border-border text-muted hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          ))}

          {mode === 'perspective' && (
            <Button size="sm" variant="secondary" onClick={runAutoDetect} className="ml-auto">
              <Sparkles aria-hidden className="size-4" />
              Auto detect
            </Button>
          )}
        </div>

        {mode === 'ratio' && (
          <div className="flex flex-wrap gap-1.5">
            {RATIOS.map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setRatio(value);
                  if (rect) setRect(applyRatioToRect(rect, value));
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  ratio === value
                    ? 'bg-brand border-brand text-on-brand'
                    : 'border-border text-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-cream flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-xl p-3">
          {status === 'loading' && (
            <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
          )}
          {status === 'error' && (
            <span className="text-danger flex items-center gap-2 text-sm">
              <TriangleAlert aria-hidden className="size-4" />
              This image could not be loaded.
            </span>
          )}
          {status === 'ready' && previewUrl && (
            <div
              ref={overlayRef}
              onPointerDown={onOverlayPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="relative max-h-[55vh] max-w-full touch-none select-none"
              style={{ aspectRatio: `${naturalSizeState.width} / ${naturalSizeState.height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                draggable={false}
                className="pointer-events-none size-full max-h-[55vh] object-contain"
              />
              {displayQuad && (
                <svg
                  className="pointer-events-none absolute inset-0 size-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polygon
                    points={svgPoints}
                    fill="rgba(255, 193, 7, 0.18)"
                    stroke="rgb(255, 193, 7)"
                    strokeWidth={0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              {displayQuad?.map((point, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Drag corner ${index + 1}`}
                  onPointerDown={(event) => onCornerPointerDown(event, index)}
                  className="border-brand-strong bg-brand absolute size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow-sm active:cursor-grabbing"
                  style={{
                    left: `${(point.x / naturalSizeState.width) * 100}%`,
                    top: `${(point.y / naturalSizeState.height) * 100}%`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={apply} disabled={status !== 'ready' || applying}>
            {applying ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden className="size-4" />
            )}
            {applying ? 'Cropping' : 'Apply crop'}
          </Button>
        </div>
      </div>
    </div>
  );
}
