import type { ComponentType, ReactNode } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface ControlPanelProps {
  children: ReactNode;
}

/** Stacks the right pane's controls with the spacing every Text workspace aside uses. */
export function ControlPanel({ children }: ControlPanelProps) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  /** One short caveat under the control. Never a paragraph. */
  hint?: string;
  children: ReactNode;
}

/** A labelled control: bold label, the control itself, and an optional one line hint. */
export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className="text-sm">
      <span className="font-semibold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="text-muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export interface NoticeProps {
  children: ReactNode;
  /** 'danger' is an alert (default); 'info' is the quiet cream caveat banner. */
  variant?: 'danger' | 'info';
}

/** An error alert or a quiet info banner, matching every other category's control panel. */
export function Notice({ children, variant = 'danger' }: NoticeProps) {
  if (variant === 'info') {
    return <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">{children}</p>;
  }
  return (
    <p role="alert" className="text-danger flex items-start gap-2 text-xs">
      <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
      {children}
    </p>
  );
}

export interface StatTileProps {
  icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  label: string;
  value: string;
  /** Overrides how the value wraps — e.g. `break-all` for a long, spaceless word that would
   * otherwise overflow its tile instead of wrapping onto a new line. */
  valueClassName?: string;
}

/** One number in the live results grid: an icon badge beside a small label over a bold value. */
export function StatTile({ icon: Icon, label, value, valueClassName }: StatTileProps) {
  return (
    <div className="border-border bg-cream/40 flex items-center gap-2.5 rounded-xl border p-3">
      <span className="border-border bg-background flex size-8 shrink-0 items-center justify-center rounded-full border">
        <Icon aria-hidden className="text-brand size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="text-muted block text-xs leading-tight break-words">{label}</span>
        <span
          className={`text-foreground block text-base font-bold ${valueClassName ?? 'break-words'}`}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

const STAT_GRID_COLUMNS = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
} as const;

/** Lays out a set of `StatTile`s, two or three to a row, the shared results layout for Text
 * tools. */
export function StatGrid({
  columns = 2,
  children,
}: {
  columns?: 2 | 3;
  children: ReactNode;
}) {
  return <div className={`grid ${STAT_GRID_COLUMNS[columns]} gap-2.5`}>{children}</div>;
}

export interface RadioOptionCardProps {
  icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

/** One choice in a single select list of options, each with its own icon and one line
 * description — an operating mode picker, not a settings toggle. Selection is shown by the
 * highlighted card and the filled radio dot; used by Text Reverser and Sort & Shuffle Text. */
export function RadioOptionCard({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
}: RadioOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        selected ? 'border-brand bg-cream/60' : 'border-border hover:bg-surface-muted',
      )}
    >
      <span className="border-border bg-background flex size-9 shrink-0 items-center justify-center rounded-full border">
        <Icon aria-hidden className="text-brand size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted block text-xs">{description}</span>
      </span>
      <span
        className={cn(
          'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-brand' : 'border-border',
        )}
      >
        {selected && <span className="bg-brand size-1.5 rounded-full" />}
      </span>
    </button>
  );
}

export interface CheckboxOptionCardProps {
  icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}

/** One independently toggleable option in a multi select list — several can be on at once,
 * unlike `RadioOptionCard`'s single choice. Used by Text Cleaner's cleaning options. */
export function CheckboxOptionCard({
  icon: Icon,
  label,
  description,
  checked,
  onToggle,
}: CheckboxOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        checked ? 'border-brand bg-cream/60' : 'border-border hover:bg-surface-muted',
      )}
    >
      <span className="border-border bg-background flex size-9 shrink-0 items-center justify-center rounded-full border">
        <Icon aria-hidden className="text-brand size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted block text-xs">{description}</span>
      </span>
      <span
        className={cn(
          'mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border-2',
          checked ? 'border-brand bg-brand' : 'border-border',
        )}
      >
        {checked && <Check aria-hidden className="text-on-brand size-3.5" />}
      </span>
    </button>
  );
}
