'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BeforeAfterModalProps {
  title: string;
  beforeLabel?: string;
  afterLabel?: string;
  before: ReactNode;
  after: ReactNode;
  onClose: () => void;
}

/**
 * A popup with the original and the result side by side (stacked on small screens), for a single
 * row in a batch list. Works for either an image or a video preview: the caller passes the actual
 * `<img>`/`<video>` markup rather than a src, since the two media types render differently.
 * Portaled to `<body>` for the same reason `page_detail_modal.tsx` is: a sticky control panel
 * ancestor can otherwise trap this dialog's stacking context under ordinary page content.
 */
export function BeforeAfterModal({
  title,
  beforeLabel = 'Before',
  afterLabel = 'After',
  before,
  after,
  onClose,
}: BeforeAfterModalProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} preview`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-surface flex max-h-full w-full max-w-4xl flex-col gap-3 rounded-2xl p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between gap-4">
          <span className="truncate text-sm font-semibold">{title}</span>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        <div className="grid gap-3 overflow-y-auto sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-semibold tracking-wide uppercase">
              {beforeLabel}
            </p>
            <div className="bg-cream flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl p-2">
              {before}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-semibold tracking-wide uppercase">{afterLabel}</p>
            <div className="bg-cream flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl p-2">
              {after}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
