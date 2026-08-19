'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatTime } from '@/lib/audio/audio_formats';

export interface TrimSegment {
  start: number;
  end: number;
  removed: boolean;
}

export interface WaveformMultiTrimHandle {
  getCurrentTime: () => number;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
}

export interface WaveformMultiTrimProps {
  src: string;
  peaks: Float32Array;
  duration: number;
  /** Kept/removed segments, already clipped to [trimStart, trimEnd]. */
  segments: TrimSegment[];
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  onDeleteSegment: (start: number) => void;
  zoom: number;
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeDuration: number;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  disabled?: boolean;
}

const BASE_WIDTH = 900;
const HEIGHT = 140;
const ROW_HEIGHT = 32;
const MIN_TRIM_SECONDS = 0.2;
const SKIP_EPSILON = 0.03;

/** The next kept segment starting at or after `time`, or null past the last one — used to jump
 *  playback over a cut the instant it's reached, so Play always previews the edited result. */
function nextKeptStart(segments: TrimSegment[], time: number): number | null {
  const upcoming = segments
    .filter((s) => !s.removed && s.start > time - SKIP_EPSILON)
    .sort((a, b) => a.start - b.start);
  return upcoming[0]?.start ?? null;
}

function isInsideKept(segments: TrimSegment[], time: number): boolean {
  return segments.some((s) => !s.removed && time >= s.start - SKIP_EPSILON && time < s.end);
}

/** First kept segment's own start and last kept segment's own end — the two points a fade
 *  ramps against, since those are exactly the edited result's own start and end once exported. */
function keptBounds(segments: TrimSegment[]): { start: number; end: number } | null {
  const kept = segments.filter((s) => !s.removed);
  if (kept.length === 0) return null;
  return {
    start: Math.min(...kept.map((s) => s.start)),
    end: Math.max(...kept.map((s) => s.end)),
  };
}

function fadeGainAt(
  time: number,
  bounds: { start: number; end: number } | null,
  fadeIn: boolean,
  fadeOut: boolean,
  fadeDuration: number,
): number {
  if (!bounds || fadeDuration <= 0) return 1;
  const span = Math.max(0.01, bounds.end - bounds.start);
  const duration = Math.min(fadeDuration, span / 2);
  let gain = 1;
  if (fadeIn) gain = Math.min(gain, (time - bounds.start) / duration);
  if (fadeOut) gain = Math.min(gain, (bounds.end - time) / duration);
  return Math.max(0, Math.min(1, gain));
}

/**
 * A waveform for Audio Trimmer & Cutter. Two draggable handles on the waveform itself trim the
 * whole clip from either end, like `WaveformRangeTrim`; every cut boundary inside that range
 * shows a scissor marker. A single row directly under the waveform mirrors those same boundaries
 * at the same pixel widths (both live inside the one zoom scaled, horizontally scrollable
 * container), so a segment's block is always exactly as wide as its span on the waveform above
 * it — nothing is laid out independently and then hoped into alignment.
 */
export const WaveformMultiTrim = forwardRef<WaveformMultiTrimHandle, WaveformMultiTrimProps>(
  function WaveformMultiTrim(
    {
      src,
      peaks,
      duration,
      segments,
      trimStart,
      trimEnd,
      onTrimChange,
      onDeleteSegment,
      zoom,
      volume,
      fadeIn,
      fadeOut,
      fadeDuration,
      onTimeUpdate,
      onPlayStateChange,
      disabled,
    },
    ref,
  ) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const [currentTime, setCurrentTime] = useState(0);

    const width = Math.round(BASE_WIDTH * zoom);

    // The preview plays through a GainNode so a fade the user turns on is actually audible
    // before export, not just baked into the download — a `<MediaElementAudioSourceNode>` can
    // only ever be created once per `<audio>` element, so this graph is built lazily on first
    // play and reused for the rest of this file's session.
    function ensureAudioGraph(): GainNode | null {
      const audio = audioRef.current;
      if (!audio) return null;
      if (gainNodeRef.current) return gainNodeRef.current;
      const AudioContextClass =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain).connect(context.destination);
      audioCtxRef.current = context;
      gainNodeRef.current = gain;
      return gain;
    }

    useEffect(
      () => () => {
        audioCtxRef.current?.close().catch(() => {
          // Nothing more to clean up if the context refuses to close.
        });
      },
      [],
    );

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => audioRef.current?.currentTime ?? 0,
      seek: (time) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.min(duration, Math.max(0, time));
        setCurrentTime(audio.currentTime);
      },
      play: () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!isInsideKept(segments, audio.currentTime)) {
          const jumpTo = nextKeptStart(segments, audio.currentTime);
          if (jumpTo === null) return;
          audio.currentTime = jumpTo;
          setCurrentTime(jumpTo);
        }
        const gain = ensureAudioGraph();
        audioCtxRef.current?.resume().catch(() => {
          // Resuming can fail before a user gesture reaches the browser; play() below still
          // reports the real failure if audio truly can't start.
        });
        if (gain) {
          gain.gain.value = fadeGainAt(audio.currentTime, keptBounds(segments), fadeIn, fadeOut, fadeDuration);
        }
        audio.play().catch(() => {
          // A rejection here means playback failed for a reason other than the user gesture.
        });
      },
      pause: () => audioRef.current?.pause(),
    }));

    useEffect(() => {
      if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = HEIGHT * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, HEIGHT);

      const styles = getComputedStyle(canvas);
      const keptColor = styles.getPropertyValue('--color-brand').trim() || '#f5b942';
      const removedColor = styles.getPropertyValue('--color-border').trim() || '#e2ddd0';

      const mid = HEIGHT / 2;
      const xForTime = (time: number) => (duration > 0 ? (time / duration) * width : 0);

      if (peaks.length > 0) {
        const barWidth = width / peaks.length;
        for (let i = 0; i < peaks.length; i += 1) {
          const time = (i / peaks.length) * duration;
          const trimmedOut = time < trimStart || time >= trimEnd;
          const segment = segments.find((s) => time >= s.start && time < s.end);
          const cut = segment?.removed ?? false;
          const x = i * barWidth;
          // A cut section is excised, not just muted: leave it visibly blank rather than a dim
          // echo of the original, so "deleted" reads as gone. Trimmed off ends stay dimmed
          // instead (the separate dark overlay below draws over them), since a trim is still a
          // live, draggable boundary rather than a committed cut.
          if (cut) continue;
          const barHeight = Math.max(2, (peaks[i] ?? 0) * (HEIGHT - 24));
          ctx.fillStyle = trimmedOut ? removedColor : keptColor;
          ctx.globalAlpha = trimmedOut ? 0.35 : 1;
          ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = removedColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(width, mid);
        ctx.stroke();
      }

      for (let i = 1; i < segments.length; i += 1) {
        const x = xForTime(segments[i]?.start ?? 0);
        ctx.strokeStyle = '#e2483d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }

      // A fade ramps against the edited result's own start/end, i.e. the first and last kept
      // segment's own edges, not the original file's 0/duration — draw the wedge exactly there
      // so it's visible before the user ever presses play.
      const bounds = keptBounds(segments);
      if (bounds && (fadeIn || fadeOut)) {
        const span = Math.max(0.01, bounds.end - bounds.start);
        const fadeSeconds = Math.min(fadeDuration, span / 2);
        if (fadeIn && fadeSeconds > 0) {
          const startX = xForTime(bounds.start);
          const endX = xForTime(bounds.start + fadeSeconds);
          const gradient = ctx.createLinearGradient(startX, 0, endX, 0);
          gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(startX, 0, endX - startX, HEIGHT);
        }
        if (fadeOut && fadeSeconds > 0) {
          const startX = xForTime(bounds.end - fadeSeconds);
          const endX = xForTime(bounds.end);
          const gradient = ctx.createLinearGradient(startX, 0, endX, 0);
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(1, 'rgba(0,0,0,0.45)');
          ctx.fillStyle = gradient;
          ctx.fillRect(startX, 0, endX - startX, HEIGHT);
        }
      }
    }, [peaks, width, segments, duration, trimStart, trimEnd, fadeIn, fadeOut, fadeDuration]);

    function timeAt(clientX: number): number {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    }

    function seekFromClientX(clientX: number) {
      const audio = audioRef.current;
      if (!audio) return;
      const time = timeAt(clientX);
      audio.currentTime = time;
      setCurrentTime(time);
    }

    function dragTrimHandle(which: 'start' | 'end') {
      return (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);

        const onMove = (moveEvent: PointerEvent) => {
          const time = timeAt(moveEvent.clientX);
          if (which === 'start') onTrimChange(Math.min(time, trimEnd - MIN_TRIM_SECONDS), trimEnd);
          else onTrimChange(trimStart, Math.max(time, trimStart + MIN_TRIM_SECONDS));
        };
        const onUp = (upEvent: PointerEvent) => {
          element.releasePointerCapture(upEvent.pointerId);
          element.removeEventListener('pointermove', onMove);
          element.removeEventListener('pointerup', onUp);
        };
        element.addEventListener('pointermove', onMove);
        element.addEventListener('pointerup', onUp);
      };
    }

    const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
    const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;

    return (
      <div>
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          className="hidden"
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            const time = audio.currentTime;
            if (!audio.paused && !isInsideKept(segments, time)) {
              const jumpTo = nextKeptStart(segments, time);
              if (jumpTo === null) {
                audio.pause();
              } else {
                audio.currentTime = jumpTo;
                setCurrentTime(jumpTo);
                onTimeUpdate(jumpTo);
                if (gainNodeRef.current) {
                  gainNodeRef.current.gain.value = fadeGainAt(
                    jumpTo,
                    keptBounds(segments),
                    fadeIn,
                    fadeOut,
                    fadeDuration,
                  );
                }
                return;
              }
            }
            if (gainNodeRef.current) {
              gainNodeRef.current.gain.value = fadeGainAt(time, keptBounds(segments), fadeIn, fadeOut, fadeDuration);
            }
            setCurrentTime(time);
            onTimeUpdate(time);
          }}
          onPlay={() => onPlayStateChange(true)}
          onPause={() => onPlayStateChange(false)}
          onEnded={() => onPlayStateChange(false)}
        />

        <div className="relative">
          {duration > 0 && (
            <div
              className="bg-ink text-cream pointer-events-none absolute -top-7 z-20 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }}
            >
              {formatTime(currentTime)}
            </div>
          )}

          <div
            className="border-border bg-cream/50 mt-7 rounded-xl border"
            style={{ overflowX: 'auto', overflowY: 'hidden' }}
          >
            <div ref={trackRef} className="relative" style={{ width }}>
              {segments.slice(1).map((segment, index) => {
                const x = duration > 0 ? (segment.start / duration) * width : 0;
                return (
                  <div
                    key={`${segment.start}-${index}`}
                    className="text-danger pointer-events-none absolute -top-9 z-10 -translate-x-1/2 text-center text-xs font-semibold"
                    style={{ left: x }}
                  >
                    <span className="bg-danger/10 rounded-full px-2 py-0.5">Cut {index + 1}</span>
                  </div>
                );
              })}

              <div className="relative" style={{ width, height: HEIGHT }}>
                <canvas
                  ref={canvasRef}
                  onClick={(event) => {
                    if (disabled) return;
                    seekFromClientX(event.clientX);
                  }}
                  className="block cursor-pointer"
                />

                {duration > 0 && (
                  <div
                    aria-hidden
                    className="bg-ink/70 pointer-events-none absolute inset-y-0 -translate-x-full"
                    style={{ left: `${startPercent}%` }}
                  />
                )}
                {duration > 0 && (
                  <div
                    aria-hidden
                    className="bg-ink/70 pointer-events-none absolute inset-y-0"
                    style={{ left: `${endPercent}%`, right: 0 }}
                  />
                )}

                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-black"
                  style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />

                <div
                  role="slider"
                  aria-label="Trim start"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={trimStart}
                  aria-valuetext={formatTime(trimStart)}
                  tabIndex={disabled ? undefined : 0}
                  onPointerDown={dragTrimHandle('start')}
                  className={`absolute bottom-0.5 z-20 size-3.5 -translate-x-1/2 touch-none rounded-full border-2 border-white shadow ${
                    disabled ? 'bg-muted' : 'bg-brand cursor-ew-resize'
                  }`}
                  style={{ left: `${startPercent}%` }}
                />
                <div
                  role="slider"
                  aria-label="Trim end"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={trimEnd}
                  aria-valuetext={formatTime(trimEnd)}
                  tabIndex={disabled ? undefined : 0}
                  onPointerDown={dragTrimHandle('end')}
                  className={`absolute bottom-0.5 z-20 size-3.5 -translate-x-1/2 touch-none rounded-full border-2 border-white shadow ${
                    disabled ? 'bg-muted' : 'bg-brand cursor-ew-resize'
                  }`}
                  style={{ left: `${endPercent}%` }}
                />
              </div>

              <div className="relative mt-1" style={{ width, height: ROW_HEIGHT }}>
                {segments.map((segment, index) => {
                  const left = duration > 0 ? (segment.start / duration) * width : 0;
                  const blockWidth = duration > 0 ? ((segment.end - segment.start) / duration) * width : 0;
                  return (
                    <div
                      key={`${segment.start}-${segment.end}`}
                      className={`absolute top-0 flex items-center justify-center overflow-hidden rounded-md text-xs font-semibold ${
                        segment.removed
                          ? 'bg-cream text-muted opacity-50 line-through'
                          : 'bg-brand/80 text-on-brand'
                      }`}
                      style={{ left, width: Math.max(2, blockWidth - 1), height: ROW_HEIGHT }}
                      title={`${formatTime(segment.start)} – ${formatTime(segment.end)}`}
                    >
                      {blockWidth > 40 && <span className="truncate px-1">{formatTime(segment.end - segment.start)}</span>}
                      {!segment.removed && blockWidth > 20 && !disabled && (
                        <button
                          type="button"
                          onClick={() => onDeleteSegment(segment.start)}
                          aria-label={`Delete section ${index + 1}`}
                          className="text-on-brand/80 hover:text-on-brand absolute right-0.5"
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
