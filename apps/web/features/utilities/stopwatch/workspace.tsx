'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Pause, PictureInPicture2, Play, RotateCcw } from 'lucide-react';
import { WatchShell } from '@/features/utilities/_shared/components/watch_shell';
import { WatchFaceDigital } from '@/features/utilities/_shared/components/watch_face_digital';
import { WatchFaceAnalog } from '@/features/utilities/_shared/components/watch_face_analog';
import { ActionBar } from '@/features/utilities/_shared/components/action_bar';
import { useFullscreen } from '@/features/utilities/_shared/components/use_fullscreen';
import { usePictureInPicture } from '@/features/utilities/_shared/components/use_picture_in_picture';
import { useResumeFullscreen } from '@/features/utilities/_shared/components/use_resume_fullscreen';
import { useWatchZoom } from '@/features/utilities/_shared/components/use_watch_zoom';
import { useWatchHotkeys } from '@/features/utilities/_shared/components/use_watch_hotkeys';
import { useWatchPrefs } from '@/features/utilities/_shared/state/use_watch_prefs';
import { useEffectiveWatchMode } from '@/features/utilities/_shared/state/use_effective_watch_mode';
import { useStopwatch } from '@/features/utilities/_shared/time/use_stopwatch';
import { formatLap, formatStopwatch, formatWithPreset } from '@/features/utilities/_shared/time/format_time';
import { cn } from '@/lib/utils/cn';

export function StopwatchWorkspace() {
  // Fullscreen targets this wrapper (not the WatchShell card alone) so the action bar — a
  // sibling, not a descendant, of the card — stays part of the fullscreen element and visible.
  const containerRef = useRef<HTMLDivElement>(null);
  const prefs = useWatchPrefs();
  const stopwatch = useStopwatch();
  const fullscreen = useFullscreen(containerRef);
  useResumeFullscreen(containerRef);
  const pip = usePictureInPicture();
  const zoom = useWatchZoom();
  const mode = useEffectiveWatchMode(fullscreen.isFullscreen);

  useWatchHotkeys({
    onToggle: () => (stopwatch.running ? stopwatch.pause() : stopwatch.start()),
    onLap: stopwatch.running ? stopwatch.lap : undefined,
    onReset: stopwatch.reset,
  });

  const sweepDeg = ((stopwatch.elapsedMs % 60_000) / 60_000) * 360;
  const readout = formatWithPreset(stopwatch.elapsedMs, prefs.timeFormat, formatStopwatch);

  const face =
    prefs.face === 'analog' ? (
      <WatchFaceAnalog variant="stopwatch" sweepDeg={sweepDeg} centerValue={readout} />
    ) : (
      <WatchFaceDigital value={readout} />
    );

  const content = (
    <WatchShell
      mode={mode}
      zoom={zoom.value}
      plain={fullscreen.isFullscreen}
      className={fullscreen.isFullscreen ? 'w-full max-w-6xl px-4' : 'mx-auto max-w-4xl'}
    >
      {face}

      <div className="flex items-center justify-center gap-6">
        <ControlButton
          label="Reset"
          onClick={stopwatch.reset}
          disabled={stopwatch.elapsedMs === 0 && !stopwatch.running}
        >
          <RotateCcw aria-hidden className="size-4" />
        </ControlButton>

        <button
          type="button"
          onClick={stopwatch.running ? stopwatch.pause : stopwatch.start}
          aria-label={stopwatch.running ? 'Pause' : 'Start'}
          className="watch-button-primary flex size-16 shrink-0 items-center justify-center rounded-full"
        >
          {stopwatch.running ? <Pause aria-hidden className="size-6" /> : <Play aria-hidden className="ml-0.5 size-6" />}
        </button>

        <ControlButton label="Lap" onClick={stopwatch.lap} disabled={!stopwatch.running}>
          <Flag aria-hidden className="size-4" />
        </ControlButton>
      </div>

      <p className="text-[var(--w-muted)] -mt-4 text-xs">Space to start or pause, L to lap</p>

      <div className="w-full">
        {stopwatch.laps.length === 0 ? (
          <p className="text-[var(--w-muted)] py-4 text-center text-sm">No laps yet</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {stopwatch.laps.map((entry) => (
              <li
                key={entry.id}
                className="watch-button flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
              >
                <span className="font-medium">Lap {entry.id}</span>
                <span className="font-mono tabular-nums">{formatLap(entry.totalMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WatchShell>
  );

  const containerStyle: CSSProperties | undefined =
    fullscreen.isFullscreen && prefs.accent ? ({ '--w-accent': prefs.accent } as CSSProperties) : undefined;

  return (
    <div
      ref={containerRef}
      data-watch-theme={fullscreen.isFullscreen ? prefs.theme : undefined}
      data-watch-mode={fullscreen.isFullscreen ? mode : undefined}
      style={containerStyle}
      className={cn(
        fullscreen.isFullscreen &&
          'watch-widget watch-scroll flex flex-col items-center justify-center gap-6 overflow-y-auto',
      )}
    >
      {pip.isOpen ? (
        <div className="watch-widget mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl p-10 text-center">
          <PictureInPicture2 aria-hidden className="size-8 text-[var(--w-muted)]" />
          <p className="text-sm text-[var(--w-muted)]">Running in the floating window.</p>
        </div>
      ) : (
        content
      )}

      {pip.pipWindow && createPortal(content, pip.pipWindow.document.body)}

      <ActionBar
        fullscreen={fullscreen}
        pip={pip}
        mode={mode}
        zoom={zoom}
        otherTool={{ href: '/timer', label: 'Switch to Timer' }}
      />
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="watch-button flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-30"
    >
      {children}
    </button>
  );
}
