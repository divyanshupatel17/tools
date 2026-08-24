'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Dices,
  Equal,
  GripVertical,
  Grid3x3,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { NumberField } from '@/components/ui/number_field';
import { useMatrixCalculator } from './use_matrix_calculator';
import { useCompact, useResizablePanes } from './use_resizable_panes';
import {
  MAX_DIM,
  MIN_DIM,
  OPERATIONS,
  dims,
  formatNumber,
  resultLabel,
  type CalcStep,
  type Matrix,
  type MatrixOperation,
  type OperationInfo,
} from './matrix_engine';

const CELL_BOUND = 1e12;
const OPERATION_GROUPS = Array.from(new Set(OPERATIONS.map((op) => op.group)));

function matrixToText(matrix: Matrix): string {
  return matrix.map((row) => row.map((v) => formatNumber(v)).join('\t')).join('\n');
}

function CopyButton({ text, label = 'Copy value' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      aria-label={label}
      title={label}
      className="text-muted hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

function DimStepper({
  label,
  value,
  onChange,
  hideLabel,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hideLabel?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && !hideLabel && <span className="text-muted text-xs font-medium">{label}</span>}
      <div className="border-border bg-surface-muted flex shrink-0 items-center overflow-hidden rounded-full border">
        <button
          type="button"
          onClick={() => onChange(Math.max(MIN_DIM, value - 1))}
          disabled={value <= MIN_DIM}
          aria-label={`Decrease ${label ? label.toLowerCase() : 'value'}`}
          title={`Decrease ${label || 'value'}`}
          className="text-muted hover:text-foreground flex size-6 items-center justify-center disabled:opacity-30"
        >
          <Minus className="size-3" aria-hidden />
        </button>
        <span className="w-5 text-center text-xs font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(MAX_DIM, value + 1))}
          disabled={value >= MAX_DIM}
          aria-label={`Increase ${label ? label.toLowerCase() : 'value'}`}
          title={`Increase ${label || 'value'}`}
          className="text-muted hover:text-foreground flex size-6 items-center justify-center disabled:opacity-30"
        >
          <Plus className="size-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function MatrixGrid({
  matrix,
  onCellChange,
  ariaLabelPrefix,
}: {
  matrix: Matrix;
  onCellChange?: (r: number, c: number, value: number) => void;
  ariaLabelPrefix: string;
}) {
  const { rows, cols } = dims(matrix);
  // Keyed by "row-col" rather than a fixed size array, since rows/cols change as the user resizes.
  const cellRefs = useRef(new Map<string, HTMLInputElement>());

  function cellRef(r: number, c: number) {
    return (el: HTMLInputElement | null) => {
      const key = `${r}-${c}`;
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    };
  }

  function focusCell(r: number, c: number) {
    const target = cellRefs.current.get(`${r}-${c}`);
    target?.focus();
    target?.select();
  }

  function onCellKeyDown(r: number, c: number) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          focusCell(Math.max(0, r - 1), c);
          return;
        case 'ArrowDown':
          event.preventDefault();
          focusCell(Math.min(rows - 1, r + 1), c);
          return;
        case 'ArrowLeft':
          // Lets the text cursor move within a multi digit number first; only jumps cells
          // once the cursor is already at the start, the way a spreadsheet behaves.
          if (input.selectionStart !== 0 || input.selectionEnd !== 0) return;
          event.preventDefault();
          focusCell(r, Math.max(0, c - 1));
          return;
        case 'ArrowRight':
          if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return;
          event.preventDefault();
          focusCell(r, Math.min(cols - 1, c + 1));
          return;
        default:
          return;
      }
    };
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(2.25rem, 1fr))` }}
      >
        {matrix.map((row, r) =>
          row.map((value, c) =>
            onCellChange ? (
              <NumberField
                key={`${r}-${c}`}
                ref={cellRef(r, c)}
                value={value}
                min={-CELL_BOUND}
                max={CELL_BOUND}
                allowDecimal
                onChange={(next) => onCellChange(r, c, next)}
                onKeyDown={onCellKeyDown(r, c)}
                aria-label={`${ariaLabelPrefix} row ${r + 1} column ${c + 1}`}
                className="border-border bg-surface text-foreground min-w-0 rounded-lg border px-1 py-1.5 text-center text-sm font-medium outline-none focus:border-[var(--accent-math)]"
              />
            ) : (
              <div
                key={`${r}-${c}`}
                className="border-border bg-surface-muted text-foreground rounded-lg border px-1 py-1.5 text-center text-sm font-medium"
              >
                {formatNumber(value)}
              </div>
            ),
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Renders a matrix between tall bracket edges, the way a worked problem would write it.
 * Uses a real table so cell widths always reflow instead of overlapping at any width or
 * decimal precision; the whole thing scrolls horizontally on its own when it doesn't fit.
 */
function BracketMatrix({
  matrix,
  decimals,
  size = 'md',
}: {
  matrix: Matrix;
  decimals?: number;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex max-w-full items-stretch overflow-x-auto align-middle">
      <div className="border-foreground/50 w-2 shrink-0 self-stretch rounded-l-sm border-y-2 border-l-2" />
      <table style={{ borderSpacing: size === 'sm' ? '0.5rem 0.125rem' : '0.75rem 0.25rem', borderCollapse: 'separate' }}>
        <tbody>
          {matrix.map((row, r) => (
            <tr key={r}>
              {row.map((value, c) => (
                <td
                  key={c}
                  className={cn(
                    'text-foreground text-right font-mono whitespace-nowrap tabular-nums',
                    size === 'sm' ? 'text-xs' : 'text-sm',
                  )}
                >
                  {formatNumber(value, decimals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-foreground/50 w-2 shrink-0 self-stretch rounded-r-sm border-y-2 border-r-2" />
    </div>
  );
}

function MatrixPanel({
  label,
  matrix,
  onCellChange,
  onResize,
  onFill,
  onReset,
  compact,
}: {
  label: string;
  matrix: Matrix;
  onCellChange: (r: number, c: number, value: number) => void;
  onResize: (rows: number, cols: number) => void;
  onFill: (fill: 'zero' | 'identity' | 'random') => void;
  onReset: () => void;
  compact: boolean;
}) {
  const { rows, cols } = dims(matrix);
  const fillButtons: { id: 'random' | 'identity' | 'zero'; label: string; icon: ReactNode }[] = [
    { id: 'random', label: 'Random', icon: <Dices className="size-3.5" aria-hidden /> },
    { id: 'identity', label: 'Identity', icon: <Grid3x3 className="size-3.5" aria-hidden /> },
    { id: 'zero', label: 'Zero', icon: <RotateCcw className="size-3.5" aria-hidden /> },
  ];
  return (
    <div className="border-border bg-surface flex h-full flex-col rounded-2xl border p-3 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-foreground shrink-0 text-sm font-semibold">Matrix {label}</h2>
        <div className="flex flex-wrap items-center gap-1">
          <DimStepper label="Rows" hideLabel={compact} value={rows} onChange={(next) => onResize(next, cols)} />
          <DimStepper label="Cols" hideLabel={compact} value={cols} onChange={(next) => onResize(rows, next)} />
          <CopyButton text={matrixToText(matrix)} label={`Copy Matrix ${label}`} />
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset Matrix ${label}`}
            title={`Reset Matrix ${label}`}
            className="text-muted hover:text-danger shrink-0 rounded-md p-1 transition-colors"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <MatrixGrid matrix={matrix} onCellChange={onCellChange} ariaLabelPrefix={`Matrix ${label}`} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {fillButtons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => onFill(btn.id)}
            title={btn.label}
            aria-label={btn.label}
            className="border-border bg-surface-muted text-muted hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            {btn.icon}
            {!compact && btn.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onReset}
          title="Clear"
          aria-label="Clear"
          className="border-border bg-surface-muted text-muted hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
        >
          <Trash2 className="size-3.5" aria-hidden />
          {!compact && 'Clear'}
        </button>
      </div>
    </div>
  );
}

function OperationsPanel({
  operation,
  onSelect,
  power,
  onPowerChange,
  compact,
}: {
  operation: MatrixOperation;
  onSelect: (op: MatrixOperation) => void;
  power: number;
  onPowerChange: (value: number) => void;
  compact: boolean;
}) {
  const activeOp = OPERATIONS.find((op) => op.id === operation);
  return (
    <div className="border-border bg-surface flex h-full flex-col rounded-2xl border p-3 shadow-[var(--shadow-card)]">
      <p className="text-muted mb-2 shrink-0 text-xs font-semibold tracking-wide uppercase">Operations</p>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {OPERATION_GROUPS.map((group) => (
          <div key={group}>
            {!compact && (
              <p className="text-muted mb-1 text-[0.6rem] font-semibold tracking-wide uppercase">{group}</p>
            )}
            <div className="flex flex-col gap-1">
              {OPERATIONS.filter((op) => op.group === group).map((op) => (
                <button
                  key={op.id}
                  type="button"
                  title={op.label}
                  onClick={() => onSelect(op.id)}
                  aria-pressed={operation === op.id}
                  className={cn(
                    'truncate rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors',
                    operation === op.id
                      ? 'bg-[var(--accent-math)] text-[var(--on-accent-math)]'
                      : 'bg-surface-muted text-foreground hover:bg-border/60',
                  )}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {activeOp?.needsPower && (
        <div className="mt-3 shrink-0">
          <DimStepper label="Power n" hideLabel={compact} value={power} onChange={onPowerChange} />
        </div>
      )}
    </div>
  );
}

function StepView({ index, step }: { index: number; step: CalcStep }) {
  return (
    <div className="border-border flex gap-2.5 border-b pb-2.5 last:border-0 last:pb-0">
      <span className="bg-[var(--accent-math)] text-[var(--on-accent-math)] mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-xs font-semibold">{step.title}</p>
        {step.matrix && (
          <div className="mt-1.5">
            <BracketMatrix matrix={step.matrix} size="sm" />
          </div>
        )}
        {step.formula && <p className="text-muted mt-1 font-mono text-xs break-words">{step.formula}</p>}
        {step.detail && <p className="text-muted mt-1 text-xs break-words">{step.detail}</p>}
      </div>
    </div>
  );
}

function ResizeHandle({
  label,
  orientation,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  orientation: 'horizontal' | 'vertical';
  onPointerDown: (event: ReactPointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'group flex shrink-0 touch-none items-center justify-center self-stretch',
        orientation === 'horizontal' ? 'w-4 cursor-col-resize' : 'h-4 cursor-row-resize',
      )}
    >
      <div
        className={cn(
          'bg-border group-hover:bg-[var(--accent-math)] group-focus-visible:bg-[var(--accent-math)] flex items-center justify-center rounded-full transition-colors',
          orientation === 'horizontal' ? 'h-16 w-1.5' : 'h-1.5 w-16',
        )}
      >
        <GripVertical
          className={cn(
            'text-muted size-3 group-hover:text-[var(--on-accent-math)]',
            orientation === 'vertical' && 'rotate-90',
          )}
          aria-hidden
        />
      </div>
    </div>
  );
}

function operationOptions(groups: string[]) {
  return groups.map((group) => ({
    group,
    items: OPERATIONS.filter((op) => op.group === group),
  }));
}

export function MatrixCalculatorWorkspace() {
  const calc = useMatrixCalculator();
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  // Operations sits in its own resizable pane on the left; Matrix A and Matrix B stack
  // naturally on the right so neither one ever forces a scrollbar or leaves blank space
  // when the other is a very different size.
  const { containerRef: hContainerRef, percents: hPercents, startDrag: hStartDrag, nudge: hNudge } =
    useResizablePanes([36, 64], 20, 'horizontal');
  const [paneOpsRef, compactOps] = useCompact(170);
  const [paneARef, compactA] = useCompact(220);
  const [paneBRef, compactB] = useCompact(220);

  const activeOp: OperationInfo = OPERATIONS.find((op) => op.id === calc.operation) ?? OPERATIONS[0]!;
  const decimals = calc.displayDecimals ? calc.decimalPlaces : undefined;
  const result = calc.result;
  const steps = result?.steps ?? [];
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 4);
  const label = resultLabel(calc.operation, calc.power);
  const groupedOptions = operationOptions(OPERATION_GROUPS);

  function handleHorizontalKeyDown(handleIndex: number) {
    return (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        hNudge(handleIndex, -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        hNudge(handleIndex, 1);
      }
    };
  }

  // Plain (non compact-aware) versions for the mobile stacked fallback, which is always full
  // width anyway. The desktop row below wraps its own copies with the compact-tracking refs
  // instead of sharing them, since a single ref can only ever point at one mounted element.
  const matrixAPanel = (
    <MatrixPanel
      label="A"
      matrix={calc.matrixA}
      onCellChange={calc.setCellA}
      onResize={calc.resizeA}
      onFill={calc.fillA}
      onReset={calc.resetA}
      compact={false}
    />
  );
  const operationsPanel = (
    <OperationsPanel
      operation={calc.operation}
      onSelect={calc.setOperation}
      power={calc.power}
      onPowerChange={(next) => calc.setPower(Math.max(0, Math.min(10, next)))}
      compact={false}
    />
  );
  const matrixBPanel = (
    <MatrixPanel
      label="B"
      matrix={calc.matrixB}
      onCellChange={calc.setCellB}
      onResize={calc.resizeB}
      onFill={calc.fillB}
      onReset={calc.resetB}
      compact={false}
    />
  );

  return (
    <div className="flex w-full max-w-[100rem] flex-col gap-3 lg:mx-auto lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/*
          Desktop: Operations sits in its own resizable pane on the left; Matrix A and
          Matrix B stack naturally on the right. Neither side is stretched to match the
          other's height, so a short Matrix B never leaves blank space under a tall Matrix A
          (or vice versa), and nothing needs an internal scrollbar to show every cell.
        */}
        <div ref={hContainerRef} className="hidden items-start lg:flex">
          <div ref={paneOpsRef} style={{ flexGrow: hPercents[0], flexBasis: 0 }} className="min-w-0 shrink">
            <OperationsPanel
              operation={calc.operation}
              onSelect={calc.setOperation}
              power={calc.power}
              onPowerChange={(next) => calc.setPower(Math.max(0, Math.min(10, next)))}
              compact={compactOps}
            />
          </div>
          <ResizeHandle
            label="Resize Operations and the matrices"
            orientation="horizontal"
            onPointerDown={hStartDrag(0)}
            onKeyDown={handleHorizontalKeyDown(0)}
          />
          <div
            style={{ flexGrow: hPercents[1], flexBasis: 0 }}
            className="flex min-w-0 shrink flex-col gap-3"
          >
            <div ref={paneARef}>
              <MatrixPanel
                label="A"
                matrix={calc.matrixA}
                onCellChange={calc.setCellA}
                onResize={calc.resizeA}
                onFill={calc.fillA}
                onReset={calc.resetA}
                compact={compactA}
              />
            </div>
            <div ref={paneBRef}>
              <MatrixPanel
                label="B"
                matrix={calc.matrixB}
                onCellChange={calc.setCellB}
                onResize={calc.resizeB}
                onFill={calc.fillB}
                onReset={calc.resetB}
                compact={compactB}
              />
            </div>
          </div>
        </div>

        {/* Stacked fallback below the lg breakpoint, where dragging a split doesn't make sense. */}
        <div className="flex flex-col gap-3 lg:hidden">
          {matrixAPanel}
          {operationsPanel}
          {matrixBPanel}
        </div>

        <div className="border-border bg-surface flex flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <select
              value={calc.operation}
              onChange={(event) => calc.setOperation(event.target.value as MatrixOperation)}
              aria-label="Operation"
              className="border-border bg-surface-muted text-foreground w-full appearance-none rounded-full border px-4 py-2 pr-8 text-sm font-medium outline-none focus:border-[var(--accent-math)]"
            >
              {groupedOptions.map(({ group, items }) => (
                <optgroup key={group} label={group}>
                  {items.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown
              className="text-muted pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
              aria-hidden
            />
          </div>
          <button
            type="button"
            onClick={calc.calculate}
            aria-label="Calculate"
            title="Calculate"
            className="border-border bg-surface-muted text-foreground hover:bg-border/60 flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors"
          >
            <Equal className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={calc.calculate}
            className="shrink-0 rounded-full bg-[var(--accent-math)] px-5 py-2 text-sm font-semibold text-[var(--on-accent-math)] transition-opacity hover:opacity-90"
          >
            Calculate
          </button>
          <button
            type="button"
            onClick={calc.clearAll}
            className="border-border bg-surface-muted text-muted hover:text-foreground shrink-0 rounded-full border px-5 py-2 text-sm font-medium transition-colors"
          >
            Clear All
          </button>
        </div>

        <div
          className={cn(
            'flex items-start gap-2 rounded-2xl border p-3',
            result?.ok && 'border-success/30 bg-success/10',
            result && !result.ok && 'border-danger/30 bg-danger/10',
            !result && 'border-border bg-surface',
          )}
        >
          {result?.ok && <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />}
          {result && !result.ok && <AlertCircle className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-foreground text-sm font-semibold">Result</p>
              {result?.ok && (
                <CopyButton
                  text={
                    result.scalar !== undefined
                      ? formatNumber(result.scalar, decimals)
                      : result.values
                        ? result.values.join(', ')
                        : result.matrix
                          ? matrixToText(result.matrix)
                          : ''
                  }
                />
              )}
            </div>
            {!result && <p className="text-muted mt-1 text-xs">Choose an operation and press Calculate.</p>}
            {result && !result.ok && <p className="text-danger mt-1 text-xs break-words">{result.error}</p>}
            {result?.ok && result.scalar !== undefined && (
              <p className="text-foreground mt-1 flex flex-wrap items-baseline gap-2 font-mono text-xl font-semibold">
                <span>{label} =</span>
                <span>{formatNumber(result.scalar, decimals)}</span>
              </p>
            )}
            {result?.ok && result.values && (
              <div className="mt-1 flex flex-col gap-0.5">
                {result.values.map((value, index) => (
                  <p key={index} className="text-foreground font-mono text-sm font-semibold">
                    λ{'₁₂₃'[index] ?? index + 1} = {value}
                  </p>
                ))}
              </div>
            )}
            {result?.ok && result.matrix && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-foreground shrink-0 font-mono text-sm font-semibold">{label} =</span>
                <BracketMatrix matrix={result.matrix} decimals={decimals} />
              </div>
            )}
            {result?.ok &&
              result.extraMatrices?.map((extra) => (
                <div key={extra.label} className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-foreground shrink-0 font-mono text-sm font-semibold">{extra.label} =</span>
                  <BracketMatrix matrix={extra.matrix} decimals={decimals} />
                </div>
              ))}
          </div>
        </div>

        <div className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-xs">
          <label className="text-muted flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={calc.displayDecimals}
              onChange={(event) => calc.setDisplayDecimals(event.target.checked)}
            />
            Display decimals
          </label>
          {calc.displayDecimals && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Decimal places</span>
              <DimStepper
                label=""
                value={calc.decimalPlaces}
                onChange={(next) => calc.setDecimalPlaces(Math.max(0, Math.min(8, next)))}
              />
            </div>
          )}
        </div>

        <div>
          <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Matrix Information</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Matrix A', value: `${dims(calc.matrixA).rows}×${dims(calc.matrixA).cols}` },
              { label: 'Matrix B', value: `${dims(calc.matrixB).rows}×${dims(calc.matrixB).cols}` },
              { label: 'Operation', value: activeOp.label },
              {
                label: 'Total Operations',
                value: result?.ok && result.opsCount !== undefined ? formatNumber(result.opsCount) : '—',
              },
            ].map((item) => (
              <div key={item.label} className="border-border bg-surface min-w-0 rounded-xl border p-2.5">
                <p className="text-muted truncate text-[0.65rem] font-semibold tracking-wide uppercase" title={item.label}>
                  {item.label}
                </p>
                <p className="text-foreground mt-0.5 truncate text-sm font-semibold" title={item.value}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {rightCollapsed ? (
        <div className="border-border bg-surface flex w-12 flex-col items-center gap-3 self-start rounded-2xl border py-3 lg:sticky lg:top-20">
          <button
            type="button"
            onClick={() => setRightCollapsed(false)}
            aria-label="Expand Calculation Steps"
            title="Expand Calculation Steps"
            className="text-muted hover:text-foreground flex size-8 items-center justify-center rounded-full transition-colors"
          >
            <PanelRightOpen className="size-4" aria-hidden />
          </button>
          <span
            className="text-muted text-[0.65rem] font-semibold tracking-wide uppercase"
            style={{ writingMode: 'vertical-rl' }}
          >
            Steps
          </span>
        </div>
      ) : (
        <aside className="border-border bg-surface flex w-full min-w-0 flex-col gap-2 rounded-2xl border p-3 lg:sticky lg:top-20 lg:w-96 lg:shrink-0 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-foreground text-sm font-semibold">Calculation Steps</h2>
            <button
              type="button"
              onClick={() => setRightCollapsed(true)}
              aria-label="Collapse calculation steps"
              title="Collapse calculation steps"
              className="border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground flex size-8 items-center justify-center rounded-full border transition-colors"
            >
              <PanelRightClose className="size-4" aria-hidden />
            </button>
          </div>
          {steps.length === 0 ? (
            <p className="text-muted text-xs">Press Calculate to see how the result was worked out.</p>
          ) : (
            <>
              <div className="flex max-h-[42rem] flex-col gap-2.5 overflow-y-auto pr-1">
                {visibleSteps.map((step, index) => (
                  <StepView key={step.id} index={index} step={step} />
                ))}
              </div>
              {steps.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllSteps((value) => !value)}
                  className="text-muted hover:text-foreground self-center text-xs font-medium underline-offset-2 hover:underline"
                >
                  {showAllSteps ? 'Show fewer steps' : `Show all steps (${steps.length})`}
                </button>
              )}
            </>
          )}

          {calc.history.length > 0 && (
            <div className="border-border mt-2 border-t pt-2">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-foreground text-xs font-semibold">History</h3>
                <button
                  type="button"
                  onClick={calc.clearHistory}
                  className="text-muted hover:text-foreground text-xs underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
              <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-xs">
                {calc.history.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2">
                    <span className="text-muted min-w-0 flex-1 truncate" title={entry.label}>
                      {entry.label}
                    </span>
                    <span
                      className="text-foreground max-w-[55%] shrink-0 truncate text-right font-medium"
                      title={entry.summary}
                    >
                      {entry.summary}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
