'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Expand,
  GripVertical,
  Minimize2,
  Moon,
  Palette,
  PictureInPicture2,
  Sun,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ThemePickerPanel } from './theme_picker';
import { TimeFormatPanel } from './time_format_picker';
import { QuickSwitchLink } from './quick_switch_link';
import { useWatchPrefs } from '../state/use_watch_prefs';
import type { WatchMode } from '../state/use_watch_prefs';

interface ActionBarProps {
  fullscreen: { isFullscreen: boolean; toggle: () => void; supported: boolean };
  pip: { supported: boolean; isOpen: boolean; open: () => void; close: () => void };
  otherTool: { href: string; label: string };
  mode: WatchMode;
  zoom: { value: number; onZoomIn: () => void; onZoomOut: () => void; min: number; max: number };
}

type PanelId = 'theme' | 'format';
type BarOrientation = 'horizontal' | 'vertical';

/**
 * Meta controls (fullscreen, theme, sound, PiP, quick switch). Outside fullscreen it sits in
 * the normal page flow (`sticky`), so it never overlaps the watch card's own controls. Inside
 * fullscreen it becomes a small floating HUD with its own light/dark toggle and zoom, draggable
 * anywhere on screen. Wherever a drag ends, the bar re-orients to match the nearest screen edge:
 * closer to the left or right edge becomes a vertical column (for docking against that side),
 * closer to the top or bottom edge becomes a horizontal row — never left stuck in the orientation
 * that doesn't fit where it landed.
 *
 * Theme and time-format each open a detail panel. Both render through a portal as a fully
 * independent centred modal — not anchored to the bar at all — so the bar's position,
 * orientation or drag state can never distort or get covered by the panel.
 */
/** Keeps the whole bar's box on screen, with a small margin, whatever size it currently is. */
function clampToViewport(left: number, top: number, width: number, height: number, margin = 8) {
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

/** Vertical when nearer a side edge than a top/bottom one, horizontal otherwise. */
function orientationForRect(rect: { left: number; top: number; right: number; bottom: number }): BarOrientation {
  const distToSide = Math.min(rect.left, window.innerWidth - rect.right);
  const distToTopBottom = Math.min(rect.top, window.innerHeight - rect.bottom);
  return distToSide < distToTopBottom ? 'vertical' : 'horizontal';
}

export function ActionBar({ fullscreen, pip, otherTool, mode, zoom }: ActionBarProps) {
  const prefs = useWatchPrefs();
  const barRef = useRef<HTMLDivElement>(null);
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [orientation, setOrientation] = useState<BarOrientation>('horizontal');
  // null = not dragged yet, use the default CSS-anchored position (always fully on screen).
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ startX: number; startY: number; originLeft: number; originTop: number } | null>(null);

  useEffect(() => {
    if (!openPanel) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenPanel(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openPanel]);

  useEffect(() => {
    if (!fullscreen.isFullscreen) return;
    function onResize() {
      const el = barRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition((current) => (current ? clampToViewport(rect.left, rect.top, rect.width, rect.height) : current));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fullscreen.isFullscreen]);

  function onDragPointerDown(event: ReactPointerEvent) {
    event.preventDefault();
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDragging(true);
    dragOrigin.current = { startX: event.clientX, startY: event.clientY, originLeft: rect.left, originTop: rect.top };

    function onMove(moveEvent: PointerEvent) {
      const origin = dragOrigin.current;
      if (!origin || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const rawLeft = origin.originLeft + (moveEvent.clientX - origin.startX);
      const rawTop = origin.originTop + (moveEvent.clientY - origin.startY);
      setPosition(clampToViewport(rawLeft, rawTop, rect.width, rect.height));
    }
    function onUp() {
      dragOrigin.current = null;
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!barRef.current) return;

      const rect = barRef.current.getBoundingClientRect();
      const nextOrientation = orientationForRect(rect);

      // A row and its column equivalent hold the same icons, so their footprint is
      // (roughly) each other's width/height swapped — re-clamp with that estimate rather
      // than the pre-flip rect, so a bar docked at an edge doesn't hang off screen for the
      // one frame between the orientation flip and its own next layout.
      const flipped = nextOrientation !== orientation;
      const width = flipped ? rect.height : rect.width;
      const height = flipped ? rect.width : rect.height;

      if (flipped) setOrientation(nextOrientation);
      setPosition(clampToViewport(rect.left, rect.top, width, height));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const vertical = fullscreen.isFullscreen && orientation === 'vertical';

  return (
    <>
      <div
        ref={barRef}
        data-watch-theme={prefs.theme}
        data-watch-mode={mode}
        style={fullscreen.isFullscreen && position ? { left: position.left, top: position.top } : undefined}
        className={cn(
          'watch-widget z-20 flex items-center gap-1 rounded-full p-1.5 shadow-lg',
          vertical ? 'flex-col' : 'flex-row',
          fullscreen.isFullscreen
            ? cn(
                'fixed',
                position ? '' : 'bottom-8 left-1/2 -translate-x-1/2',
                !dragging && 'transition-[left,top] duration-300 ease-out',
              )
            : 'sticky bottom-4 mx-auto mt-8 w-fit',
        )}
      >
        <div key={orientation} className={cn('watch-bar-reflow flex items-center gap-1', vertical ? 'flex-col' : 'flex-row')}>
          <IconButton
            label={fullscreen.isFullscreen ? 'Exit fullscreen' : 'Fullscreen mode'}
            onClick={fullscreen.toggle}
            disabled={!fullscreen.supported}
          >
            {fullscreen.isFullscreen ? (
              <Minimize2 aria-hidden className="size-4" />
            ) : (
              <Expand aria-hidden className="size-4" />
            )}
          </IconButton>

          <IconButton
            label="Change design theme"
            onClick={() => setOpenPanel((current) => (current === 'theme' ? null : 'theme'))}
            pressed={openPanel === 'theme'}
            indicatorColor={prefs.accent ?? undefined}
          >
            <Palette aria-hidden className="size-4" />
          </IconButton>

          <IconButton
            label="Change time format"
            onClick={() => setOpenPanel((current) => (current === 'format' ? null : 'format'))}
            pressed={openPanel === 'format'}
          >
            <Clock aria-hidden className="size-4" />
          </IconButton>

          {fullscreen.isFullscreen && (
            <IconButton
              label={prefs.mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
              onClick={() => prefs.set({ mode: prefs.mode === 'dark' ? 'light' : 'dark' })}
            >
              {prefs.mode === 'dark' ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
            </IconButton>
          )}

          <IconButton
            label={prefs.soundOn ? 'Mute sound alerts' : 'Enable sound alerts'}
            onClick={() => prefs.set({ soundOn: !prefs.soundOn })}
          >
            {prefs.soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
          </IconButton>

          <IconButton
            label={pip.isOpen ? 'Close floating window' : 'Open floating window'}
            onClick={() => (pip.isOpen ? pip.close() : void pip.open())}
            disabled={!pip.supported}
          >
            <PictureInPicture2 aria-hidden className="size-4" />
          </IconButton>

          {fullscreen.isFullscreen && (
            <>
              <IconButton label="Zoom out" onClick={zoom.onZoomOut} disabled={zoom.value <= zoom.min}>
                <ZoomOut aria-hidden className="size-4" />
              </IconButton>
              <IconButton label="Zoom in" onClick={zoom.onZoomIn} disabled={zoom.value >= zoom.max}>
                <ZoomIn aria-hidden className="size-4" />
              </IconButton>
            </>
          )}

          <QuickSwitchLink href={otherTool.href} label={otherTool.label} isFullscreen={fullscreen.isFullscreen} />

          {fullscreen.isFullscreen && (
            <button
              type="button"
              onPointerDown={onDragPointerDown}
              aria-label="Drag to move this bar"
              title="Drag sideways to dock as a column, up or down to stay a row"
              className={cn(
                'watch-button flex size-10 shrink-0 items-center justify-center rounded-full',
                vertical ? 'cursor-row-resize' : 'cursor-col-resize',
                dragging && 'cursor-grabbing',
              )}
            >
              <GripVertical aria-hidden className={cn('size-4', vertical && 'rotate-90')} />
            </button>
          )}
        </div>
      </div>

      {openPanel &&
        createPortal(
          <ActionPanelModal
            title={openPanel === 'theme' ? 'Watch appearance' : 'Time format'}
            theme={prefs.theme}
            mode={mode}
            accent={prefs.accent}
            onClose={() => setOpenPanel(null)}
          >
            {openPanel === 'theme' ? <ThemePickerPanel mode={mode} /> : <TimeFormatPanel />}
          </ActionPanelModal>,
          // The Fullscreen API only paints the fullscreen element's own subtree — a portal to
          // document.body would render outside it and never actually appear on screen while
          // fullscreen is active, which is exactly why the panel silently "didn't open" there.
          document.fullscreenElement ?? document.body,
        )}
    </>
  );
}

function ActionPanelModal({
  title,
  theme,
  mode,
  accent,
  onClose,
  children,
}: {
  title: string;
  theme: string;
  mode: WatchMode;
  accent: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const style = accent ? ({ '--w-accent': accent } as CSSProperties) : undefined;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        aria-modal="true"
        data-watch-theme={theme}
        data-watch-mode={mode}
        style={style}
        className="watch-widget watch-face flex max-h-[85vh] w-[min(26rem,92vw)] flex-col overflow-hidden rounded-[1.75rem] shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between px-6 pt-6">
          <p className="text-sm font-semibold" style={{ color: 'var(--w-text)' }}>
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="watch-button flex size-8 shrink-0 items-center justify-center rounded-full"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 pt-4">{children}</div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  indicatorColor,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  indicatorColor?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={label}
      aria-label={label}
      className={cn(
        'watch-button relative flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-30',
        pressed && 'watch-button-primary',
      )}
    >
      {children}
      {indicatorColor && (
        <span
          aria-hidden
          style={{ background: indicatorColor }}
          className="absolute right-0.5 bottom-0.5 size-2.5 rounded-full ring-2 ring-[var(--w-button)]"
        />
      )}
    </button>
  );
}
