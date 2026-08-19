'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { validateFiles, type FileRule } from '@tools/file_utils';
import { cn } from '@/lib/utils/cn';

export interface FileUploadProps {
  rule: FileRule;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

/** Collects and validates files. It never reads or transmits them — that is the processor's job. */
export function FileUpload({
  rule,
  multiple = false,
  accept,
  disabled = false,
  onFiles,
  onDragStateChange,
}: FileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const accept_files = useCallback(
    (list: FileList | null) => {
      const files = Array.from(list ?? []);
      if (files.length === 0) return;
      const result = validateFiles(files, rule);
      setErrors(result.errors);
      if (result.ok) onFiles(files);
    },
    [rule, onFiles],
  );

  const setDrag = useCallback(
    (next: boolean) => {
      setDragging(next);
      onDragStateChange?.(next);
    },
    [onDragStateChange],
  );

  return (
    <div className="mx-auto w-full max-w-xl">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          if (!disabled) accept_files(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-card border-2 border-dashed p-8 text-center transition-colors',
          dragging ? 'border-brand bg-surface-muted' : 'border-border bg-surface',
          disabled && 'opacity-60',
        )}
      >
        <Upload aria-hidden className="text-muted mx-auto size-7" />
        <label
          htmlFor={inputId}
          className="decoration-brand mt-3 block cursor-pointer text-sm font-medium underline decoration-2 underline-offset-4"
        >
          Choose {multiple ? 'files' : 'a file'}
        </label>
        <p className="text-muted mt-1 text-sm">or drop {multiple ? 'them' : 'it'} here</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          multiple={multiple}
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            accept_files(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="text-danger mt-3 space-y-1 text-sm">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
