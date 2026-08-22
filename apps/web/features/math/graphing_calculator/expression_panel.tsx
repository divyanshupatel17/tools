'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, GripVertical, Pause, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { NumberField } from '@/components/ui/number_field';
import { PALETTE } from './model';
import { FunctionKeypad } from './function_keypad';
import type { RowState, GraphingCalculator } from './use_graphing_calculator';
import type { RowResult } from './model';

interface ExpressionPanelProps {
  calculator: GraphingCalculator;
}

/** Renders through a portal at a fixed position so it always floats above every sibling row. */
function ColorSwatch({ color, onPick }: { color: string; onPick: (color: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!rect) return;
    function onDocPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setRect(null);
    }
    function onScrollOrResize() {
      setRect(null);
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [rect]);

  const POPOVER_WIDTH = 168;
  // A portal to document.body renders invisibly while a different element is in Fullscreen
  // mode (only descendants of the fullscreen element are rendered), so target whichever
  // element is actually fullscreen right now.
  const portalTarget = typeof document !== 'undefined' ? (document.fullscreenElement ?? document.body) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (rect) {
            setRect(null);
            return;
          }
          const box = buttonRef.current?.getBoundingClientRect();
          if (!box) return;
          setRect({ top: box.bottom + 6, left: Math.min(box.left, window.innerWidth - POPOVER_WIDTH - 8) });
        }}
        aria-label="Choose a colour for this expression"
        className="size-5 shrink-0 rounded-full ring-1 ring-border ring-offset-2 ring-offset-surface"
        style={{ backgroundColor: color }}
      />
      {rect &&
        portalTarget &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: POPOVER_WIDTH }}
            className="z-50 grid grid-cols-4 gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-card)]"
          >
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  onPick(swatch);
                  setRect(null);
                }}
                aria-label={`Use ${swatch}`}
                className="size-6 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>,
          portalTarget,
        )}
    </>
  );
}

/** The plain colour-dot-plus-text preview shown in the drag overlay while a row is picked up. */
function RowPreviewCard({ color, raw }: { color: string; raw: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2 shadow-2xl">
      <GripVertical className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span className="size-5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{raw || 'Empty expression'}</span>
    </div>
  );
}

interface ExpressionRowProps {
  rowState: RowState;
  result: RowResult | undefined;
  calculator: GraphingCalculator;
  registerInput: (id: string, el: HTMLInputElement | null) => void;
  onFocusRow: (id: string) => void;
  focusRow: (id: string) => void;
}

function ExpressionRow({ rowState, result, calculator, registerInput, onFocusRow, focusRow }: ExpressionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowState.id });
  const classified = result?.row;
  const isError = classified?.type === 'error' && rowState.raw.trim() !== '';
  const isSlider = classified?.type === 'slider';
  const range = isSlider ? calculator.rangeFor(rowState.id, classified.declaredDefault) : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-xl border border-border bg-background/40 px-2 py-2',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder this expression"
          className="flex size-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden />
        </span>
        <ColorSwatch color={rowState.color} onPick={(color) => calculator.setColor(rowState.id, color)} />
        <input
          ref={(el) => registerInput(rowState.id, el)}
          id={`${rowState.id}-expression`}
          type="text"
          value={rowState.raw}
          onFocus={() => onFocusRow(rowState.id)}
          onChange={(event) => calculator.updateRowText(rowState.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            focusRow(calculator.addRow(rowState.id));
          }}
          className={cn(
            'min-w-0 flex-1 truncate bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted',
            isError && 'text-danger',
          )}
          aria-invalid={isError}
        />
        <button
          type="button"
          onClick={() => calculator.toggleHidden(rowState.id)}
          aria-label={rowState.hidden ? 'Show this expression' : 'Hide this expression'}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
        >
          {rowState.hidden ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => calculator.removeRow(rowState.id)}
          disabled={calculator.rows.length <= 1}
          aria-label="Delete this expression"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {isSlider && range && (
        <div className="mt-2 ml-7 flex flex-col gap-1.5 rounded-lg border border-border/60 bg-surface-muted/50 px-2 py-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => calculator.togglePlay(rowState.id)}
              aria-label={calculator.playing[rowState.id] ? 'Pause the slider' : 'Animate the slider'}
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-foreground"
            >
              {calculator.playing[rowState.id] ? <Pause className="size-3" aria-hidden /> : <Play className="size-3" aria-hidden />}
            </button>
            <span className="min-w-0 truncate text-xs font-medium tabular-nums text-foreground">
              {classified.paramName} = {Number(classified.value.toPrecision(6))}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <NumberField
              id={`${rowState.id}-min`}
              value={range.min}
              onChange={(value) => calculator.setSliderRange(rowState.id, { ...range, min: value })}
              min={-1e9}
              allowDecimal
              className="h-7 w-12 shrink-0 rounded-md border border-border bg-surface px-1 text-center text-xs text-muted"
              aria-label="Slider minimum"
            />
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={classified.value}
              onChange={(event) => calculator.setSliderValue(rowState.id, Number(event.target.value))}
              className="h-7 min-w-0 flex-1 accent-[var(--accent-math)]"
              aria-label={`Value of ${classified.paramName}`}
            />
            <NumberField
              id={`${rowState.id}-max`}
              value={range.max}
              onChange={(value) => calculator.setSliderRange(rowState.id, { ...range, max: value })}
              min={-1e9}
              allowDecimal
              className="h-7 w-12 shrink-0 rounded-md border border-border bg-surface px-1 text-center text-xs text-muted"
              aria-label="Slider maximum"
            />
          </div>
        </div>
      )}

      {isError && <p className="mt-1 pl-7 text-xs text-danger">{classified.message}</p>}
    </li>
  );
}

export function ExpressionPanel({ calculator }: ExpressionPanelProps) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeRowRef = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  // Deliberately flips after the first client render (not a lazy `useState` initializer): the
  // portal must be absent on the very first client render too, or it would mismatch the
  // server-rendered markup, which never has access to `document`.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) calculator.reorderRow(String(active.id), String(over.id));
    setActiveId(null);
  }

  function registerInput(id: string, el: HTMLInputElement | null) {
    inputRefs.current[id] = el;
  }

  function onFocusRow(id: string) {
    activeRowRef.current = id;
  }

  function focusRow(id: string) {
    requestAnimationFrame(() => inputRefs.current[id]?.focus());
  }

  function insertAtCursor(text: string, cursorBack = 0) {
    const fallbackId = calculator.rows[calculator.rows.length - 1]?.id;
    const rowId = (activeRowRef.current && calculator.rows.some((row) => row.id === activeRowRef.current) ? activeRowRef.current : fallbackId) ?? null;
    if (!rowId) return;
    const rowState = calculator.rows.find((row) => row.id === rowId);
    if (!rowState) return;
    const el = inputRefs.current[rowId];
    const start = el?.selectionStart ?? rowState.raw.length;
    const end = el?.selectionEnd ?? start;
    const nextValue = rowState.raw.slice(0, start) + text + rowState.raw.slice(end);
    calculator.updateRowText(rowId, nextValue);
    const nextCursor = start + text.length - cursorBack;
    requestAnimationFrame(() => {
      const freshEl = inputRefs.current[rowId];
      freshEl?.focus();
      freshEl?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  const activeRow = activeId ? calculator.rows.find((row) => row.id === activeId) : undefined;

  return (
    <div className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Expressions</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={calculator.loadExamples}
            aria-label="Load an example of every function type"
            title="Load examples"
            className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <Sparkles className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={calculator.clearAll}
            aria-label="Clear all expressions"
            title="Clear all"
            className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <DndContext
        id="graphing-calculator-expressions"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={calculator.rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto pr-1">
            {calculator.rows.map((rowState) => (
              <ExpressionRow
                key={rowState.id}
                rowState={rowState}
                result={calculator.model.find((entry) => entry.id === rowState.id)}
                calculator={calculator}
                registerInput={registerInput}
                onFocusRow={onFocusRow}
                focusRow={focusRow}
              />
            ))}
          </ul>
        </SortableContext>
        {mounted &&
          createPortal(
            <DragOverlay>{activeRow && <RowPreviewCard color={activeRow.color} raw={activeRow.raw} />}</DragOverlay>,
            document.fullscreenElement ?? document.body,
          )}
      </DndContext>
      <button
        type="button"
        onClick={() => focusRow(calculator.addRow())}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-sm text-muted hover:border-solid hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        Add expression
      </button>
      <FunctionKeypad onInsert={insertAtCursor} />
    </div>
  );
}
