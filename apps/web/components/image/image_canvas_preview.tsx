'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Maximize2, X } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';

export interface ImageCanvasPreviewProps {
  /** The source file. Only its name and size are read here; pixels come from `src` or `render`. */
  file: File;
  /** An object URL the parent owns and revokes. Ignored while `render` is provided. */
  src?: string | null;
  /** Paints a live preview (e.g. a canvas) into the same frame instead of an `<img>`. */
  render?: () => ReactNode;
  /** Frame width in pixels. Defaults to 420, matching the PDF workspaces. */
  width?: number;
  /** CSS aspect ratio for the frame, e.g. `"${width} / ${height}"`. Defaults to '4 / 3'. */
  aspectRatio?: string;
  /** Small caption under the frame, e.g. "Live preview · click the corner icon to view". */
  caption?: string;
  /** Shows a "Choose a different file" button under the frame when provided. */
  onReset?: () => void;
  /**
   * When the pixels shown (`src`/`render`) are a re encoded result rather than `file` itself,
   * pass the actual rendered file here. The name and size line, and the view modal, read from
   * this instead of `file` so they describe what is actually on screen.
   */
  displayFile?: File;
  /** Skips the name and size line above the frame, for compact batch rows that label rows
   *  another way (a caption or a strip above them) and would otherwise repeat it. */
  hideFileInfo?: boolean;
  /** Shows a small remove button in the frame's top corner, e.g. for a batch row. */
  onRemove?: () => void;
}

/**
 * Left pane preview: the picture (or a live render callback), a line with the file's safe name
 * and formatted size, and a corner button that opens the shared PageDetailModal on the file.
 * Never creates or revokes object URLs — `src` is owned by the caller.
 */
export function ImageCanvasPreview({
  file,
  src,
  render,
  width = 420,
  aspectRatio = '4 / 3',
  caption,
  onReset,
  displayFile,
  hideFileInfo,
  onRemove,
}: ImageCanvasPreviewProps) {
  const [viewing, setViewing] = useState(false);
  const hasVisual = Boolean(render) || Boolean(src);
  const shown = displayFile ?? file;

  return (
    <div className="flex flex-col items-center">
      {!hideFileInfo && (
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(shown.name)}</span>
          {' · '}
          {formatBytes(shown.size)}
        </p>
      )}

      <div
        className="border-border bg-cream relative overflow-hidden rounded-xl border shadow-sm"
        style={{ width, aspectRatio }}
      >
        {render ? (
          render()
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={safeFileName(file.name)} className="size-full object-contain" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
          </div>
        )}

        {hasVisual && (
          <button
            type="button"
            onClick={() => setViewing(true)}
            aria-label={`View ${safeFileName(shown.name)}`}
            title="View the full image"
            className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
          >
            <Maximize2 aria-hidden className="size-3.5" />
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${safeFileName(shown.name)}`}
            title={`Remove ${safeFileName(shown.name)}`}
            className="bg-surface/90 border-border text-muted hover:text-foreground absolute top-1 right-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        )}
      </div>

      {caption && <p className="text-muted mt-2 text-center text-xs">{caption}</p>}

      {onReset && (
        <Button size="sm" variant="ghost" onClick={onReset} className="mt-3">
          Choose a different file
        </Button>
      )}

      {viewing && <PageDetailModal file={shown} pageIndex={0} onClose={() => setViewing(false)} />}
    </div>
  );
}
