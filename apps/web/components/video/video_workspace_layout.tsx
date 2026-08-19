import type { ReactNode } from 'react';

export interface VideoWorkspaceLayoutProps {
  /** The player stage: before/after panes, a timeline, whatever the tool needs to show. */
  stage: ReactNode;
  /**
   * The control panel content, typically a <ControlPanel>. Sticks to the top on large screens
   * in 'side' mode. Omit entirely in 'below' mode when `stage` already contains everything (a
   * single editor tool renders preview, timeline and actions as one unified card instead of
   * two visually separate boxes).
   */
  panel?: ReactNode;
  /**
   * 'side' (default) is the compare-two-players layout every resize/compress style tool uses:
   * stage on the left, a 360px sticky panel on the right. 'below' is for an editor whose panel
   * IS the timeline — full width, sitting under one big preview player, the way any modern
   * video editor lays itself out — since a 360px sidebar has no room for a real timeline.
   */
  panelPosition?: 'side' | 'below';
}

/**
 * The full width dashboard shell every video tool shares. Unlike the 340px sticky aside PDF
 * and Image tools use, a video tool needs room for two players side by side plus a timeline,
 * so this breaks out of the page's centered `Container` to the full viewport width instead of
 * competing with it for space. The breadcrumb and the tool title above it stay inside the
 * normal container; only this shell goes edge to edge.
 */
export function VideoWorkspaceLayout({ stage, panel, panelPosition = 'side' }: VideoWorkspaceLayoutProps) {
  if (panelPosition === 'below') {
    return (
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-x-hidden px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5">
          <div className="flex flex-col gap-4">{stage}</div>
          {panel && <div className="border-border bg-surface rounded-2xl border p-4">{panel}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-x-hidden px-4 sm:px-6">
      <div className="mx-auto w-full max-w-[1680px]">
        <div className={`grid items-start gap-5 ${panel ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
          <div className="flex flex-col gap-4">{stage}</div>
          {panel && (
            <aside className="border-border bg-surface rounded-2xl border p-4 lg:sticky lg:top-20">{panel}</aside>
          )}
        </div>
      </div>
    </div>
  );
}
