'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileAudio, FileOutput, FileVideo, Loader2, Trash2, X } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformRangeTrim } from '@/components/audio/waveform_range_trim';
import { TimeField } from '@/components/audio/time_field';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import { readVideoMeta, VIDEO_ACCEPT, videoRule, type VideoMeta } from '@/lib/video/video_formats';
import {
  CHANNELS_OPTIONS,
  EXTRACT_FORMATS,
  FORMAT_LABEL,
  QUALITY_BITRATE_KBPS,
  QUALITY_LABEL,
  QUALITY_PRESETS,
  SAMPLE_RATE_OPTIONS,
  isLossless,
  type ChannelsOption,
  type ExtractFormat,
  type QualityPreset,
  type SampleRateOption,
} from './formats';
import type { VideoToAudioOptions } from './processor';

const RULE = videoRule();

interface Result {
  artifact: ProcessorArtifact;
}

function channelsLabel(channels: ChannelsOption, sourceChannels: number | null): string {
  if (channels === 'mono') return 'Mono';
  if (channels === 'stereo') return 'Stereo';
  return sourceChannels === 1 ? 'Mono' : 'Stereo';
}

function channelsRadioLabel(channels: ChannelsOption, sourceChannels: number | null): string {
  if (channels !== 'source') return channelsLabel(channels, sourceChannels);
  return `Same as source (${channelsLabel(channels, sourceChannels)})`;
}

function sampleRateRadioLabel(option: SampleRateOption, sourceRate: number | null): string {
  if (option !== 'source') return `${option} Hz`;
  return sourceRate ? `Same as source (${(sourceRate / 1000).toFixed(1)} kHz)` : 'Same as source';
}

export function VideoToAudioWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [reading, setReading] = useState(false);

  const [format, setFormat] = useState<ExtractFormat>('mp3');
  const [quality, setQuality] = useState<QualityPreset>('best');
  const [sampleRate, setSampleRate] = useState<SampleRateOption>('source');
  const [channels, setChannels] = useState<ChannelsOption>('source');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

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
    setVideoMeta(null);
    setAudioMeta(null);
    setProbe(null);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    setReading(true);
    try {
      const [meta, audio] = await Promise.all([
        readVideoMeta(next),
        readAudioMeta(next).catch(() => null),
      ]);
      setVideoMeta(meta);
      const duration = audio?.duration ?? meta.duration;
      setAudioMeta(
        audio ?? { duration, sample_rate: null, channels: null, peaks: new Float32Array(0) },
      );
      setStart(0);
      setEnd(duration);
    } catch {
      setNotice('That file could not be read as a video.');
    } finally {
      setReading(false);
    }

    probeVideo(next)
      .then(setProbe)
      .catch(() => {
        // ffprobe detail (fps) is a bonus, not required; the tool still works without it.
      });
  }

  function reset() {
    abort.current?.abort();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    sourceUrlRef.current = null;
    resultUrlRef.current = null;
    setFile(null);
    setSourceUrl(null);
    setVideoMeta(null);
    setAudioMeta(null);
    setProbe(null);
    setResult(null);
    setResultUrl(null);
    setStart(0);
    setEnd(0);
    setNotice(null);
    setProgress(null);
  }

  const busy = progress !== null;
  const canRun = file !== null && audioMeta !== null && !busy && end - start > 0;
  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const duration = audioMeta?.duration ?? videoMeta?.duration ?? 0;
  const lossless = isLossless(format);
  const selectedDuration = Math.max(0, end - start);

  const options: VideoToAudioOptions = {
    format,
    quality,
    sample_rate: sampleRate,
    channels,
    start_seconds: start,
    end_seconds: end,
  };

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.video-to-audio');
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
        setNotice(error instanceof Error ? error.message : 'The audio could not be extracted.');
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
            <FileUpload rule={RULE} accept={VIDEO_ACCEPT} onFiles={addFile} />
          </div>
        ) : (
          <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-ink/80 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                  {sourceUrl ? (
                    <video src={sourceUrl} muted preload="metadata" className="size-full object-cover" />
                  ) : (
                    <FileVideo aria-hidden className="text-cream size-5" />
                  )}
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
                    {!reading && videoMeta && ` · ${videoMeta.width}×${videoMeta.height}`}
                    {!reading && probe?.fps && ` · ${probe.fps} fps`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="text-danger shrink-0">
                <Trash2 aria-hidden className="size-4" />
                Remove
              </Button>
            </div>

            {sourceUrl && !reading && audioMeta && (
              <WaveformRangeTrim
                key={sourceUrl}
                src={sourceUrl}
                peaks={audioMeta.peaks}
                duration={duration}
                start={start}
                end={end}
                onRangeChange={(nextStart, nextEnd) => {
                  setStart(nextStart);
                  setEnd(nextEnd);
                  clearResult();
                }}
                disabled={busy}
              />
            )}
            {reading && <div className="bg-cream/50 h-[120px] animate-pulse rounded-xl" />}

            {!reading && audioMeta && (
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Start time">
                  <TimeField
                    value={start}
                    onChange={(value) => {
                      setStart(Math.min(value, end - 0.2));
                      clearResult();
                    }}
                    min={0}
                    max={Math.max(0, end - 0.2)}
                    disabled={busy}
                    aria-label="Start time"
                  />
                </Field>
                <Field label="End time">
                  <TimeField
                    value={end}
                    onChange={(value) => {
                      setEnd(Math.max(value, start + 0.2));
                      clearResult();
                    }}
                    min={start + 0.2}
                    max={duration}
                    disabled={busy}
                    aria-label="End time"
                  />
                </Field>
                <div className="text-sm">
                  <span className="text-muted block text-xs">Selected duration</span>
                  {formatTime(selectedDuration)}
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Extract audio as">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {EXTRACT_FORMATS.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="format"
                        checked={format === option}
                        onChange={() => {
                          setFormat(option);
                          clearResult();
                        }}
                        disabled={busy}
                        className="accent-brand size-4"
                      />
                      {FORMAT_LABEL[option]}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Audio Quality" hint={lossless ? 'Not used for a lossless format.' : undefined}>
                <div className="flex flex-col gap-2">
                  {QUALITY_PRESETS.map((option) => (
                    <label
                      key={option}
                      className={`flex items-center gap-2 text-sm ${lossless ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="quality"
                        checked={quality === option}
                        onChange={() => {
                          setQuality(option);
                          clearResult();
                        }}
                        disabled={busy || lossless}
                        className="accent-brand size-4"
                      />
                      {QUALITY_LABEL[option]}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Sample Rate">
                <div className="flex flex-col gap-2">
                  {SAMPLE_RATE_OPTIONS.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="sample_rate"
                        checked={sampleRate === option}
                        onChange={() => {
                          setSampleRate(option);
                          clearResult();
                        }}
                        disabled={busy}
                        className="accent-brand size-4"
                      />
                      {sampleRateRadioLabel(option, audioMeta?.sample_rate ?? null)}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Channels">
                <div className="flex flex-col gap-2">
                  {CHANNELS_OPTIONS.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="channels"
                        checked={channels === option}
                        onChange={() => {
                          setChannels(option);
                          clearResult();
                        }}
                        disabled={busy}
                        className="accent-brand size-4"
                      />
                      {channelsRadioLabel(option, audioMeta?.channels ?? null)}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <FileVideo aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Source</span>
                    {formatBytes(file.size)}
                    {videoMeta && ` · ${videoMeta.width}×${videoMeta.height}`}
                    {probe?.fps && ` · ${probe.fps} fps`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileAudio aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">New Size</span>
                    {result ? formatBytes(result.artifact.blob.size) : 'Extract to see'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileOutput aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Output</span>
                    {FORMAT_LABEL[format]} ·{' '}
                    {lossless ? 'Lossless' : `${QUALITY_BITRATE_KBPS[quality]} kbps`} ·{' '}
                    {channelsLabel(channels, audioMeta?.channels ?? null)}
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
                    <FileOutput aria-hidden className="size-4" />
                  )}
                  {busy ? `Extracting ${percent}%` : 'Extract Audio'}
                </Button>
              </div>
            </div>
          </ControlPanel>
        )
      }
    />
  );
}
