'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, X } from 'lucide-react';
import { safeFileName } from '@tools/file_utils';
import { Button } from '@/components/ui/button';

export interface ImagePositionModalProps {
  file: File;
  /** Width divided by height of the cell this picture sits in. */
  cellAspect: number;
  focal: { x: number; y: number };
  onChange: (focal: { x: number; y: number }) => void;
  onClose: () => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How much of the source image, along each axis, fits inside a "cover" fit box of the given
 * aspect ratio. 1 means that whole axis is visible and there is no room to pan; below 1 means
 * part of the image is cropped off there, and the focal point picks which part.
 */
function coverWindow(imageAspect: number, cellAspect: number): { w: number; h: number } {
  if (imageAspect > cellAspect) return { w: cellAspect / imageAspect, h: 1 };
  return { w: 1, h: imageAspect / cellAspect };
}

/**
 * Lets a visitor choose which part of a picture shows inside its collage cell: the whole
 * picture stays visible but dimmed, a bright window marks what the cell currently crops to,
 * and dragging that window updates the focal point live in the real preview behind this modal.
 */
export function ImagePositionModal({
  file,
  cellAspect,
  focal,
  onChange,
  onClose,
}: ImagePositionModalProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; from: { x: number; y: number } } | null>(
    null,
  );

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const window_ = useMemo(
    () => coverWindow(naturalSize.width / naturalSize.height, cellAspect),
    [naturalSize, cellAspect],
  );

  function beginDrag(event: React.PointerEvent) {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, from: focal };
  }

  function onPointerMove(event: React.PointerEvent) {
    const current = drag.current;
    const frame = frameRef.current;
    if (!current || !frame) return;
    const rect = frame.getBoundingClientRect();
    const dxFrac = (event.clientX - current.startX) / rect.width;
    const dyFrac = (event.clientY - current.startY) / rect.height;
    const roomX = 1 - window_.w;
    const roomY = 1 - window_.h;
    onChange({
      x: roomX > 0.001 ? clamp01(current.from.x + dxFrac / roomX) : focal.x,
      y: roomY > 0.001 ? clamp01(current.from.y + dyFrac / roomY) : focal.y,
    });
  }

  function endDrag(event: React.PointerEvent) {
    if (frameRef.current?.hasPointerCapture(event.pointerId)) {
      frameRef.current.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  const left = focal.x * (1 - window_.w) * 100;
  const top = focal.y * (1 - window_.h) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Adjust which part of ${safeFileName(file.name)} shows`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
    >
      <div className="bg-surface flex max-h-full w-full max-w-md flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold">Adjust position</span>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        <p className="text-muted text-xs">Drag the bright area to choose what shows in the frame.</p>

        <div className="bg-cream flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-xl p-3">
          {src && (
            <div
              ref={frameRef}
              className="relative max-h-[50vh] max-w-full touch-none select-none"
              style={{ aspectRatio: `${naturalSize.width} / ${naturalSize.height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
                }}
                className="pointer-events-none block size-full rounded-lg object-contain opacity-30"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute inset-0 block size-full rounded-lg object-contain"
                style={{
                  clipPath: `inset(${top}% ${100 - left - window_.w * 100}% ${100 - top - window_.h * 100}% ${left}%)`,
                }}
              />
              <div
                onPointerDown={beginDrag}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="border-brand-strong absolute cursor-move touch-none rounded-sm border-2"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${window_.w * 100}%`,
                  height: `${window_.h * 100}%`,
                }}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => onChange({ x: 0.5, y: 0.5 })}>
            <Crosshair aria-hidden className="size-4" />
            Center
          </Button>
          <Button className="flex-1" onClick={onClose}>
            <Check aria-hidden className="size-4" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
