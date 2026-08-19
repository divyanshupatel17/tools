'use client';

import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface ControlPanelProps {
  children: ReactNode;
}

/** Stacks the dashboard's control column with the spacing every video tool shares. */
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

export interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Appended after the value in the label, e.g. '%' or ' kbps'. */
  suffix?: string;
  disabled?: boolean;
  hint?: string;
  id?: string;
}

/** A range input with its current value shown in the label. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
  disabled,
  hint,
  id,
}: SliderFieldProps) {
  return (
    <label htmlFor={id} className="text-sm">
      <span className="font-semibold">
        {label} ({value}
        {suffix})
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="accent-brand mt-1.5 w-full"
      />
      {hint && <span className="text-muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export interface SegmentedControlOption<TValue extends string> {
  value: TValue;
  label: string;
}

export interface SegmentedControlProps<TValue extends string> {
  options: readonly SegmentedControlOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  disabled?: boolean;
}

/** A row of equal width toggle buttons, e.g. the compress mode picker. */
export function SegmentedControl<TValue extends string>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps<TValue>) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          aria-pressed={value === option.value}
          className={cn(
            'flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
            value === option.value
              ? 'bg-brand border-brand text-on-brand'
              : 'border-border text-muted hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface ProgressBarProps {
  /** 0 to 1. */
  progress: number;
  label?: string;
}

/** The shared busy indicator: a labelled `role="progressbar"` bar plus a percent line under it. */
export function ProgressBar({ progress, label }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress"
        className="bg-cream h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-brand h-full rounded-full transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-muted mt-1.5 text-xs">
        {label ?? 'Working'} · {percent}%
      </p>
    </div>
  );
}

export interface NoticeProps {
  children: ReactNode;
  /** 'danger' is an alert (default); 'info' is the quiet cream caveat banner. */
  variant?: 'danger' | 'info';
}

/** An error alert or a quiet info banner. */
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
