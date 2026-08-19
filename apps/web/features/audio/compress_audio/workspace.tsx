'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileOutput, FileText, Loader2, Minimize2, Music, Trash2, X } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { ControlPanel, Field, Notice, ProgressBar, SliderField } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformPlayer } from '@/components/audio/waveform_player';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import {
  CHANNELS_OPTIONS,
  FORMAT_LABEL,
  SAMPLE_RATE_OPTIONS,
  detectCompressFormat,
  type ChannelsOption,
  type SampleRateOption,
} from './formats';
import {
  resolveBitrateKbps,
  type CompressAudioOptions,
  type CompressionMode,
} from './processor';

const RULE = audioRule();

const MODE_OPTIONS: { value: CompressionMode; label: string }[] = [
  { value: 'quality', label: 'Quality (Recommended)' },
  { value: 'target_size', label: 'Target File Size' },
  { value: 'bitrate', label: 'Bitrate' },
];

type SizeUnit = 'KB' | 'MB';
const SIZE_UNIT_CONFIG: Record<SizeUnit, { min: number; max: number; default: number }> = {
  KB: { min: 10, max: 100_000, default: 1500 },
  MB: { min: 0.1, max: 100, default: 1.5 },
};

function toMegabytes(value: number, unit: SizeUnit): number {
  return unit === 'KB' ? value / 1024 : value;
}

interface Result {
  artifact: ProcessorArtifact;
  hit_target: boolean;
  resolved_kbps: number;
}

function sampleRateLabel(option: SampleRateOption, sourceRate: number | null): string {
  if (option === 'source') {
    return sourceRate ? `Same as source (${(sourceRate / 1000).toFixed(1)} kHz)` : 'Same as source';
  }
  return `${(option / 1000).toFixed(option % 1000 === 0 ? 0 : 2)} kHz`;
}

function channelsLabel(option: ChannelsOption, sourceChannels: number | null): string {
  if (option === 'mono') return 'Mono';
  if (option === 'stereo') return 'Stereo';
  const source = sourceChannels === 1 ? 'Mono' : 'Stereo';
  return `Same as source (${source})`;
}

export function CompressAudioWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [reading, setReading] = useState(false);

  const [mode, setMode] = useState<CompressionMode>('quality');
  const [quality, setQuality] = useState(70);
  const [targetSizeUnit, setTargetSizeUnit] = useState<SizeUnit>('MB');
  const [targetSize, setTargetSize] = useState(SIZE_UNIT_CONFIG.MB.default);
  const [bitrateKbps, setBitrateKbps] = useState(160);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>('source');
  const [channels, setChannels] = useState<ChannelsOption>('source');

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

  const options: CompressAudioOptions = {
    mode,
    quality,
    target_size_mb: toMegabytes(targetSize, targetSizeUnit),
    bitrate_kbps: bitrateKbps,
    sample_rate: sampleRate,
    channels,
    duration_seconds: duration,
  };

  const { kbps: resolvedKbps } = resolveBitrateKbps(options);
  const outputFormat = file ? detectCompressFormat(file.name.split('.').pop() ?? 'mp3') : 'mp3';
  const shrinkPercent =
    result && file && file.size > 0
      ? Math.round((1 - result.artifact.blob.size / file.size) * 100)
      : null;

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
      const processor = await loadProcessor('audio.compress-audio');
      const output = await processor(
        { files: [file], options: { ...options } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        const compressOutput = output as { hit_target?: boolean; resolved_kbps?: number };
        setResult({
          artifact,
          hit_target: compressOutput.hit_target ?? true,
          resolved_kbps: compressOutput.resolved_kbps ?? resolvedKbps,
        });
        const url = URL.createObjectURL(artifact.blob);
        resultUrlRef.current = url;
        setResultUrl(url);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(error instanceof Error ? error.message : 'This file could not be compressed.');
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
              <Field label="Compression Mode">
                <div className="flex flex-col gap-2">
                  {MODE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === option.value}
                        onChange={() => {
                          setMode(option.value);
                          clearResult();
                        }}
                        disabled={busy}
                        className="accent-brand size-4"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </Field>

              {mode === 'quality' && (
                <Field label="Quality">
                  <SliderField
                    label=""
                    value={quality}
                    onChange={(value) => {
                      setQuality(value);
                      clearResult();
                    }}
                    min={1}
                    max={100}
                    suffix="%"
                    disabled={busy}
                  />
                  <div className="text-muted mt-1 flex justify-between text-xs">
                    <span>Small Size</span>
                    <span>Best Quality</span>
                  </div>
                </Field>
              )}

              {mode === 'target_size' && (
                <Field label="Target File Size">
                  <div className="flex items-stretch gap-2">
                    <NumberField
                      value={targetSize}
                      onChange={(value) => {
                        setTargetSize(value);
                        clearResult();
                      }}
                      min={SIZE_UNIT_CONFIG[targetSizeUnit].min}
                      max={SIZE_UNIT_CONFIG[targetSizeUnit].max}
                      allowDecimal
                      disabled={busy}
                      aria-label="Target size"
                      className="border-border bg-background h-10 w-full min-w-0 flex-1 rounded-full border px-3 text-sm outline-none"
                    />
                    <select
                      value={targetSizeUnit}
                      disabled={busy}
                      onChange={(event) => {
                        const unit = event.target.value as SizeUnit;
                        setTargetSizeUnit(unit);
                        setTargetSize(SIZE_UNIT_CONFIG[unit].default);
                        clearResult();
                      }}
                      className="border-border bg-background h-10 shrink-0 rounded-full border px-2 text-sm outline-none"
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                    </select>
                  </div>
                </Field>
              )}

              {mode === 'bitrate' && (
                <Field label="Bitrate">
                  <div className="flex items-center gap-2">
                    <NumberField
                      value={bitrateKbps}
                      onChange={(value) => {
                        setBitrateKbps(value);
                        clearResult();
                      }}
                      min={32}
                      max={320}
                      disabled={busy}
                      aria-label="Bitrate"
                      className="border-border bg-background h-10 w-full min-w-0 rounded-full border px-3 text-sm outline-none"
                    />
                    <span className="text-muted text-sm">kbps</span>
                  </div>
                  <p className="text-muted mt-1 text-xs">Recommended: 96 – 192 kbps</p>
                </Field>
              )}

              {mode !== 'bitrate' && (
                <Field label="Bitrate">
                  <p className="text-lg font-semibold">{resolvedKbps} kbps</p>
                  <p className="text-muted mt-1 text-xs">Recommended: 96 – 192 kbps</p>
                </Field>
              )}

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
                      {sampleRateLabel(option, meta?.sample_rate ?? null)}
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
                      {channelsLabel(option, meta?.channels ?? null)}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            {notice && <Notice>{notice}</Notice>}
            {result && !result.hit_target && (
              <Notice variant="info">
                That target size was tight for this length of audio; the result may still run a
                little larger or smaller than asked.
              </Notice>
            )}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <FileText aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Original Size</span>
                    {formatBytes(file.size)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <FileOutput aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">New Size</span>
                    {result
                      ? `${formatBytes(result.artifact.blob.size)}${
                          shrinkPercent !== null && shrinkPercent > 0 ? ` · ${shrinkPercent}% smaller` : ''
                        }`
                      : 'Compress to see'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Music aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Output</span>
                    {FORMAT_LABEL[outputFormat]} · {resolvedKbps} kbps ·{' '}
                    {sampleRate === 'source'
                      ? meta?.sample_rate
                        ? `${(meta.sample_rate / 1000).toFixed(1)} kHz`
                        : 'source rate'
                      : `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 2)} kHz`}{' '}
                    · {channels === 'mono' ? 'Mono' : channels === 'stereo' ? 'Stereo' : meta?.channels === 1 ? 'Mono' : 'Stereo'}
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
                    <Minimize2 aria-hidden className="size-4" />
                  )}
                  {busy ? `Compressing ${percent}%` : 'Compress Audio'}
                </Button>
              </div>
            </div>
          </ControlPanel>
        )
      }
    />
  );
}
