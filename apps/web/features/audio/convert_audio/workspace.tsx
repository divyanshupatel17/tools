'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, Download, FileAudio, Loader2, Music, Repeat, Trash2, X } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformPlayer } from '@/components/audio/waveform_player';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import {
  CHANNELS_LABEL,
  CHANNELS_OPTIONS,
  CONVERT_AUDIO_FORMATS,
  FORMAT_LABEL,
  QUALITY_BITRATE_KBPS,
  QUALITY_LABEL,
  QUALITY_PRESETS,
  SAMPLE_RATE_LABEL,
  SAMPLE_RATE_OPTIONS,
  isLossless,
  type ChannelsOption,
  type ConvertAudioFormat,
  type QualityPreset,
  type SampleRateOption,
} from './formats';
import type { ConvertAudioOptions } from './processor';

const RULE = audioRule();

interface Result {
  artifact: ProcessorArtifact;
}

function channelsLabel(channels: ChannelsOption, sourceChannels: number | null): string {
  if (channels === 'mono') return 'Mono';
  if (channels === 'stereo') return 'Stereo';
  return sourceChannels === 1 ? 'Mono' : 'Stereo';
}

export function ConvertAudioWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [reading, setReading] = useState(false);

  const [format, setFormat] = useState<ConvertAudioFormat>('mp3');
  const [quality, setQuality] = useState<QualityPreset>('best');
  const [sampleRate, setSampleRate] = useState<SampleRateOption>('source');
  const [channels, setChannels] = useState<ChannelsOption>('source');
  const [normalize, setNormalize] = useState(false);
  const [removeMetadata, setRemoveMetadata] = useState(false);

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
  const lossless = isLossless(format);

  const options: ConvertAudioOptions = {
    format,
    quality,
    sample_rate: sampleRate,
    channels,
    normalize,
    remove_metadata: removeMetadata,
  };

  const sourceBitrateKbps =
    file && duration > 0 ? Math.round((file.size * 8) / duration / 1000) : null;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.convert-audio');
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
        setNotice(error instanceof Error ? error.message : 'This file could not be converted.');
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
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="text-danger shrink-0">
                <Trash2 aria-hidden className="size-4" />
                Remove
              </Button>
            </div>

            {sourceUrl && !reading && meta && (
              <WaveformPlayer key={sourceUrl} src={sourceUrl} peaks={meta.peaks} duration={duration} />
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Convert To">
                <div className="flex flex-col gap-2">
                  {CONVERT_AUDIO_FORMATS.map((option) => (
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
                      {SAMPLE_RATE_LABEL[option]}
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
                      {CHANNELS_LABEL[option]}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Additional Options">
                <div className="flex flex-col gap-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={normalize}
                      onChange={(event) => {
                        setNormalize(event.target.checked);
                        clearResult();
                      }}
                      disabled={busy}
                      className="accent-brand mt-0.5 size-4"
                    />
                    <span>
                      Normalize audio
                      <span className="text-muted block text-xs">Adjust volume to optimal level</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={removeMetadata}
                      onChange={(event) => {
                        setRemoveMetadata(event.target.checked);
                        clearResult();
                      }}
                      disabled={busy}
                      className="accent-brand mt-0.5 size-4"
                    />
                    <span>
                      Remove metadata
                      <span className="text-muted block text-xs">No artist, album or other info</span>
                    </span>
                  </label>
                </div>
              </Field>
            </div>

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <Clock aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Duration</span>
                    {formatTime(duration)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileAudio aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Original Size</span>
                    {formatBytes(file.size)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileAudio aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">New Size</span>
                    {result ? formatBytes(result.artifact.blob.size) : 'Convert to see'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Music aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Output Format</span>
                    {FORMAT_LABEL[format]} ·{' '}
                    {lossless ? 'Lossless' : `${QUALITY_BITRATE_KBPS[quality]} kbps`} ·{' '}
                    {channelsLabel(channels, meta?.channels ?? null)}
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
                    <Repeat aria-hidden className="size-4" />
                  )}
                  {busy ? `Converting ${percent}%` : 'Convert Audio'}
                </Button>
              </div>
            </div>
          </ControlPanel>
        )
      }
    />
  );
}
