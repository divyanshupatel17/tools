'use client';

import { forwardRef, useImperativeHandle, useRef, type UIEvent } from 'react';
import { cn } from '@/lib/utils/cn';

export interface NumberedTextareaProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeightClassName?: string;
  className?: string;
  /** Fires alongside the gutter's own scroll sync — for a caller that also needs to know when
   * this textarea scrolled, e.g. to mirror the position into a preview pane. */
  onScroll?: (event: UIEvent<HTMLTextAreaElement>) => void;
}

/** A textarea with a line number gutter that scrolls in lockstep with it — for line oriented
 * tools (Line Editor, and anything else that works line by line) where seeing "this is line 6"
 * matters. Wrapping is off and long lines scroll horizontally instead, since a wrapped line
 * would otherwise span two visual rows under one gutter number. The outer box carries the
 * resize handle (`resize-y`), not the textarea itself, so the gutter resizes along with it. The
 * forwarded ref is the textarea element itself, for a caller that needs to read or drive its
 * scroll position (e.g. two way sync scroll with a live preview). */
export const NumberedTextarea = forwardRef<HTMLTextAreaElement, NumberedTextareaProps>(
  function NumberedTextarea(
    {
      value,
      onChange,
      placeholder,
      readOnly,
      minHeightClassName = 'min-h-[45vh]',
      className,
      onScroll,
    },
    forwardedRef,
  ) {
    const gutterRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(forwardedRef, () => textareaRef.current!, []);
    const lineCount = value === '' ? 1 : value.split('\n').length;

    function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
      if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
      onScroll?.(event);
    }

    return (
      <div
        className={cn(
          'border-border bg-background flex resize-y overflow-hidden rounded-2xl border',
          minHeightClassName,
          className,
        )}
      >
        <div
          ref={gutterRef}
          aria-hidden
          className="text-muted bg-cream/40 border-border shrink-0 overflow-hidden border-r py-4 pr-2 pl-3 text-right font-mono text-sm leading-6 select-none"
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          onScroll={handleScroll}
          placeholder={placeholder}
          readOnly={readOnly}
          wrap="off"
          className="min-w-0 flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 whitespace-pre outline-none"
        />
      </div>
    );
  },
);
