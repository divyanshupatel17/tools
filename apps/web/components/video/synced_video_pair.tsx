'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Maximize2, Music, Pause, Play, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { applyCropDrag, containRect, type CropBox, type CropDragMode } from '@/lib/video/crop_drag';
import { formatDuration } from '@/lib/video/video_formats';

export type { CropBox, CropDragMode } from '@/lib/video/crop_drag';

export interface VideoPaneHandle {
  /** Plays and swallows the benign AbortError a browser throws when a pause interrupts it. */
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
}

export interface VideoDetail {
  label: string;
  value: string;
}

export interface VideoPaneConfig {
  src: string | null;
  /** Shown in place of the player when there is no `src` yet. */
  placeholder: ReactNode;
  caption?: string;
  /** Frame rate, codec, bitrate and the like, shown as a small stat grid under the caption. */
  details?: readonly VideoDetail[];
  /**
   * Draws a dashed rectangle over the video showing what a crop or resize will keep. Given in
   * the source's own natural pixel coordinates; the pane converts that to on screen pixels
   * itself, accounting for the letterboxing `object-contain` adds inside the fixed 16:9 box.
   */
  cropBox?: CropBox | null;
  /**
   * Turns the crop box interactive: a draggable body plus eight handles let a visitor adjust
   * every side by hand. Called with the new box, still in natural pixel coordinates, on every
   * pointer move. Omit to render `cropBox` as a plain, non interactive preview.
   */
  onCropBoxChange?: (box: CropBox) => void;
}

const CROP_HANDLES: { mode: CropDragMode; className: string; cursor: string }[] = [
  { mode: 'nw', className: 'left-0 top-0', cursor: 'nwse-resize' },
  { mode: 'n', className: 'left-1/2 top-0', cursor: 'ns-resize' },
  { mode: 'ne', className: 'left-full top-0', cursor: 'nesw-resize' },
  { mode: 'e', className: 'left-full top-1/2', cursor: 'ew-resize' },
  { mode: 'se', className: 'left-full top-full', cursor: 'nwse-resize' },
  { mode: 's', className: 'left-1/2 top-full', cursor: 'ns-resize' },
  { mode: 'sw', className: 'left-0 top-full', cursor: 'nesw-resize' },
  { mode: 'w', className: 'left-0 top-1/2', cursor: 'ew-resize' },
];

interface VideoPaneProps extends VideoPaneConfig {
  label: string;
  onToggle: () => void;
  onScrub: (time: number) => void;
}

/** Reads a CSS custom property's resolved value, e.g. the brand colour, for canvas drawing. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * A live time domain waveform of the pane's own audio, drawn while it plays. Routes the video's
 * audio through a Web Audio analyser; the analyser is wired back to the audio destination so the
 * routing does not silence the element, since `createMediaElementSource` otherwise replaces it.
 */
export function Waveform({ videoEl, playing }: { videoEl: HTMLVideoElement | null; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wiredElement = useRef<HTMLVideoElement | null>(null);

  useEffect(
    () => () => {
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  // Idle state: a flat centre line, at the exact height the playing waveform draws at, so
  // starting or stopping playback never changes this element's height and never shifts the
  // transport controls underneath it.
  useEffect(() => {
    if (playing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }, [playing]);

  useEffect(() => {
    if (!playing || !videoEl || !canvasRef.current) return;

    // A media element can only ever be wired into one MediaElementAudioSourceNode; set that up
    // once per element, the first time it actually plays, not on every render.
    if (wiredElement.current !== videoEl) {
      try {
        const AudioContextCtor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioContextCtor();
        const source = ctx.createMediaElementSource(videoEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        wiredElement.current = videoEl;
      } catch {
        // Web Audio can refuse (e.g. a cross origin source); the tool still works, just silent.
        return;
      }
    }
    audioCtxRef.current?.resume().catch(() => {});

    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const stroke = cssVar('--brand-golden', '#f5a900');
    let frame = 0;

    const draw = () => {
      analyser.getByteTimeDomainData(data);
      const { width, height } = canvas;
      ctx2d.clearRect(0, 0, width, height);
      ctx2d.beginPath();
      const step = width / data.length;
      for (let i = 0; i < data.length; i += 1) {
        const y = ((data[i] ?? 128) / 255) * height;
        const x = i * step;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.strokeStyle = stroke;
      ctx2d.lineWidth = 2 * ratio;
      ctx2d.lineJoin = 'round';
      ctx2d.stroke();
      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(frame);
  }, [playing, videoEl]);

  return <canvas ref={canvasRef} aria-hidden className="bg-background/60 block h-10 w-full shrink-0" />;
}

const VideoPane = forwardRef<VideoPaneHandle, VideoPaneProps>(function VideoPane(
  { label, src, placeholder, caption, details, cropBox, onCropBoxChange, onToggle, onScrub },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // Several containers this site can write (TS, MKV, AVI, WMV, MPEG, FLV, 3GP) are valid files
  // that other players open fine, but no major browser's <video> tag can demux them. Rather than
  // a silently frozen player with dead transport controls, an error here swaps in an honest
  // notice; the file is still correct and still downloadable.
  const [errored, setErrored] = useState(false);
  // A pure audio source (an MP3/WAV/etc played through this same <video> element, which is a
  // fine way to get transport controls and playback for free) reports zero natural dimensions;
  // without this the pane just looks broken, showing a plain grey box while sound plays.
  const [audioOnly, setAudioOnly] = useState(false);

  useImperativeHandle(ref, () => ({
    play: () => void videoRef.current?.play().catch(() => {}),
    pause: () => videoRef.current?.pause(),
    seek: (time: number) => {
      if (videoRef.current) videoRef.current.currentTime = time;
    },
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    isPaused: () => videoRef.current?.paused ?? true,
  }));

  useEffect(() => {
    setPlaying(false);
    setMuted(false);
    setCurrent(0);
    setDuration(0);
    setNaturalSize(null);
    setErrored(false);
    setAudioOnly(false);
  }, [src]);

  useEffect(() => {
    if (!cropBox || !containerRef.current) return;
    const element = containerRef.current;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cropBox]);

  const rect = naturalSize ? containRect(containerSize, naturalSize) : null;
  const overlay =
    cropBox && rect && naturalSize
      ? {
          left: rect.left + (cropBox.x / naturalSize.width) * rect.width,
          top: rect.top + (cropBox.y / naturalSize.height) * rect.height,
          width: (cropBox.width / naturalSize.width) * rect.width,
          height: (cropBox.height / naturalSize.height) * rect.height,
        }
      : null;

  function startCropDrag(mode: CropDragMode) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (!cropBox || !onCropBoxChange || !naturalSize || !rect || rect.width === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      const scale = naturalSize.width / rect.width;
      const startX = event.clientX;
      const startY = event.clientY;
      const startBox = cropBox;

      const onMove = (moveEvent: PointerEvent) => {
        const dx = (moveEvent.clientX - startX) * scale;
        const dy = (moveEvent.clientY - startY) * scale;
        onCropBoxChange(applyCropDrag(mode, startBox, dx, dy, naturalSize));
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

  return (
    <div className="border-border bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="text-muted text-xs font-semibold tracking-wide uppercase">{label}</span>
        {src && !errored && (
          <button
            type="button"
            onClick={() => videoRef.current?.requestFullscreen?.()}
            aria-label={`View ${label} full screen`}
            title="Full screen"
            className="text-muted hover:text-foreground"
          >
            <Maximize2 aria-hidden className="size-3.5" />
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="bg-ink/5 relative mt-2 flex aspect-video items-center justify-center overflow-hidden"
      >
        {src && errored ? (
          <div className="text-muted flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-xs">
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
            <p>
              This format can&rsquo;t be played back in this browser. The file itself is fine;
              download it to open it in a compatible player.
            </p>
          </div>
        ) : src ? (
          // Every pane keeps the same fixed 16:9 box regardless of the source's own aspect
          // ratio; `object-contain` fits the video to whichever side runs out first (letterboxed
          // top/bottom or left/right) so before and after always line up as a matched pair.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={src}
            muted={muted}
            className="size-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              setDuration(video.duration || 0);
              if (video.videoWidth && video.videoHeight) {
                setNaturalSize({ width: video.videoWidth, height: video.videoHeight });
                setAudioOnly(false);
              } else {
                setAudioOnly(true);
              }
            }}
            onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
            onError={() => setErrored(true)}
          />
        ) : (
          placeholder
        )}
        {src && !errored && audioOnly && (
          <div aria-hidden className="text-muted pointer-events-none absolute inset-0 flex items-center justify-center">
            <Music className="size-12 opacity-40" />
          </div>
        )}
        {overlay && (
          <div
            aria-hidden
            onPointerDown={onCropBoxChange ? startCropDrag('move') : undefined}
            className={`border-brand absolute border-2 border-dashed shadow-[0_0_0_1000px_rgba(0,0,0,0.45)] ${
              onCropBoxChange ? 'pointer-events-auto touch-none' : 'pointer-events-none'
            }`}
            style={{
              left: overlay.left,
              top: overlay.top,
              width: overlay.width,
              height: overlay.height,
              cursor: onCropBoxChange ? 'move' : undefined,
            }}
          >
            {onCropBoxChange &&
              CROP_HANDLES.map((handle) => (
                <div
                  key={handle.mode}
                  onPointerDown={startCropDrag(handle.mode)}
                  className={`bg-brand absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white shadow-sm ${handle.className}`}
                  style={{ cursor: handle.cursor }}
                />
              ))}
          </div>
        )}
      </div>

      {src && !errored && <Waveform videoEl={videoRef.current} playing={playing} />}

      {src && !errored && (
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? `Pause ${label}` : `Play ${label}`}
            className="bg-brand text-on-brand hover:bg-brand-strong flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors"
          >
            {playing ? (
              <Pause aria-hidden className="size-5" fill="currentColor" />
            ) : (
              <Play aria-hidden className="ml-0.5 size-5" fill="currentColor" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(current, duration || 0)}
            aria-label={`${label} position`}
            onChange={(event) => {
              const time = Number(event.target.value);
              setCurrent(time);
              if (videoRef.current) videoRef.current.currentTime = time;
              onScrub(time);
            }}
            className="accent-brand h-1.5 w-full"
          />
          <span className="text-muted w-20 shrink-0 text-right text-xs tabular-nums">
            {formatDuration(current)} / {formatDuration(duration)}
          </span>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
            aria-pressed={muted}
            title={muted ? 'Unmute' : 'Mute'}
            className="text-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
          >
            {muted ? (
              <VolumeX aria-hidden className="size-4" />
            ) : (
              <Volume2 aria-hidden className="size-4" />
            )}
          </button>
        </div>
      )}

      {caption && (
        <p className="text-muted border-border/60 border-t px-3 pt-2 text-xs">{caption}</p>
      )}

      {details && details.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pt-2 pb-3 text-xs sm:grid-cols-3">
          {details.map((detail) => (
            <div key={detail.label} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">{detail.label}</dt>
              <dd className="font-semibold tabular-nums">{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
});

export interface SyncedVideoPairProps {
  before: VideoPaneConfig;
  after: VideoPaneConfig;
}

/**
 * Two players side by side (stacked on small screens). "Sync playback" mirrors play, pause and
 * seeking between them: starting either one first lines the other up to the same position, not
 * just its own, and pausing either pauses both. Switching sync off lets each player run
 * independently, e.g. to compare two different moments.
 */
export function SyncedVideoPair({ before, after }: SyncedVideoPairProps) {
  const [sync, setSync] = useState(true);
  const beforeRef = useRef<VideoPaneHandle>(null);
  const afterRef = useRef<VideoPaneHandle>(null);

  function pairOf(which: 'before' | 'after') {
    return which === 'before'
      ? { self: beforeRef, other: afterRef }
      : { self: afterRef, other: beforeRef };
  }

  function togglePlay(which: 'before' | 'after') {
    const { self, other } = pairOf(which);
    if (!self.current) return;
    if (self.current.isPaused()) {
      if (sync) {
        other.current?.seek(self.current.getCurrentTime());
        other.current?.play();
      }
      self.current.play();
    } else {
      self.current.pause();
      if (sync) other.current?.pause();
    }
  }

  function scrub(which: 'before' | 'after', time: number) {
    if (sync) {
      beforeRef.current?.seek(time);
      afterRef.current?.seek(time);
    } else {
      pairOf(which).self.current?.seek(time);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted text-sm font-semibold">Before and after</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sync}
            onChange={(event) => setSync(event.target.checked)}
            className="accent-brand size-4"
          />
          <span className="font-semibold">Sync playback</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <VideoPane
          ref={beforeRef}
          label="Before"
          {...before}
          onToggle={() => togglePlay('before')}
          onScrub={(time) => scrub('before', time)}
        />
        <VideoPane
          ref={afterRef}
          label="After"
          {...after}
          onToggle={() => togglePlay('after')}
          onScrub={(time) => scrub('after', time)}
        />
      </div>
    </div>
  );
}
