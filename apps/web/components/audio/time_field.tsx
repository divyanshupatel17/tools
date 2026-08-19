'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatTime, parseTime } from '@/lib/audio/audio_formats';

export interface TimeFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * A `mm:ss.d` formatted time input: type a value directly (`1:30`, `90`, `90.5` all parse), or
 * step it with the up/down arrows. Stays editable while typing the same way `NumberField` does —
 * an unparsable in-progress value doesn't get overwritten mid-keystroke, only clamped on blur.
 */
export function TimeField({
  value,
  onChange,
  min = 0,
  max,
  step = 0.1,
  disabled,
  ...aria
}: TimeFieldProps) {
  const [text, setText] = useState(formatTime(value));
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(formatTime(value));
  }

  function clamp(next: number): number {
    let result = next;
    result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return Math.round(result * 10) / 10;
  }

  function commit(next: number) {
    const clamped = clamp(next);
    setSyncedValue(clamped);
    setText(formatTime(clamped));
    onChange(clamped);
  }

  return (
    <div className="border-border bg-background flex h-10 items-center rounded-full border pr-1 pl-3">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => {
          const parsed = parseTime(event.target.value);
          commit(parsed ?? syncedValue);
        }}
        className="w-full min-w-0 bg-transparent text-sm outline-none"
        {...aria}
      />
      <div className="flex flex-col">
        <button
          type="button"
          disabled={disabled}
          aria-label="Increase"
          tabIndex={-1}
          onClick={() => commit(syncedValue + step)}
          className="text-muted hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Decrease"
          tabIndex={-1}
          onClick={() => commit(syncedValue - step)}
          className="text-muted hover:text-foreground disabled:opacity-50"
        >
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
