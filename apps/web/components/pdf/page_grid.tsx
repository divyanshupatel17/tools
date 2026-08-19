'use client';

import type { KeyboardEvent, PointerEvent, Ref } from 'react';
import { GripVertical, Maximize2, RotateCw, TriangleAlert, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface PageGridItem {
  id: string;
  /** 0-based index into the source document, used only for the "Page N" label. */
  pageIndex: number;
  thumbnail: string | null;
  rotation: 0 | 90 | 180 | 270;
  selected: boolean;
}

export interface PageGridProps {
  items: readonly PageGridItem[];
  selectable?: boolean;
  rotatable?: boolean;
  removable?: boolean;
  draggable?: boolean;
  /**
   * Lets a page open the shared scrollable popup. When `selectable` is also set, clicking
   * the thumbnail still toggles selection, so viewing gets its own small corner button;
   * otherwise the whole thumbnail opens the popup — never a drag, always a click.
   */
  zoomable?: boolean;
  busy?: boolean;
  draggingId?: string | null;
  onToggle?: (id: string) => void;
  onRotate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onZoom?: (pageIndex: number) => void;
  onPointerDown?: (event: PointerEvent<HTMLLIElement>, id: string) => void;
  onHandleKeyDown?: (event: KeyboardEvent, index: number) => void;
  listRef?: Ref<HTMLOListElement>;
  hintId?: string;
  className?: string;
}

/**
 * Shared cell markup for the page-surgery tools (split, remove, extract, rotate, organize).
 * Drag-to-reorder state stays with the caller — this component only renders and forwards
 * pointer/key events for that.
 */
export function PageGrid({
  items,
  selectable = false,
  rotatable = false,
  removable = false,
  draggable = false,
  zoomable = false,
  busy = false,
  draggingId = null,
  onToggle,
  onRotate,
  onRemove,
  onZoom,
  onPointerDown,
  onHandleKeyDown,
  listRef,
  hintId,
  className,
}: PageGridProps) {
  return (
    <ol
      ref={listRef}
      className={cn('grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6', className)}
      aria-describedby={hintId}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          data-card
          onPointerDown={draggable ? (event) => onPointerDown?.(event, item.id) : undefined}
          className={cn(
            'border-border bg-surface relative flex touch-pan-y flex-col rounded-xl border p-1.5 select-none',
            draggingId === item.id ? 'z-20 scale-105 shadow-lg' : 'z-0 transition-transform',
            draggable && !busy && 'cursor-grab',
            item.selected && 'border-brand ring-brand ring-1',
          )}
        >
          <div className="bg-cream relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg">
            {item.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnail}
                alt=""
                draggable={false}
                className="size-full object-contain transition-transform"
                style={{ transform: `rotate(${item.rotation}deg)` }}
              />
            ) : (
              <TriangleAlert aria-hidden className="text-muted size-5" />
            )}
            <span className="bg-brand text-ink pointer-events-none absolute top-1 left-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold">
              {item.pageIndex + 1}
            </span>
            {selectable && (
              <span
                className={cn(
                  'pointer-events-none absolute top-1 right-1 flex size-5 items-center justify-center rounded-full border text-[11px] font-bold',
                  item.selected
                    ? 'bg-brand border-brand text-ink'
                    : 'bg-surface/80 border-border text-transparent',
                )}
              >
                ✓
              </span>
            )}

            {selectable ? (
              <button
                type="button"
                data-no-drag
                disabled={busy}
                onClick={() => onToggle?.(item.id)}
                aria-pressed={item.selected}
                aria-label={`Page ${item.pageIndex + 1}${item.selected ? ', selected' : ''}`}
                className="absolute inset-0 cursor-pointer"
              />
            ) : (
              zoomable && (
                <button
                  type="button"
                  data-no-drag
                  disabled={busy}
                  onClick={() => onZoom?.(item.pageIndex)}
                  aria-label={`View page ${item.pageIndex + 1}`}
                  className="absolute inset-0 cursor-pointer"
                />
              )
            )}

            {selectable && zoomable && (
              <button
                type="button"
                data-no-drag
                disabled={busy}
                onClick={() => onZoom?.(item.pageIndex)}
                aria-label={`View page ${item.pageIndex + 1}`}
                title="View this page"
                className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
              >
                <Maximize2 aria-hidden className="size-3.5" />
              </button>
            )}
          </div>

          {(rotatable || removable || draggable) && (
            <span className="mt-1.5 flex items-center justify-between">
              {draggable ? (
                <button
                  type="button"
                  data-drag-handle
                  onKeyDown={(event) => onHandleKeyDown?.(event, index)}
                  disabled={busy}
                  aria-label={`Reorder page ${item.pageIndex + 1}, position ${index + 1} of ${items.length}`}
                  aria-describedby={hintId}
                  className="text-muted hover:text-foreground flex size-7 cursor-grab touch-none items-center justify-center rounded-lg disabled:opacity-40"
                >
                  <GripVertical aria-hidden className="size-4" />
                </button>
              ) : (
                <span />
              )}
              <span className="flex items-center gap-0.5">
                {rotatable && (
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onRotate?.(item.id)}
                    disabled={busy}
                    aria-label={`Rotate page ${item.pageIndex + 1}`}
                    className="text-muted hover:text-foreground flex size-7 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
                  >
                    <RotateCw aria-hidden className="size-4" />
                  </button>
                )}
                {removable && (
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onRemove?.(item.id)}
                    disabled={busy}
                    aria-label={`Remove page ${item.pageIndex + 1}`}
                    className="text-muted hover:text-danger flex size-7 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
