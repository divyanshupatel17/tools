'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { useWatchPrefs, type WatchMode } from '../state/use_watch_prefs';

interface WatchShellProps {
  children: ReactNode;
  className?: string;
  /** Site theme outside fullscreen, the user's own choice inside it — see `use_effective_watch_mode`. */
  mode: WatchMode;
  /** Scales the face and controls up or down without affecting the action bar. */
  zoom?: number;
  /**
   * Skips this shell's own themed card chrome (background, rounded corners, padding) — used in
   * fullscreen, where the workspace's outer wrapper already paints that same full-bleed themed
   * background. Without this, fullscreen nested a smaller rounded card of the exact same colour
   * inside the page it already sits on, which read as a redundant "card inside a card" rather
   * than the content actually using the screen.
   */
  plain?: boolean;
}

/**
 * The themed container every watch face and its controls render inside. Applies the chosen
 * theme and light/dark mode as data attributes so `styles/globals.css`'s `.watch-widget` blocks
 * pick up the right token set, plus an inline accent override when the user has picked a custom
 * colour. Fullscreen and Picture-in-Picture target a wrapper one level up (see the workspace),
 * since the action bar sits alongside this card, not inside it.
 */
export function WatchShell({ children, className, mode, zoom = 1, plain = false }: WatchShellProps) {
  const prefs = useWatchPrefs();
  const style: CSSProperties = prefs.accent ? ({ '--w-accent': prefs.accent } as CSSProperties) : {};

  return (
    <div
      data-watch-theme={plain ? undefined : prefs.theme}
      data-watch-mode={plain ? undefined : mode}
      style={plain ? undefined : style}
      className={cn(
        'flex w-full flex-col items-center gap-8',
        plain ? 'py-4' : 'watch-widget rounded-3xl p-6 sm:p-10',
        className,
      )}
    >
      <div
        style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
        className="flex w-full flex-col items-center gap-8 transition-transform duration-150 ease-out"
      >
        {children}
      </div>
    </div>
  );
}
