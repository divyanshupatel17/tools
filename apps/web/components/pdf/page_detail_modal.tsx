'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import { safeFileName } from '@tools/file_utils';
import { createPreviewUrl } from '@/lib/image/decode';
import { detectFormat } from '@/lib/image/image_formats';
import { readPdfPagesFrom } from '@/lib/pdf/pdf_pages';
import { Button } from '@/components/ui/button';

export interface PageDetailModalProps {
  file: File;
  /** Page to scroll to and render first; the rest of the document loads in around it. */
  pageIndex: number;
  /** Per-page rotation in degrees, keyed by 0-based page index. */
  rotations?: Record<number, number>;
  onClose: () => void;
}

type PageSlot = { status: 'pending' } | { status: 'ready'; src: string } | { status: 'error' };

const PENDING: PageSlot = { status: 'pending' };

/**
 * A scrollable, full-document popup: every page renders in place (not just the one the
 * user clicked), re-rasterised from the source PDF rather than upscaling a thumbnail, so
 * scrolling up or down never needs a second click to "view the next page in detail". A page
 * that fails to render shows its own inline notice — it never takes the rest of the popup
 * down with it, the way one malformed page used to fail the whole document.
 *
 * Non-PDF files (a scanned or uploaded image) skip pdf.js entirely and render straight from
 * an object URL, inside the same dialog chrome, so every tool can open this modal on either
 * a PDF or a plain image without building its own preview.
 */
export function PageDetailModal({ file, pageIndex, rotations, onClose }: PageDetailModalProps) {
  // `file.type` is unreliable for this (a HEIC picked on Windows commonly reports an empty
  // MIME type), so the real image formats are sniffed from magic bytes instead. `null` means
  // still detecting; only a definite true or false picks which branch renders.
  const [isImage, setIsImage] = useState<boolean | null>(null);

  const [pages, setPages] = useState<PageSlot[]>([]);
  const [error, setError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const urls = useRef(new Set<string>());
  const pageNodes = useRef<Record<number, HTMLDivElement | null>>({});
  const scrolled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => setIsImage(null));
    detectFormat(file).then((format) => {
      if (!cancelled) setIsImage(format !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // HEIC and TIFF cannot be painted by the browser's own image decoder, so createPreviewUrl
  // rasterises those through decodeImage() first; everything else is the raw file, unchanged.
  useEffect(() => {
    if (isImage !== true) return;
    let cancelled = false;
    let url: string | null = null;
    createPreviewUrl(file)
      .then((created) => {
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        url = created;
        setImageSrc(created);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, isImage]);

  useEffect(() => {
    if (isImage !== false) return;
    const controller = new AbortController();
    const loaded = new Set<string>();
    urls.current = loaded;
    // Dev's Strict Mode mounts every effect twice (mount, cleanup, mount): the first run gets
    // aborted almost immediately, but an in-flight page render can still finish and call back
    // after that. `live` stops that stale run from writing state over the real, second run.
    let live = true;

    readPdfPagesFrom(
      file,
      pageIndex,
      (page) => {
        if (!live) return;
        if (page.thumbnail) loaded.add(page.thumbnail);
        const slot: PageSlot = page.thumbnail
          ? { status: 'ready', src: page.thumbnail }
          : { status: 'error' };
        setPages((current) => {
          const next =
            current.length > page.index
              ? [...current]
              : [...current, ...Array(page.index - current.length + 1).fill(PENDING)];
          next[page.index] = slot;
          return next;
        });
      },
      controller.signal,
      760,
      (total) => {
        if (!live) return;
        setPages((current) => (current.length >= total ? current : Array(total).fill(PENDING)));
      },
    ).catch((cause) => {
      if (!live) return;
      console.error('Failed to render PDF for preview:', cause);
      setError(true);
    });

    return () => {
      live = false;
      controller.abort();
      for (const url of loaded) URL.revokeObjectURL(url);
    };
  }, [file, pageIndex, isImage]);

  // Every page above the target has to finish rendering (or fail trying) before we scroll to
  // it, or its placeholder-to-image height jump (240px min-height vs. the real render) shifts
  // the page out from under the viewport a moment after we land on it.
  useEffect(() => {
    if (isImage) return;
    if (scrolled.current) return;
    if (pages.length <= pageIndex) return;
    if (pages.slice(0, pageIndex + 1).some((slot) => slot.status === 'pending')) return;

    const node = pageNodes.current[pageIndex];
    if (node) {
      node.scrollIntoView({ block: 'start' });
      scrolled.current = true;
    }
  }, [pages, pageIndex, isImage]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portaled straight to <body>: any ancestor the caller happens to render this inside (most
  // often the sticky control panel aside) can establish its own stacking context, which would
  // otherwise trap this dialog's z-index and let ordinary z-indexed page content (drag handles,
  // view buttons) paint on top of it despite z-50.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${safeFileName(file.name)} preview`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-surface flex max-h-full w-full max-w-2xl flex-col gap-3 rounded-2xl p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between gap-4">
          <span className="truncate text-sm font-semibold">{safeFileName(file.name)}</span>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        <div className="bg-cream min-h-[200px] flex-1 overflow-y-auto rounded-xl">
          {error && (
            <span className="text-danger flex items-center gap-2 p-8 text-sm">
              <TriangleAlert aria-hidden className="size-4" />
              This document could not be opened.
            </span>
          )}

          {!error && isImage === null && (
            <div className="flex min-h-[240px] w-full items-center justify-center p-4">
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            </div>
          )}

          {!error && isImage === true && (
            <div className="flex min-h-[240px] w-full items-center justify-center p-4">
              {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSrc}
                  alt={safeFileName(file.name)}
                  className="max-h-[70vh] max-w-full rounded shadow-sm"
                  style={{ transform: `rotate(${rotations?.[pageIndex] ?? 0}deg)` }}
                />
              ) : (
                <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
              )}
            </div>
          )}

          {!error && isImage === false && (
            <div className="flex flex-col items-center gap-6 p-4">
              {pages.map((slot, index) => (
                <div
                  key={index}
                  ref={(node) => {
                    pageNodes.current[index] = node;
                  }}
                  className="flex w-full flex-col items-center gap-1.5"
                >
                  <span className="text-muted text-xs font-medium">Page {index + 1}</span>
                  <div className="flex min-h-[240px] w-full items-center justify-center">
                    {slot.status === 'ready' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={slot.src}
                        alt={`Page ${index + 1}`}
                        className="max-h-[70vh] max-w-full rounded shadow-sm"
                        style={{ transform: `rotate(${rotations?.[index] ?? 0}deg)` }}
                      />
                    )}
                    {slot.status === 'error' && (
                      <span className="text-muted flex flex-col items-center gap-1.5 text-xs">
                        <TriangleAlert aria-hidden className="size-4" />
                        Page {index + 1} could not be rendered
                      </span>
                    )}
                    {slot.status === 'pending' && (
                      <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
