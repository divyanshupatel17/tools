'use client';

import { useRef } from 'react';
import { timeTicks } from '@/lib/video/timeline';
import { formatDuration } from '@/lib/video/video_formats';

export interface RangeTrimProps {
  duration: number;
  start: number;
  end: number;
  thumbnails: readonly string[];
  loadingThumbnails?: boolean;
  disabled?: boolean;
  /** The player's own current source time, drawn as a playhead over the strip. */
  currentTime?: number;
  /** Clicking the background (not a handle or the selected window) seeks the player here. */
  onSeek?: (time: number) => void;
  onChange: (start: number, end: number) => void;
}

const MIN_RANGE_SECONDS = 0.2;

/**
 * A single trim window over a full length filmstrip: two draggable edge handles set the start
 * and end of the clip that survives, dragging the lit middle band slides the whole window without
 * changing its length, and everything outside it is dimmed. Leaving the handles at their default
 * 0..duration keeps the entire clip selected — "use the whole thing" and "use just this part" are
 * the same control, not two different modes. Shared by GIF Maker and the Screen & Camera Recorder's
 * post recording quick edit.
 */
export function RangeTrim({
  duration,
  start,
  end,
  thumbnails,
  loadingThumbnails,
  disabled,
  currentTime,
  onSeek,
  onChange,
}: RangeTrimProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ticks = timeTicks(duration);

  function timeAt(clientX: number): number {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function startHandleDrag(which: 'start' | 'end') {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        // eslint-disable-next-line react-hooks/refs
        const time = timeAt(moveEvent.clientX);
        if (which === 'start') onChange(Math.min(time, end - MIN_RANGE_SECONDS), end);
        else onChange(start, Math.max(time, start + MIN_RANGE_SECONDS));
      };
      const onUp = (upEvent: PointerEvent) => {
        element.releasePointerCapture(upEvent.pointerId);
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerup', onUp);
      };
      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerup', onUp);
    };
  }

  function startRangeDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const rangeLength = end - start;
    const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;
    const secondsPerPixel = duration / trackWidth;
    const initialStart = start;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) * secondsPerPixel;
      const newStart = Math.min(Math.max(0, initialStart + dx), Math.max(0, duration - rangeLength));
      onChange(newStart, newStart + rangeLength);
    };
    const onUp = (upEvent: PointerEvent) => {
      element.releasePointerCapture(upEvent.pointerId);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
  }

  const startPercent = duration > 0 ? (start / duration) * 100 : 0;
  const endPercent = duration > 0 ? (end / duration) * 100 : 100;
  const playheadPercent =
    currentTime !== undefined && duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-muted relative h-4 text-[10px] select-none">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${duration > 0 ? (t / duration) * 100 : 0}%` }}
          >
            {formatDuration(t)}
          </span>
        ))}
      </div>

      <div
        ref={trackRef}
        onPointerDown={(event) => {
          if (disabled || !onSeek) return;
          onSeek(timeAt(event.clientX));
        }}
        className="border-border bg-ink/10 relative h-16 w-full touch-none overflow-hidden rounded-lg border"
      >
        {loadingThumbnails && (
          <p className="text-muted absolute inset-0 flex items-center justify-center text-xs">
            Loading preview…
          </p>
        )}
        {thumbnails.length > 0 && (
          <div className="flex h-full w-full">
            {thumbnails.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={src}
                alt=""
                draggable={false}
                className="h-full min-w-0 flex-1 object-cover"
              />
            ))}
          </div>
        )}

        <div
          aria-hidden
          className="bg-ink/60 pointer-events-none absolute inset-y-0 left-0"
          style={{ width: `${startPercent}%` }}
        />
        <div
          aria-hidden
          className="bg-ink/60 pointer-events-none absolute inset-y-0 right-0"
          style={{ width: `${100 - endPercent}%` }}
        />

        <div
          onPointerDown={startRangeDrag}
          title="Drag to move the selected range"
          className={`border-brand absolute inset-y-0 touch-none border-y-2 ${
            disabled ? '' : 'cursor-grab active:cursor-grabbing'
          }`}
          style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}
        />

        {playheadPercent !== null && (
          <div
            aria-hidden
            className="bg-brand pointer-events-none absolute top-0 bottom-0 w-0.5 shadow"
            style={{ left: `${playheadPercent}%` }}
          />
        )}

        <div
          role="slider"
          aria-label="Clip start"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={start}
          aria-valuetext={formatDuration(start)}
          tabIndex={disabled ? undefined : 0}
          onPointerDown={startHandleDrag('start')}
          title="Drag to trim the start"
          className={`group absolute top-0 bottom-0 z-10 flex w-4 -translate-x-1/2 items-center justify-center touch-none ${
            disabled ? '' : 'cursor-ew-resize'
          }`}
          style={{ left: `${startPercent}%` }}
        >
          <div className="bg-brand group-hover:bg-brand-strong flex h-full w-2.5 items-center justify-center rounded-sm shadow-sm">
            <div className="bg-on-brand h-4 w-px" />
          </div>
        </div>
        <div
          role="slider"
          aria-label="Clip end"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={formatDuration(end)}
          tabIndex={disabled ? undefined : 0}
          onPointerDown={startHandleDrag('end')}
          title="Drag to trim the end"
          className={`group absolute top-0 bottom-0 z-10 flex w-4 -translate-x-1/2 items-center justify-center touch-none ${
            disabled ? '' : 'cursor-ew-resize'
          }`}
          style={{ left: `${endPercent}%` }}
        >
          <div className="bg-brand group-hover:bg-brand-strong flex h-full w-2.5 items-center justify-center rounded-sm shadow-sm">
            <div className="bg-on-brand h-4 w-px" />
          </div>
        </div>
      </div>
    </div>
  );
}
