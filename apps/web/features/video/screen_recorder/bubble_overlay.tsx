'use client';

import { containRect } from '@/lib/video/crop_drag';
import type { BubbleSettings, BubbleShape } from './recorder';

export interface BubbleOverlayProps {
  /** The live preview box's own rendered size in CSS pixels (not necessarily the same aspect
   *  ratio as the canvas — a max-height cap can pinch it away from 16:9). */
  containerSize: { width: number; height: number };
  /** The canvas's own intrinsic pixel size (the recording quality's width/height), needed to work
   *  out exactly where inside `containerSize` `object-contain` actually paints it. */
  naturalSize: { width: number; height: number };
  bubble: BubbleSettings;
  onChange: (bubble: BubbleSettings) => void;
  disabled?: boolean;
}

const SHAPE_CLASS: Record<BubbleShape, string> = {
  circle: 'rounded-full',
  rounded: 'rounded-2xl',
  square: 'rounded-md',
};

/**
 * A draggable outline over the live preview showing exactly where the camera bubble will be
 * composited. `bubble.x`/`bubble.y`/`sizeRatio` are all fractions of the canvas's own pixels
 * (what `bubbleRect` in recorder.ts uses to draw), not of the container box — when the container
 * isn't exactly 16:9 (a max-height cap can pinch it away from that), `object-contain` letterboxes
 * the canvas inside it, so this maps every drag through that same letterboxed rect
 * (`containRect`, shared with the crop tool) instead of the raw container, or the drag handle and
 * the actual composited bubble drift apart.
 */
export function BubbleOverlay({ containerSize, naturalSize, bubble, onChange, disabled }: BubbleOverlayProps) {
  const rect = containRect(containerSize, naturalSize);
  // `rect` is `naturalSize` scaled uniformly, so its shorter side already IS
  // sizeRatio's reference dimension — no need to convert through natural pixels first.
  const diameter = bubble.sizeRatio * Math.min(rect.width, rect.height);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const containerRect = element.parentElement?.getBoundingClientRect();
    if (!containerRect) return;

    const moveTo = (clientX: number, clientY: number) => {
      const localX = clientX - containerRect.left - rect.left;
      const localY = clientY - containerRect.top - rect.top;
      const x = Math.min(
        Math.max(0, (localX - diameter / 2) / rect.width),
        Math.max(0, 1 - diameter / rect.width),
      );
      const y = Math.min(
        Math.max(0, (localY - diameter / 2) / rect.height),
        Math.max(0, 1 - diameter / rect.height),
      );
      onChange({ ...bubble, x, y });
    };
    moveTo(event.clientX, event.clientY);

    const onMove = (moveEvent: PointerEvent) => moveTo(moveEvent.clientX, moveEvent.clientY);
    const onUp = (upEvent: PointerEvent) => {
      element.releasePointerCapture(upEvent.pointerId);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
  }

  return (
    <div
      onPointerDown={startDrag}
      title="Drag to position the camera bubble"
      aria-label="Camera bubble position"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={bubble.x}
      tabIndex={disabled ? undefined : 0}
      className={`border-brand bg-brand/10 absolute z-10 touch-none border-2 border-dashed ${SHAPE_CLASS[bubble.shape]} ${
        disabled ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{
        left: rect.left + bubble.x * rect.width,
        top: rect.top + bubble.y * rect.height,
        width: diameter,
        height: diameter,
      }}
    />
  );
}
