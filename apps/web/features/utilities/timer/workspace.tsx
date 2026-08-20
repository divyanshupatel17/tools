'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pause, PictureInPicture2, Play, RotateCcw } from 'lucide-react';
import { WatchShell } from '@/features/utilities/_shared/components/watch_shell';
import { WatchFaceDigital } from '@/features/utilities/_shared/components/watch_face_digital';
import { WatchFaceAnalog } from '@/features/utilities/_shared/components/watch_face_analog';
import { ActionBar } from '@/features/utilities/_shared/components/action_bar';
import { useFullscreen } from '@/features/utilities/_shared/components/use_fullscreen';
import { usePictureInPicture } from '@/features/utilities/_shared/components/use_picture_in_picture';
import { useResumeFullscreen } from '@/features/utilities/_shared/components/use_resume_fullscreen';
import { useAlertSound } from '@/features/utilities/_shared/components/use_alert_sound';
import { useWatchNotification } from '@/features/utilities/_shared/components/use_watch_notification';
import { useWatchZoom } from '@/features/utilities/_shared/components/use_watch_zoom';
import { useWatchHotkeys } from '@/features/utilities/_shared/components/use_watch_hotkeys';
import { useWatchPrefs } from '@/features/utilities/_shared/state/use_watch_prefs';
import { useEffectiveWatchMode } from '@/features/utilities/_shared/state/use_effective_watch_mode';
import { useTimer } from '@/features/utilities/_shared/time/use_timer';
import {
  formatTimer,
  formatWithPreset,
  hoursMinutesSecondsToMs,
  msToHoursMinutesSeconds,
} from '@/features/utilities/_shared/time/format_time';
import { NumberField } from '@/components/ui/number_field';
import { cn } from '@/lib/utils/cn';

const PRESET_MINUTES = [1, 5, 15, 30];

export function TimerWorkspace() {
  // Fullscreen targets this wrapper (not the WatchShell card alone) so the action bar — a
  // sibling, not a descendant, of the card — stays part of the fullscreen element and visible.
  const containerRef = useRef<HTMLDivElement>(null);
  const prefs = useWatchPrefs();
  const sound = useAlertSound(prefs.soundOn);
  const notification = useWatchNotification();
  const [label, setLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);

  const timer = useTimer({
    onApproaching: () => sound.playTick(),
    onComplete: () => {
      sound.playChime();
      notification.notify(label ? `${label} — Time's up` : 'Timer finished', 'Your countdown has reached zero.');
    },
  });
  const fullscreen = useFullscreen(containerRef);
  useResumeFullscreen(containerRef);
  const pip = usePictureInPicture();
  const zoom = useWatchZoom();
  const mode = useEffectiveWatchMode(fullscreen.isFullscreen);

  useWatchHotkeys({
    onToggle: () => (timer.running ? timer.pause() : handleStart()),
    onReset: timer.reset,
  });

  const { hours, minutes, seconds } = msToHoursMinutesSeconds(timer.durationMs);
  const editable = !timer.running && timer.remainingMs === timer.durationMs;

  function addMinutes(delta: number) {
    if (timer.running) return;
    timer.setDuration(timer.durationMs + delta * 60_000);
  }

  function handleStart() {
    notification.requestPermission();
    timer.start();
  }

  const readout = formatWithPreset(timer.remainingMs, prefs.timeFormat, formatTimer);

  const face =
    prefs.face === 'analog' ? (
      <WatchFaceAnalog
        variant="timer"
        remainingFraction={timer.durationMs > 0 ? timer.remainingMs / timer.durationMs : 0}
        centerValue={readout}
        centerLabel={label || undefined}
      />
    ) : (
      <WatchFaceDigital label="Set time" value={readout} caption={label || undefined} />
    );

  const content = (
    <WatchShell
      mode={mode}
      zoom={zoom.value}
      plain={fullscreen.isFullscreen}
      className={fullscreen.isFullscreen ? 'w-full max-w-6xl px-4' : 'mx-auto max-w-4xl'}
    >
      {face}

      {editable && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <NumberField
            id="timer-hours"
            value={hours}
            onChange={(value) => timer.setDuration(hoursMinutesSecondsToMs(value, minutes, seconds))}
            min={0}
            max={99}
            aria-label="Hours"
            className="watch-button h-9 w-14 rounded-full text-center outline-none"
          />
          <span className="text-[var(--w-muted)]">hr</span>
          <NumberField
            id="timer-minutes"
            value={minutes}
            onChange={(value) => timer.setDuration(hoursMinutesSecondsToMs(hours, value, seconds))}
            min={0}
            max={59}
            aria-label="Minutes"
            className="watch-button h-9 w-14 rounded-full text-center outline-none"
          />
          <span className="text-[var(--w-muted)]">min</span>
          <NumberField
            id="timer-seconds"
            value={seconds}
            onChange={(value) => timer.setDuration(hoursMinutesSecondsToMs(hours, minutes, value))}
            min={0}
            max={59}
            aria-label="Seconds"
            className="watch-button h-9 w-14 rounded-full text-center outline-none"
          />
          <span className="text-[var(--w-muted)]">sec</span>
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PRESET_MINUTES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => addMinutes(value)}
              className="watch-button rounded-full px-3 py-1.5 text-xs"
            >
              +{value}m
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-6">
        <ControlButton
          label="Reset"
          onClick={timer.reset}
          disabled={timer.remainingMs === timer.durationMs && !timer.running}
        >
          <RotateCcw aria-hidden className="size-4" />
        </ControlButton>

        <button
          type="button"
          onClick={timer.running ? timer.pause : handleStart}
          disabled={timer.durationMs === 0}
          aria-label={timer.running ? 'Pause' : 'Start'}
          className="watch-button-primary flex size-16 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          {timer.running ? <Pause aria-hidden className="size-6" /> : <Play aria-hidden className="ml-0.5 size-6" />}
        </button>
      </div>

      <p className="text-[var(--w-muted)] -mt-4 text-xs">Space to start or pause, R to reset</p>

      <button
        type="button"
        onClick={() => setShowLabelInput((value) => !value)}
        className="text-[var(--w-muted)] text-xs underline"
      >
        {showLabelInput ? 'Hide label' : '+ Add label'}
      </button>

      {showLabelInput && (
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label this timer"
          className="watch-button w-full rounded-full px-4 py-2 text-center text-sm outline-none"
        />
      )}
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
        otherTool={{ href: '/stopwatch', label: 'Switch to Stopwatch' }}
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
