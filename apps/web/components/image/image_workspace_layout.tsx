import type { ReactNode } from 'react';

export interface ImageWorkspaceLayoutProps {
  /** The visual: the image, a live canvas preview, or a batch grid. Scrolls if it overflows. */
  preview: ReactNode;
  /** The control panel content, typically a <ControlPanel>. Sticks to the top on large screens. */
  panel: ReactNode;
}

/**
 * The two column workspace shell every image tool shares: preview on the left, a sticky
 * control panel on the right. Matches `features/pdf/add_watermark/workspace.tsx` exactly so
 * every tool built on this kit looks and behaves the same way.
 */
export function ImageWorkspaceLayout({ preview, panel }: ImageWorkspaceLayoutProps) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border-border bg-surface max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border p-4">
        {preview}
      </div>
      <aside className="border-border bg-surface rounded-2xl border p-4 lg:sticky lg:top-20">
        {panel}
      </aside>
    </div>
  );
}
