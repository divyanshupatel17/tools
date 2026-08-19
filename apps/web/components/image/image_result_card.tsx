'use client';

import { useState } from 'react';
import { Download, Maximize2 } from 'lucide-react';
import { formatBytes } from '@tools/file_utils';
import type { ProcessorArtifact } from '@tools/tool_engine';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';

export interface ImageResultItem {
  artifact: ProcessorArtifact;
  /** Short caption after the size, e.g. "1600 x 900" or "62% smaller". No leading separator. */
  caption?: string;
  /** Overrides the default formatBytes() size line, e.g. to show both MB and KB. */
  sizeLabel?: string;
}

export interface ImageResultCardProps {
  artifacts: readonly ImageResultItem[];
  /** Read by screen readers as the section name. Defaults to 'Result'. */
  label?: string;
  /** Shown as a "Download all" button when there is more than one artifact. */
  onDownloadAll?: () => void;
}

/**
 * The result panel every workspace ends with: each artifact's name and size, a View button that
 * opens the shared PageDetailModal (built from the artifact's own blob, never a codec), and a
 * Download button. A "Download all" appears once there is more than one artifact.
 */
export function ImageResultCard({
  artifacts,
  label = 'Result',
  onDownloadAll,
}: ImageResultCardProps) {
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  if (artifacts.length === 0) return null;
  const viewingItem = viewingIndex !== null ? artifacts[viewingIndex] : undefined;
  const viewingFile = viewingItem
    ? new File([viewingItem.artifact.blob], viewingItem.artifact.file_name, {
        type: viewingItem.artifact.mime_type,
      })
    : null;

  return (
    <section
      aria-label={label}
      className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
    >
      {artifacts.map((item, index) => (
        <div key={`${item.artifact.file_name}-${index}`} className="flex flex-col gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{item.artifact.file_name}</span>
            <span className="text-muted block text-xs">
              {item.sizeLabel ?? formatBytes(item.artifact.blob.size)}
              {item.caption ? ` · ${item.caption}` : ''}
            </span>
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setViewingIndex(index)}>
              <Maximize2 aria-hidden className="size-4" />
              View
            </Button>
            <Button
              className="flex-1"
              onClick={() => downloadBlob(item.artifact.blob, item.artifact.file_name)}
            >
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </div>
        </div>
      ))}

      {artifacts.length > 1 && onDownloadAll && (
        <Button variant="secondary" className="w-full" onClick={onDownloadAll}>
          <Download aria-hidden className="size-4" />
          Download all
        </Button>
      )}

      {viewingFile && (
        <PageDetailModal file={viewingFile} pageIndex={0} onClose={() => setViewingIndex(null)} />
      )}
    </section>
  );
}
