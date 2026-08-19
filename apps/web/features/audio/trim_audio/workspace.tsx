'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Loader2,
  Music,
  Pencil,
  Play,
  Pause,
  Redo2,
  Rewind,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  Undo2,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fileExtension, formatBytes, replaceExtension, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformMultiTrim, type TrimSegment, type WaveformMultiTrimHandle } from '@/components/audio/waveform_multi_trim';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import { codecForExtension, FADE_DURATIONS } from './formats';
import type { TrimAudioOptions } from './processor';

const RULE = audioRule();
const MIN_SEGMENT_SECONDS = 0.2;
const SKIP_SECONDS = 10;

interface HistoryState {
  cuts: number[];
  removedStarts: number[];
}

interface Result {
  artifact: ProcessorArtifact;
}

function computeSegments(
  cuts: number[],
  trimStart: number,
  trimEnd: number,
  removedStarts: number[],
): TrimSegment[] {
  const removed = new Set(removedStarts);
  const innerCuts = cuts.filter((c) => c > trimStart && c < trimEnd);
  const boundaries = [trimStart, ...innerCuts, trimEnd];
  const segments: TrimSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i] ?? trimStart;
    const end = boundaries[i + 1] ?? trimEnd;
    if (end - start <= 0) continue;
    segments.push({ start, end, removed: removed.has(start) });
  }
  return segments;
}

export function TrimAudioWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [reading, setReading] = useState(false);
  const [customName, setCustomName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const [cuts, setCuts] = useState<number[]>([]);
  const [removedStarts, setRemovedStarts] = useState<number[]>([]);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [fadeDuration, setFadeDuration] = useState<number>(2);

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [zoom, setZoom] = useState(1);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const waveformRef = useRef<WaveformMultiTrimHandle>(null);

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

  function pushHistory() {
    setPast((prev) => [...prev, { cuts, removedStarts }]);
    setFuture([]);
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();

    setFile(next);
    setCustomName(null);
    setNotice(null);
    setMeta(null);
    setCuts([]);
    setRemovedStarts([]);
    setPast([]);
    setFuture([]);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    setReading(true);
    try {
      const readMeta = await readAudioMeta(next);
      setMeta(readMeta);
      setTrimEnd(readMeta.duration);
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
    setCustomName(null);
    setEditingName(false);
    setCuts([]);
    setRemovedStarts([]);
    setTrimStart(0);
    setTrimEnd(0);
    setPast([]);
    setFuture([]);
    setResult(null);
    setResultUrl(null);
    setNotice(null);
    setProgress(null);
  }

  const duration = meta?.duration ?? 0;
  const segments = useMemo(
    () => computeSegments(cuts, trimStart, trimEnd, removedStarts),
    [cuts, trimStart, trimEnd, removedStarts],
  );
  const keptSegments = segments.filter((s) => !s.removed);
  const selectedDuration = keptSegments.reduce((sum, s) => sum + (s.end - s.start), 0);

  const busy = progress !== null;
  const canRun = file !== null && meta !== null && !busy && keptSegments.length > 0;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  const extension = file ? fileExtension(file.name) || 'mp3' : 'mp3';
  const spec = codecForExtension(extension);
  const sourceBitrateKbps =
    file && duration > 0 ? Math.max(64, Math.round((file.size * 8) / duration / 1000)) : 192;

  const displayName = customName ?? (file ? safeFileName(file.name) : '');
  const downloadName = file ? replaceExtension(displayName, spec.extension) : '';

  function addCutAtPlayhead() {
    const time = waveformRef.current?.getCurrentTime() ?? currentTime;
    const boundaries = [trimStart, ...cuts, trimEnd];
    const tooClose = boundaries.some((b) => Math.abs(b - time) < MIN_SEGMENT_SECONDS);
    if (tooClose || time <= trimStart || time >= trimEnd) return;
    pushHistory();
    setCuts((prev) => [...prev, time].sort((a, b) => a - b));
    clearResult();
  }

  function deleteSegment(start: number) {
    pushHistory();
    setRemovedStarts((prev) => [...prev, start]);
    clearResult();
  }

  function handleTrimChange(nextStart: number, nextEnd: number) {
    setTrimStart(nextStart);
    setTrimEnd(nextEnd);
    clearResult();
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [{ cuts, removedStarts }, ...prev]);
    setCuts(previous.cuts);
    setRemovedStarts(previous.removedStarts);
    clearResult();
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, { cuts, removedStarts }]);
    setCuts(next.cuts);
    setRemovedStarts(next.removedStarts);
    clearResult();
  }

  function skip(delta: number) {
    const time = (waveformRef.current?.getCurrentTime() ?? currentTime) + delta;
    waveformRef.current?.seek(time);
  }

  function jumpSegment(direction: 1 | -1) {
    const time = waveformRef.current?.getCurrentTime() ?? currentTime;
    const ordered = [...keptSegments].sort((a, b) => a.start - b.start);
    if (direction === 1) {
      const next = ordered.find((s) => s.start > time + 0.05);
      if (next) waveformRef.current?.seek(next.start);
    } else {
      const previous = [...ordered].reverse().find((s) => s.start < time - 0.05);
      waveformRef.current?.seek(previous ? previous.start : trimStart);
    }
  }

  function togglePlay() {
    if (playing) waveformRef.current?.pause();
    else waveformRef.current?.play();
  }

  const options: TrimAudioOptions = {
    segments: keptSegments.map((s) => ({ start: s.start, end: s.end })),
    fade_in: fadeIn,
    fade_out: fadeOut,
    fade_duration: fadeDuration,
    bitrate_kbps: sourceBitrateKbps,
  };

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.trim-audio');
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
        setNotice(error instanceof Error ? error.message : 'This edit could not be exported.');
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
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        autoFocus
                        className="border-border bg-background h-8 rounded-md border px-2 text-sm font-semibold outline-none"
                        aria-label="File name"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomName(nameDraft.trim() || displayName);
                          setEditingName(false);
                        }}
                        aria-label="Save name"
                        className="text-brand hover:text-brand-strong"
                      >
                        <Check aria-hidden className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{displayName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNameDraft(displayName);
                          setEditingName(true);
                        }}
                        aria-label="Rename file"
                        className="text-muted hover:text-foreground"
                      >
                        <Pencil aria-hidden className="size-3.5" />
                      </button>
                    </div>
                  )}
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
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={undo} disabled={past.length === 0}>
                  <Undo2 aria-hidden className="size-4" />
                  Undo
                </Button>
                <Button variant="ghost" size="sm" onClick={redo} disabled={future.length === 0}>
                  <Redo2 aria-hidden className="size-4" />
                  Redo
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-danger">
                  <Trash2 aria-hidden className="size-4" />
                  Remove
                </Button>
              </div>
            </div>

            {sourceUrl && !reading && meta && (
              <WaveformMultiTrim
                key={sourceUrl}
                ref={waveformRef}
                src={sourceUrl}
                peaks={meta.peaks}
                duration={duration}
                segments={segments}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onTrimChange={handleTrimChange}
                onDeleteSegment={deleteSegment}
                zoom={zoom}
                volume={volume}
                fadeIn={fadeIn}
                fadeOut={fadeOut}
                fadeDuration={fadeDuration}
                onTimeUpdate={setCurrentTime}
                onPlayStateChange={setPlaying}
                disabled={busy}
              />
            )}
            {reading && <div className="bg-cream/50 h-[140px] animate-pulse rounded-xl" />}

            {!reading && meta && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => jumpSegment(-1)}
                    disabled={busy}
                    aria-label="Previous section"
                    className="size-9 rounded-full p-0"
                  >
                    <SkipBack aria-hidden className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => skip(-SKIP_SECONDS)}
                    disabled={busy}
                    aria-label="Back 10 seconds"
                    className="size-9 rounded-full p-0"
                  >
                    <Rewind aria-hidden className="size-4" />
                  </Button>
                  <Button
                    onClick={togglePlay}
                    disabled={busy || duration <= 0}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="size-10 rounded-full p-0"
                  >
                    {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4 translate-x-px" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => skip(SKIP_SECONDS)}
                    disabled={busy}
                    aria-label="Forward 10 seconds"
                    className="size-9 rounded-full p-0"
                  >
                    <Rewind aria-hidden className="size-4 -scale-x-100" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => jumpSegment(1)}
                    disabled={busy}
                    aria-label="Next section"
                    className="size-9 rounded-full p-0"
                  >
                    <SkipForward aria-hidden className="size-4" />
                  </Button>
                  <span className="text-muted text-sm tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={addCutAtPlayhead} disabled={busy}>
                    <Scissors aria-hidden className="size-4" />
                    Add Cut
                  </Button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Volume2 aria-hidden className="text-muted size-4" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      aria-label="Volume"
                      className="accent-brand w-24"
                    />
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
                      className="accent-brand w-24"
                    />
                    <ZoomIn aria-hidden className="text-muted size-4" />
                  </div>
                </div>
              </div>
            )}

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
            <div className="flex flex-wrap items-end gap-6">
              <Field label="Fade In">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fadeIn}
                    onChange={(event) => {
                      setFadeIn(event.target.checked);
                      clearResult();
                    }}
                    disabled={busy}
                    className="accent-brand size-4"
                  />
                  Fade the start in
                </label>
              </Field>
              <Field label="Fade Out">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fadeOut}
                    onChange={(event) => {
                      setFadeOut(event.target.checked);
                      clearResult();
                    }}
                    disabled={busy}
                    className="accent-brand size-4"
                  />
                  Fade the end out
                </label>
              </Field>
              <Field label="Fade Duration">
                <select
                  value={fadeDuration}
                  disabled={busy || (!fadeIn && !fadeOut)}
                  onChange={(event) => {
                    setFadeDuration(Number(event.target.value));
                    clearResult();
                  }}
                  className="border-border bg-background h-10 rounded-full border px-3 text-sm outline-none disabled:opacity-50"
                >
                  {FADE_DURATIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}s
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <Scissors aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Selected Duration</span>
                    {formatTime(selectedDuration)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileText aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Original Duration</span>
                    {formatTime(duration)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Music aria-hidden className="text-muted size-4" />
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
                    onClick={() => downloadBlob(result.artifact.blob, downloadName || result.artifact.file_name)}
                  >
                    <Download aria-hidden className="size-4" />
                    Download
                  </Button>
                )}
                <Button onClick={run} disabled={!canRun} className="h-12 px-6 text-base">
                  {busy ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Download aria-hidden className="size-4" />
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
