'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { formatTime } from '@/lib/audio/audio_formats';

export interface WaveformRangeTrimProps {
  /** Object URL of the source; playback runs through a plain hidden `<audio>` element. */
  src: string;
  peaks: Float32Array;
  duration: number;
  start: number;
  end: number;
  onRangeChange: (start: number, end: number) => void;
  disabled?: boolean;
}

const BASE_WIDTH = 900;
const HEIGHT = 120;
const MIN_RANGE_SECONDS = 0.2;

/**
 * A waveform with a draggable start/end selection window, shared groundwork for every audio tool
 * that extracts or trims a range (Video to Audio today, Audio Trimmer & Cutter next). Dragging
 * either handle resizes the window; playback during preview stays inside it, looping back to
 * `start` once it reaches `end`, so pressing play always previews exactly what will be exported.
 */
export function WaveformRangeTrim({
  src,
  peaks,
  duration,
  start,
  end,
  onRangeChange,
  disabled,
}: WaveformRangeTrimProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);

  const width = Math.round(BASE_WIDTH * zoom);

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

    const startX = duration > 0 ? (start / duration) * width : 0;
    const endX = duration > 0 ? (end / duration) * width : width;
    const styles = getComputedStyle(canvas);
    const selectedColor = styles.getPropertyValue('--color-brand').trim() || '#f5b942';
    const dimColor = styles.getPropertyValue('--color-border').trim() || '#e2ddd0';

    const mid = HEIGHT / 2;
    if (peaks.length > 0) {
      const barWidth = width / peaks.length;
      for (let i = 0; i < peaks.length; i += 1) {
        const x = i * barWidth;
        const barHeight = Math.max(2, (peaks[i] ?? 0) * (HEIGHT - 16));
        ctx.fillStyle = x >= startX && x <= endX ? selectedColor : dimColor;
        ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
      }
    } else {
      ctx.strokeStyle = dimColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();
    }
  }, [peaks, width, start, end, duration]);

  function timeAt(clientX: number): number {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function seekFromClientX(clientX: number) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const time = Math.min(end, Math.max(start, timeAt(clientX)));
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function dragHandle(which: 'start' | 'end') {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const time = timeAt(moveEvent.clientX);
        if (which === 'start') onRangeChange(Math.min(time, end - MIN_RANGE_SECONDS), end);
        else onRangeChange(start, Math.max(time, start + MIN_RANGE_SECONDS));
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

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (audio.currentTime < start || audio.currentTime >= end) audio.currentTime = start;
    audio.play().catch(() => {
      // The click that reaches here already counts as a user gesture; a rejection means
      // something else is wrong, not an autoplay block.
    });
  }

  const startPercent = duration > 0 ? (start / duration) * 100 : 0;
  const endPercent = duration > 0 ? (end / duration) * 100 : 100;

  return (
    <div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          if (time >= end) {
            event.currentTarget.currentTime = start;
            setCurrentTime(start);
          } else {
            setCurrentTime(time);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="relative">
        {duration > 0 && (
          <div
            className="bg-ink text-cream pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }}
          >
            {formatTime(currentTime)}
          </div>
        )}

        <div
          className="border-border bg-cream/50 rounded-xl border"
          style={{ height: HEIGHT, overflowX: 'auto', overflowY: 'hidden' }}
        >
          <div className="relative" style={{ width, height: HEIGHT }}>
            <canvas
              ref={canvasRef}
              onClick={(event) => seekFromClientX(event.clientX)}
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
              aria-label="Start time"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={start}
              aria-valuetext={formatTime(start)}
              tabIndex={disabled ? undefined : 0}
              onPointerDown={dragHandle('start')}
              className={`absolute bottom-0.5 z-10 size-3.5 -translate-x-1/2 touch-none rounded-full border-2 border-white shadow ${
                disabled ? 'bg-muted' : 'bg-brand cursor-ew-resize'
              }`}
              style={{ left: `${startPercent}%` }}
            />
            <div
              role="slider"
              aria-label="End time"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={end}
              aria-valuetext={formatTime(end)}
              tabIndex={disabled ? undefined : 0}
              onPointerDown={dragHandle('end')}
              className={`absolute bottom-0.5 z-10 size-3.5 -translate-x-1/2 touch-none rounded-full border-2 border-white shadow ${
                disabled ? 'bg-muted' : 'bg-brand cursor-ew-resize'
              }`}
              style={{ left: `${endPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={duration <= 0 || disabled}
            aria-label={playing ? 'Pause' : 'Play'}
            className="bg-brand text-on-brand hover:bg-brand-strong flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
          >
            {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4 translate-x-px" />}
          </button>
          <span className="text-muted text-sm tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ZoomOut aria-hidden className="text-muted size-4" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.5}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Zoom waveform"
            className="accent-brand w-28"
          />
          <ZoomIn aria-hidden className="text-muted size-4" />
        </div>
      </div>
    </div>
  );
}
