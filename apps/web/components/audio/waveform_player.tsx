'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { formatTime } from '@/lib/audio/audio_formats';

export interface WaveformPlayerProps {
  /** Object URL of the source audio; playback runs through a plain hidden `<audio>` element,
   *  unless `gain` is passed, in which case it's routed through a Web Audio GainNode instead. */
  src: string;
  /** Peak amplitude per bucket across the whole track, from `readAudioMeta`. Empty when this
   *  file could not be decoded into PCM; the waveform then falls back to a flat line. */
  peaks: Float32Array;
  duration: number;
  /**
   * Linear amplitude multiplier applied live during playback (not just clamped 0..1, so a tool
   * like Volume Booster can preview a boost past unity too). Omit to play the file unmodified.
   * Changing it updates the currently playing sound immediately, so a slider drag is heard as it
   * moves rather than only after export.
   */
  gain?: number;
}

const BASE_WIDTH = 900;
const HEIGHT = 120;

/** A clickable waveform with its own play/pause, elapsed/duration readout and zoom control. */
export function WaveformPlayer({ src, peaks, duration, gain }: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceCreatedRef = useRef(false);

  // A `<MediaElementAudioSourceNode>` can only be created once per `<audio>` element and an
  // AudioContext needs a user gesture to start, so this graph is built lazily on first play
  // rather than up front.
  function ensureGainGraph(): GainNode | null {
    const audio = audioRef.current;
    if (!audio) return null;
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
    const context = audioCtxRef.current;
    if (!sourceCreatedRef.current) {
      const source = context.createMediaElementSource(audio);
      const gainNode = context.createGain();
      source.connect(gainNode).connect(context.destination);
      gainNodeRef.current = gainNode;
      sourceCreatedRef.current = true;
    }
    if (context.state === 'suspended') context.resume().catch(() => {
      // Playback still proceeds unrouted through Web Audio if resume is rejected; the browser's
      // own volume just won't reflect `gain` until a later gesture unlocks it.
    });
    return gainNodeRef.current;
  }

  useEffect(() => {
    if (gain === undefined) return;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, gain);
    }
  }, [gain]);

  useEffect(
    () => () => {
      audioCtxRef.current?.close().catch(() => {
        // Nothing more to clean up if the context refuses to close.
      });
    },
    [],
  );

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

    const playedRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const playedX = playedRatio * width;
    const styles = getComputedStyle(canvas);
    const playedColor = styles.getPropertyValue('--color-brand').trim() || '#f5b942';
    const unplayedColor = styles.getPropertyValue('--color-border').trim() || '#e2ddd0';

    const mid = HEIGHT / 2;
    if (peaks.length > 0) {
      const barWidth = width / peaks.length;
      for (let i = 0; i < peaks.length; i += 1) {
        const x = i * barWidth;
        const barHeight = Math.max(2, (peaks[i] ?? 0) * (HEIGHT - 16));
        ctx.fillStyle = x <= playedX ? playedColor : unplayedColor;
        ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
      }
    } else {
      ctx.strokeStyle = unplayedColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();
    }

    if (duration > 0) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playedX, 0);
      ctx.lineTo(playedX, HEIGHT);
      ctx.stroke();
    }
  }, [peaks, width, currentTime, duration]);

  function seekFromClientX(clientX: number) {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = ratio * duration;
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (gain !== undefined) {
      const gainNode = ensureGainGraph();
      if (gainNode) gainNode.gain.value = Math.max(0, gain);
    }
    audio.play().catch(() => {
      // Autoplay can be blocked before any user gesture; the click that got us here counts as
      // one, so this only ever fires if the browser rejects playback for some other reason.
    });
  }

  return (
    <div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="relative">
        {duration > 0 && (
          <div
            className="bg-ink text-cream pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ left: `${Math.min(1, currentTime / duration) * 100}%` }}
          >
            {formatTime(currentTime)}
          </div>
        )}
        <div className="border-border bg-cream/50 overflow-x-auto rounded-xl border">
          <canvas
            ref={canvasRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onClick={(event) => seekFromClientX(event.clientX)}
            onKeyDown={(event) => {
              const audio = audioRef.current;
              if (!audio) return;
              if (event.key === 'ArrowRight') audio.currentTime = Math.min(duration, currentTime + 1);
              if (event.key === 'ArrowLeft') audio.currentTime = Math.max(0, currentTime - 1);
            }}
            className="block cursor-pointer"
          />
        </div>
        {peaks.length === 0 && duration > 0 && (
          <p className="text-muted mt-1.5 text-xs">
            A waveform preview isn&apos;t available for this file, but playback and conversion still work.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={duration <= 0}
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
