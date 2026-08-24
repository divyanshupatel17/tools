'use client';

import { forwardRef, useState, type KeyboardEvent } from 'react';

export interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
  /**
   * Lets the field hold a fractional value like `1.5` or `55.5`. Defaults to whole numbers
   * only. Turn this on anywhere a person would reasonably type a fraction — a target file size
   * foremost, since "1.5 MB" is a completely ordinary target and clamping it to "1" or "2" is
   * not what anyone asked for.
   */
  allowDecimal?: boolean;
  'aria-label'?: string;
  /** Passed straight to the underlying input, e.g. for a grid that wires up arrow key navigation. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * A number input that stays editable while the user is typing: the field can go empty
 * or hold a partial value (including a trailing "." with `allowDecimal`) without the parent
 * snapping it back, so backspace works. It only clamps to `min`/`max` and reports a final
 * value once the field loses focus.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onChange, min, max, disabled, className, id, allowDecimal = false, onKeyDown, ...aria },
  ref,
) {
  const [text, setText] = useState(String(value));
  // Tracks the prop we last rendered text for, so an external change (e.g. a "rotate all"
  // button) overwrites the field, but our own onChange/onBlur updates do not fight it back.
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(String(value));
  }

  function clamp(next: number): number {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  }

  // A signed range has to accept a lone "-" as an intermediate state, otherwise the minus can
  // never be typed at all. The numeric inputMode keypad has no minus key, so signed fields fall
  // back to the text keyboard.
  const signed = min !== undefined && min < 0;
  // Intermediate states a decimal field must tolerate while typing: "", "-", "1.", ".5".
  const intermediate = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode={signed ? 'text' : allowDecimal ? 'decimal' : 'numeric'}
      pattern={
        allowDecimal ? (signed ? '-?[0-9]*\\.?[0-9]*' : '[0-9]*\\.?[0-9]*') : signed ? '-?[0-9]*' : '[0-9]*'
      }
      value={text}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        const allowed = signed ? intermediate : allowDecimal ? /^\d*\.?\d*$/ : /^\d+$/;
        if (raw !== '' && !allowed.test(raw)) return;
        setText(raw);
        if (raw !== '' && raw !== '-' && !raw.endsWith('.')) {
          const parsed = Number(raw);
          if (!Number.isNaN(parsed) && (max === undefined || parsed <= max)) onChange(parsed);
        }
      }}
      onBlur={(event) => {
        const raw = event.target.value;
        // An emptied or half typed field ("-", "1.", ".") restores what was committed before
        // rather than snapping to `min`, which on a signed range would mean a full swing to -180.
        const fallback = syncedValue;
        const empty = raw.trim() === '' || raw === '-' || raw === '.';
        const parsed = empty ? fallback : Number(raw);
        const clamped = clamp(Number.isNaN(parsed) ? fallback : parsed);
        setText(String(clamped));
        onChange(clamped);
      }}
      onKeyDown={onKeyDown}
      className={className}
      {...aria}
    />
  );
});
