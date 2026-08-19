'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileOutput,
  FileText,
  Gauge,
  Loader2,
  Music,
  Music4,
  Pause,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import { codecForExtension, PITCH_PRESETS, SPEED_PRESETS } from './formats';
import {
  resolvePitchFactor,
  resolveSpeedFactor,
  type AudioSpeedPitchOptions,
} from './processor';

const RULE = audioRule();
const MIN_SPEED_PERCENT = 10;
const MAX_SPEED_PERCENT = 1000;
const MIN_PITCH_SEMITONES = -12;
const MAX_PITCH_SEMITONES = 12;
const REFERENCE_HZ = 440; // A4
// HTMLMediaElement.playbackRate has a practical browser ceiling well under this; clamping here
// avoids a silently ignored or throwing assignment at the extreme end of the sliders.
const MIN_PLAYBACK_RATE = 0.0625;
const MAX_PLAYBACK_RATE = 16;

const WAVEFORM_WIDTH = 900;
const WAVEFORM_HEIGHT = 120;

interface Result {
  artifact: ProcessorArtifact;
}

/** `1x`, `0.25x`, `1.5x`, `10x`: the multiplier a person actually thinks in, not a percentage. */
function formatSpeedMultiplier(percent: number): string {
  const value = percent / 100;
  const text = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text || '0'}x`;
}

/** Firefox still ships pitch preservation under prefixed names. */
type PitchAwareAudioElement = HTMLAudioElement & {
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

interface LiveWaveformProps {
  src: string;
  peaks: Float32Array;
  duration: number;
  speedFactor: number;
  pitchFactor: number;
  preservePitch: boolean;
  pitchSemitones: number;
}

/**
 * The waveform doubles as the live preview. It plays the original file through a plain
 * `<audio>` element with `playbackRate` and `preservesPitch`, both native, browser implemented
 * and guaranteed to stay in lock step with `currentTime` — unlike a hand rolled Web Audio graph,
 * there is no separate position tracker that can drift out of sync with what's actually audible.
 *
 * `playbackRate` and `detune` on a raw buffer source multiply into the *same* underlying sample
 * rate, so they can't represent speed and pitch as independent axes; `preservesPitch` is the one
 * real decoupling primitive the platform offers, and it is binary (pitch either tracks the rate
 * or stays locked to the original). A nonzero pitch target can't be locked to "original" at the
 * same time, so it always takes priority over the Pitch Preservation toggle here; the exact,
 * genuinely independent result — matching what Pitch Preservation promises even with a pitch
 * shift dialed in — is what the ffmpeg export produces.
 */
function LiveWaveform({
  src,
  peaks,
  duration,
  speedFactor,
  pitchFactor,
  preservePitch,
  pitchSemitones,
}: LiveWaveformProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const rawRate = pitchSemitones === 0 ? speedFactor : speedFactor * pitchFactor;
  const rate = Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rawRate));
  const preserves = preservePitch && pitchSemitones === 0;

  function applyPlaybackSettings() {
    const audio = audioRef.current as PitchAwareAudioElement | null;
    if (!audio) return;
    audio.playbackRate = rate;
    audio.preservesPitch = preserves;
    audio.mozPreservesPitch = preserves;
    audio.webkitPreservesPitch = preserves;
  }

  // `playbackRate`/`preservesPitch` are real time settings on the element itself: changing them
  // here takes effect on whatever is currently playing, instantly, with no restart.
  useEffect(applyPlaybackSettings, [rate, preserves]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WAVEFORM_WIDTH * dpr;
    canvas.height = WAVEFORM_HEIGHT * dpr;
    canvas.style.width = `${WAVEFORM_WIDTH}px`;
    canvas.style.height = `${WAVEFORM_HEIGHT}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, [peaks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, WAVEFORM_WIDTH, WAVEFORM_HEIGHT);

    const playedRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const playedX = playedRatio * WAVEFORM_WIDTH;
    const styles = getComputedStyle(canvas);
    const playedColor = styles.getPropertyValue('--color-brand').trim() || '#f5b942';
    const unplayedColor = styles.getPropertyValue('--color-border').trim() || '#e2ddd0';

    const mid = WAVEFORM_HEIGHT / 2;
    if (peaks.length > 0) {
      const barWidth = WAVEFORM_WIDTH / peaks.length;
      for (let i = 0; i < peaks.length; i += 1) {
        const x = i * barWidth;
        const barHeight = Math.max(2, (peaks[i] ?? 0) * (WAVEFORM_HEIGHT - 16));
        ctx.fillStyle = x <= playedX ? playedColor : unplayedColor;
        ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
      }
    } else {
      ctx.strokeStyle = unplayedColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(WAVEFORM_WIDTH, mid);
      ctx.stroke();
    }

    if (duration > 0) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playedX, 0);
      ctx.lineTo(playedX, WAVEFORM_HEIGHT);
      ctx.stroke();
    }
  }, [peaks, duration, currentTime]);

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
    applyPlaybackSettings();
    audio.play().catch(() => {
      // Autoplay can be blocked before any user gesture; the click that got us here counts as
      // one, so this only fires if the browser rejects playback for some other reason.
    });
  }

  return (
    <div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={applyPlaybackSettings}
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
            A waveform preview isn&apos;t available for this file, but playback and export still work.
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
        <span className="text-muted text-xs">Playing back live at the current speed and pitch.</span>
      </div>
    </div>
  );
}

export function AudioSpeedPitchWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [reading, setReading] = useState(false);

  const [speedPercent, setSpeedPercent] = useState(100);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [preservePitch, setPreservePitch] = useState(true);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  function clearResult() {
    setResult(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();

    setFile(next);
    setNotice(null);
    setMeta(null);
    setSpeedPercent(100);
    setPitchSemitones(0);
    setPreservePitch(true);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    setReading(true);
    try {
      const readMeta = await readAudioMeta(next);
      setMeta(readMeta);
    } catch {
      setNotice('That file could not be read as audio.');
    } finally {
      setReading(false);
    }
  }

  function reset() {
    abort.current?.abort();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    sourceUrlRef.current = null;
    resultUrlRef.current = null;
    setFile(null);
    setSourceUrl(null);
    setMeta(null);
    setResult(null);
    setResultUrl(null);
    setNotice(null);
    setProgress(null);
  }

  const busy = progress !== null;
  const canRun = file !== null && meta !== null && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const duration = meta?.duration ?? 0;

  const sourceBitrateKbps =
    file && duration > 0 ? Math.round((file.size * 8) / duration / 1000) : null;

  const speedFactor = resolveSpeedFactor(speedPercent);
  const pitchFactor = resolvePitchFactor(pitchSemitones);
  const newDuration = duration > 0 ? duration / speedFactor : 0;
  const referenceHz = REFERENCE_HZ * pitchFactor;

  function updateSetting<T>(setter: (value: T) => void, value: T) {
    setter(value);
    clearResult();
  }

  const options: AudioSpeedPitchOptions = {
    speed_percent: speedPercent,
    pitch_semitones: pitchSemitones,
    preserve_pitch: preservePitch,
    source_sample_rate: meta?.sample_rate ?? 44100,
    bitrate_kbps: sourceBitrateKbps ?? 160,
  };

  const outputExtension = file
    ? codecForExtension(file.name.split('.').pop() ?? 'mp3').extension
    : 'mp3';

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.audio-speed-pitch');
      const output = await processor(
        { files: [file], options: { ...options } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact });
        const url = URL.createObjectURL(artifact.blob);
        resultUrlRef.current = url;
        setResultUrl(url);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(error instanceof Error ? error.message : 'This file could not be processed.');
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  return (
    <VideoWorkspaceLayout
      panelPosition="below"
      stage={
        !file ? (
          <div className="border-border bg-surface rounded-2xl border p-4">
            <FileUpload rule={RULE} accept={AUDIO_ACCEPT} onFiles={addFile} />
          </div>
        ) : (
          <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-brand text-on-brand flex size-11 shrink-0 items-center justify-center rounded-full">
                  <Music aria-hidden className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{safeFileName(file.name)}</span>
                    <button
                      type="button"
                      onClick={reset}
                      aria-label="Remove file"
                      className="text-muted hover:text-foreground"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </div>
                  <p className="text-muted text-xs">
                    {formatBytes(file.size)}
                    {reading && ' · Reading…'}
                    {!reading && duration > 0 && ` · ${formatTime(duration).slice(0, 5)}`}
                    {!reading && sourceBitrateKbps && ` · ${sourceBitrateKbps} kbps`}
                    {!reading && meta?.sample_rate && ` · ${(meta.sample_rate / 1000).toFixed(1)} kHz`}
                    {!reading && meta?.channels && ` · ${meta.channels === 1 ? 'Mono' : 'Stereo'}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="text-danger shrink-0">
                <Trash2 aria-hidden className="size-4" />
                Remove
              </Button>
            </div>

            {sourceUrl && !reading && meta && (
              <LiveWaveform
                key={sourceUrl}
                src={sourceUrl}
                peaks={meta.peaks}
                duration={duration}
                speedFactor={speedFactor}
                pitchFactor={pitchFactor}
                preservePitch={preservePitch}
                pitchSemitones={pitchSemitones}
              />
            )}
            {reading && <div className="bg-cream/50 h-[120px] animate-pulse rounded-xl" />}

            {result && resultUrl && (
              <div className="border-border bg-cream/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold">{result.artifact.file_name}</p>
                  <p className="text-muted text-xs">{formatBytes(result.artifact.blob.size)}</p>
                </div>
                <audio src={resultUrl} controls className="h-9 max-w-full" />
              </div>
            )}
          </div>
        )
      }
      panel={
        file && (
          <ControlPanel>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Field label="Speed and Tempo">
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => updateSetting(setSpeedPercent, Math.max(MIN_SPEED_PERCENT, speedPercent - 10))}
                    disabled={busy}
                    aria-label="Decrease speed"
                    className="size-9 shrink-0 rounded-full p-0"
                  >
                    −
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-bold">{formatSpeedMultiplier(speedPercent)}</span>
                    <p className="text-muted text-xs">
                      {speedPercent === 100 ? 'Normal speed' : speedPercent > 100 ? 'Faster' : 'Slower'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => updateSetting(setSpeedPercent, Math.min(MAX_SPEED_PERCENT, speedPercent + 10))}
                    disabled={busy}
                    aria-label="Increase speed"
                    className="size-9 shrink-0 rounded-full p-0"
                  >
                    +
                  </Button>
                </div>
                <input
                  type="range"
                  min={MIN_SPEED_PERCENT}
                  max={MAX_SPEED_PERCENT}
                  step={5}
                  value={speedPercent}
                  onChange={(event) => updateSetting(setSpeedPercent, Number(event.target.value))}
                  disabled={busy}
                  aria-label="Speed"
                  className="accent-brand mt-3 w-full"
                />
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {SPEED_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => updateSetting(setSpeedPercent, preset)}
                      disabled={busy}
                      aria-pressed={speedPercent === preset}
                      className={`rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
                        speedPercent === preset
                          ? 'bg-brand border-brand text-on-brand'
                          : 'border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {formatSpeedMultiplier(preset)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Pitch">
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      updateSetting(setPitchSemitones, Math.max(MIN_PITCH_SEMITONES, pitchSemitones - 1))
                    }
                    disabled={busy}
                    aria-label="Decrease pitch"
                    className="size-9 shrink-0 rounded-full p-0"
                  >
                    −
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-bold">
                      {pitchSemitones > 0 ? '+' : ''}
                      {pitchSemitones}
                    </span>
                    <p className="text-muted text-xs">
                      {pitchSemitones === 0 ? 'Original pitch' : 'Semitones'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      updateSetting(setPitchSemitones, Math.min(MAX_PITCH_SEMITONES, pitchSemitones + 1))
                    }
                    disabled={busy}
                    aria-label="Increase pitch"
                    className="size-9 shrink-0 rounded-full p-0"
                  >
                    +
                  </Button>
                </div>
                <input
                  type="range"
                  min={MIN_PITCH_SEMITONES}
                  max={MAX_PITCH_SEMITONES}
                  step={1}
                  value={pitchSemitones}
                  onChange={(event) => updateSetting(setPitchSemitones, Number(event.target.value))}
                  disabled={busy}
                  aria-label="Pitch semitones"
                  className="accent-brand mt-3 w-full"
                />
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {PITCH_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => updateSetting(setPitchSemitones, preset)}
                      disabled={busy}
                      aria-pressed={pitchSemitones === preset}
                      className={`rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
                        pitchSemitones === preset
                          ? 'bg-brand border-brand text-on-brand'
                          : 'border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {preset > 0 ? `+${preset}` : preset}
                    </button>
                  ))}
                </div>
                <p className="text-muted mt-2 text-xs">
                  A4 shifts from 440 Hz to {referenceHz.toFixed(1)} Hz.
                </p>
              </Field>
            </div>

            <Field label="Pitch Preservation" hint="Keep the original pitch while speed changes.">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preservePitch}
                  onChange={(event) => updateSetting(setPreservePitch, event.target.checked)}
                  disabled={busy}
                  className="accent-brand size-4"
                />
                {preservePitch
                  ? 'Speed changes keep the original pitch'
                  : 'Speed changes shift pitch too, like a turntable'}
              </label>
            </Field>

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <FileText aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Original Duration</span>
                    {formatTime(duration).slice(0, 5)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Gauge aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">New Duration</span>
                    {formatTime(newDuration).slice(0, 5)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Music4 aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Output</span>
                    {outputExtension.toUpperCase()}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileOutput aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">New Size</span>
                    {result ? formatBytes(result.artifact.blob.size) : 'Export to see'}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                {result && (
                  <Button
                    variant="secondary"
                    onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
                  >
                    <Download aria-hidden className="size-4" />
                    Download
                  </Button>
                )}
                <Button onClick={run} disabled={!canRun} className="h-12 px-6 text-base">
                  {busy ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Gauge aria-hidden className="size-4" />
                  )}
                  {busy ? `Exporting ${percent}%` : 'Export Audio'}
                </Button>
              </div>
            </div>
          </ControlPanel>
        )
      }
    />
  );
}
