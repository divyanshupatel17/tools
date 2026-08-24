'use client';

import { useRef } from 'react';
import { formatDuration } from '@/lib/video/video_formats';
import { sequenceToSource, sourceToSequence, timeTicks, type Segment } from '@/lib/video/timeline';

export interface TimelineProps {
  duration: number;
  segments: readonly Segment[];
  /** The kept segments' ids, in output order — this is what actually plays. */
  order: readonly number[];
  thumbnails: readonly string[];
  loadingThumbnails?: boolean;
  disabled?: boolean;
  /** The player's own current source time, used to place the playhead and resolve a click. */
  currentTime?: number;
  /** Clicking or dragging seeks the player here (a source time) instead of editing anything. */
  onSeek?: (time: number) => void;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Drags the boundary between segments[index] and segments[index + 1] to a new source time. */
  onMoveBoundary: (index: number, time: number) => void;
  /** Drags a kept clip to a new position in the output order (indices into `order`). */
  onReorder: (from: number, to: number) => void;
  /** How many times wider than "fit the container" the row is drawn. 1 = fits exactly. */
  zoom: number;
}

/** Where a thumbnail at `index` of `count` sits in the source, matching `generateFilmstrip`. */
function thumbnailTime(index: number, count: number, duration: number): number {
  return (index / Math.max(1, count - 1)) * duration;
}

/**
 * The edited timeline, and only the edited timeline: no separate source strip to get confused
 * with, since cut footage never plays and never appears here. Only kept clips are shown, laid
 * out left to right in the exact order they'll play — a clip's position here IS its position in
 * the edit. Dragging one moves it to a new spot in that order — the same thing that then plays,
 * immediately. Each clip's own edges trim independently of its neighbours, reaching back into
 * whatever source footage sits before or after it. The scrub bar and playhead both work in the
 * edit's own time, not the original file's.
 */
export function Timeline({
  duration,
  segments,
  order,
  thumbnails,
  disabled,
  currentTime,
  onSeek,
  selectedId,
  onSelect,
  onMoveBoundary,
  onReorder,
  zoom,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);
  const widthPercent = Math.max(100, zoom * 100);

  const orderedClips = order
    .map((id) => segments.find((segment) => segment.id === id))
    .filter((segment): segment is Segment => segment !== undefined);
  const totalKept = orderedClips.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const sequenceTicks = timeTicks(totalKept);

  const sequencePosition =
    currentTime !== undefined ? sourceToSequence(orderedClips, currentTime) : null;
  const sequencePercent =
    sequencePosition !== null && totalKept > 0 ? Math.min(100, Math.max(0, (sequencePosition / totalKept) * 100)) : null;

  function sequenceTimeAt(clientX: number): number {
    const track = trackRef.current;
    if (!track || totalKept <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * totalKept;
  }

  function startBoundaryDrag(index: number, anchorTime: number, pixelsPerSecond: number) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || pixelsPerSecond <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      const startX = event.clientX;

      const onMove = (moveEvent: PointerEvent) => {
        const deltaSeconds = (moveEvent.clientX - startX) / pixelsPerSecond;
        onMoveBoundary(index, anchorTime + deltaSeconds);
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

  /**
   * A clip attaches to the pointer while dragging (a live `translateX`, not the browser's own
   * drag ghost) and reports which other clip it's currently over so dropping there moves it to
   * that spot in the play order. A plain click (no real movement) still selects. The drag lives
   * on the same `<button>` that owns the click — pointer capture retargets every later pointer
   * event (and the click that follows) to whichever element requested it, so capturing on a
   * wrapper `<div>` around the button would swallow its clicks.
   */
  function startClipDrag(orderIndex: number) {
    return (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || orderIndex === -1) return;
      const button = event.currentTarget;
      const wrapper = button.parentElement;
      if (!wrapper) return;
      const startX = event.clientX;
      let dragging = false;
      let targetIndex = orderIndex;
      button.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        if (!dragging && Math.abs(dx) > 4) {
          dragging = true;
          wrapper.style.zIndex = '30';
          wrapper.style.filter = 'drop-shadow(0 4px 8px rgb(0 0 0 / 0.25))';
        }
        if (!dragging) return;
        wrapper.style.transform = `translateX(${dx}px)`;
        const seqTime = sequenceTimeAt(moveEvent.clientX);
        let offset = 0;
        let hoveredIndex = orderedClips.length - 1;
        for (let i = 0; i < orderedClips.length; i += 1) {
          const length = orderedClips[i]!.end - orderedClips[i]!.start;
          if (seqTime < offset + length) {
            hoveredIndex = i;
            break;
          }
          offset += length;
        }
        targetIndex = hoveredIndex;
      };
      const onUp = (upEvent: PointerEvent) => {
        button.releasePointerCapture(upEvent.pointerId);
        button.removeEventListener('pointermove', onMove);
        button.removeEventListener('pointerup', onUp);
        wrapper.style.transform = '';
        wrapper.style.zIndex = '';
        wrapper.style.filter = '';
        didDragRef.current = dragging;
        if (dragging && targetIndex !== orderIndex) onReorder(orderIndex, targetIndex);
      };
      button.addEventListener('pointermove', onMove);
      button.addEventListener('pointerup', onUp);
    };
  }

  /** The scrub bar: press and slide to move the playhead, in play order. */
  function startPlayheadDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !onSeek || totalKept <= 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    onSeek(sequenceToSource(orderedClips, sequenceTimeAt(event.clientX)));

    const onMove = (moveEvent: PointerEvent) => onSeek(sequenceToSource(orderedClips, sequenceTimeAt(moveEvent.clientX)));
    const onUp = (upEvent: PointerEvent) => {
      element.releasePointerCapture(upEvent.pointerId);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
  }

  return (
    <div className="border-border bg-cream/60 overflow-x-auto rounded-xl border p-2">
      <div style={{ width: `${widthPercent}%`, minWidth: '100%' }} className="flex flex-col gap-1.5">
        <div className="text-muted relative h-4 text-[10px] select-none">
          {sequenceTicks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${totalKept > 0 ? (t / totalKept) * 100 : 0}%` }}
            >
              {formatDuration(t)}
            </span>
          ))}
        </div>

        <div
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={totalKept}
          aria-valuenow={sequencePosition ?? 0}
          aria-valuetext={formatDuration(sequencePosition ?? 0)}
          tabIndex={onSeek && !disabled && totalKept > 0 ? 0 : undefined}
          onPointerDown={startPlayheadDrag}
          className={`relative h-4 w-full touch-none select-none ${onSeek && !disabled && totalKept > 0 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <div className="bg-border absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full" />
          {sequencePercent !== null && (
            <>
              <div
                className="bg-brand absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{ width: `${sequencePercent}%` }}
              />
              <div
                aria-hidden
                className="bg-brand border-surface absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
                style={{ left: `${sequencePercent}%` }}
              />
            </>
          )}
        </div>

        <div
          ref={trackRef}
          className="border-border bg-ink/10 relative h-16 w-full overflow-hidden rounded-lg border"
        >
          {totalKept <= 0 && (
            <p className="text-muted absolute inset-0 flex items-center justify-center text-xs">
              Nothing kept yet — undo, or clear all, to start over.
            </p>
          )}

          {(() => {
            const offsets = orderedClips.reduce((acc: number[], clip) => [...acc, (acc[acc.length - 1] ?? 0) + (clip.end - clip.start)], []);
            // eslint-disable-next-line react-hooks/refs
            return orderedClips.map((clip, index) => {
              const offset = offsets[index - 1] ?? 0;
              const left = (offset / totalKept) * 100;
              const width = ((clip.end - clip.start) / totalKept) * 100;
              const sourceIndex = segments.findIndex((segment) => segment.id === clip.id);
              const clipThumbnails = thumbnails
                .map((src, i) => ({ src, time: thumbnailTime(i, thumbnails.length, duration) }))
                .filter((frame) => frame.time >= clip.start && frame.time < clip.end);
              // eslint-disable-next-line react-hooks/refs
              const trackWidthPx = trackRef.current?.getBoundingClientRect().width ?? 0;
              const pixelsPerSecond = totalKept > 0 ? trackWidthPx / totalKept : 0;

              return (
                <div
                  key={`${clip.id}-${index}`}
                  className="absolute inset-y-0 touch-none"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onPointerDown={startClipDrag(index)}
                    onClick={() => {
                      if (didDragRef.current) {
                        didDragRef.current = false;
                        return;
                      }
                      onSelect(clip.id === selectedId ? null : clip.id);
                    }}
                    title={`${formatDuration(clip.start)}–${formatDuration(clip.end)} · drag to reorder`}
                    className={`absolute inset-x-1 inset-y-1 flex cursor-grab items-center overflow-hidden rounded-lg border-2 transition-colors active:cursor-grabbing ${
                      clip.id === selectedId ? 'border-brand ring-brand ring-2 ring-offset-1' : 'border-brand/70 hover:border-brand'
                    }`}
                  >
                    <div className="flex h-full w-full">
                      {clipThumbnails.length > 0 ? (
                        clipThumbnails.map((frame) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={frame.time}
                            src={frame.src}
                            alt=""
                            draggable={false}
                            className="h-full min-w-0 flex-1 object-cover"
                          />
                        ))
                      ) : (
                        <div className="bg-brand/10 h-full w-full" />
                      )}
                    </div>
                  </button>

                  <span
                    aria-hidden
                    className="bg-brand text-on-brand absolute top-1.5 left-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold shadow-sm"
                  >
                    {index + 1}
                  </span>

                  {sourceIndex > 0 && (
                    <div
                      role="separator"
                      aria-label={`Trim clip ${index + 1}'s start`}
                      title="Drag to trim"
                      onPointerDown={startBoundaryDrag(sourceIndex - 1, clip.start, pixelsPerSecond)}
                      className="group absolute top-0 bottom-0 left-0 z-10 flex w-4 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
                    >
                      <div className="bg-brand group-hover:bg-brand-strong flex h-8 w-2.5 items-center justify-center rounded-full shadow-sm">
                        <div className="bg-on-brand h-4 w-px" />
                      </div>
                    </div>
                  )}
                  {sourceIndex !== -1 && sourceIndex < segments.length - 1 && (
                    <div
                      role="separator"
                      aria-label={`Trim clip ${index + 1}'s end`}
                      title="Drag to trim"
                      onPointerDown={startBoundaryDrag(sourceIndex, clip.end, pixelsPerSecond)}
                      className="group absolute top-0 right-0 bottom-0 z-10 flex w-4 translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
                    >
                      <div className="bg-brand group-hover:bg-brand-strong flex h-8 w-2.5 items-center justify-center rounded-full shadow-sm">
                        <div className="bg-on-brand h-4 w-px" />
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
