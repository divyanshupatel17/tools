'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  BarChart3,
  Download,
  FileOutput,
  FileText,
  Gauge,
  Headphones,
  Loader2,
  Music,
  Radio,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar, SliderField } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformPlayer } from '@/components/audio/waveform_player';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import { analyzeAudioFile, formatDb, formatLufs, type AudioStats } from '@/lib/audio/loudness';
import { LUFS_PRESETS, codecForExtension, type LufsPreset } from './formats';
import { resolveGainFactor, type VolumeBoosterOptions } from './processor';

const RULE = audioRule();
const GAIN_PRESETS = [-10, -5, 0, 5, 10] as const;
const MAX_VOLUME_PERCENT = 500;

interface Result {
  artifact: ProcessorArtifact;
}

export function VolumeBoosterWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [stats, setStats] = useState<AudioStats | null>(null);
  const [reading, setReading] = useState(false);

  const [volumePercent, setVolumePercent] = useState(100);
  const [gainDb, setGainDb] = useState(0);
  const [normalize, setNormalize] = useState(false);
  const [targetLufs, setTargetLufs] = useState<LufsPreset>(-14);

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
    setStats(null);
    setVolumePercent(100);
    setGainDb(0);
    setNormalize(false);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    setReading(true);
    try {
      const [readMeta, readStats] = await Promise.all([readAudioMeta(next), analyzeAudioFile(next)]);
      setMeta(readMeta);
      setStats(readStats);
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
    setStats(null);
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

  const gainFactor = resolveGainFactor({ volume_percent: volumePercent, gain_db: gainDb });
  const dbFactor = 10 ** (gainDb / 20);
  const maxAllowedPercent =
    stats && stats.peak_linear > 0
      ? Math.max(1, Math.min(MAX_VOLUME_PERCENT, Math.floor(100 / stats.peak_linear / dbFactor)))
      : MAX_VOLUME_PERCENT;
  const willClip = !normalize && stats ? stats.peak_linear * gainFactor > 1 : false;

  // Live preview gain: the plain boost/gain multiplier normally, or, while Normalize is on, an
  // approximation of loudnorm's own single pass gain derived from the file's own measured
  // loudness, so the waveform player is heard at roughly the exported loudness while previewing
  // rather than staying silent about what Normalize will actually sound like.
  const previewGain =
    normalize && stats && Number.isFinite(stats.lufs_integrated)
      ? Math.min(20, 10 ** ((targetLufs - stats.lufs_integrated) / 20))
      : normalize
        ? 1
        : gainFactor;

  const options: VolumeBoosterOptions = {
    volume_percent: volumePercent,
    gain_db: gainDb,
    normalize,
    target_lufs: targetLufs,
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
      const processor = await loadProcessor('audio.volume-booster');
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
              <WaveformPlayer
                key={sourceUrl}
                src={sourceUrl}
                peaks={meta.peaks}
                duration={duration}
                gain={previewGain}
              />
            )}
            <p className="text-muted -mt-2 text-xs">
              Playback above previews the current volume, gain and normalize settings live.
            </p>
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
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Field label="Volume Booster">
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setVolumePercent((value) => Math.max(0, value - 10));
                      clearResult();
                    }}
                    disabled={busy}
                    aria-label="Decrease volume"
                    className="size-9 shrink-0 rounded-full p-0"
                  >
                    −
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-bold">{volumePercent}%</span>
                    <p className="text-muted text-xs">
                      {volumePercent === 100 ? 'Default (Original Volume)' : volumePercent > 100 ? 'Boosted' : 'Reduced'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setVolumePercent((value) => Math.min(MAX_VOLUME_PERCENT, value + 10));
                      clearResult();
                    }}
                    disabled={busy}
                    aria-label="Increase volume"
                    className="size-9 shrink-0 rounded-full p-0"
                  >
                    +
                  </Button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={MAX_VOLUME_PERCENT}
                  step={5}
                  value={volumePercent}
                  onChange={(event) => {
                    setVolumePercent(Number(event.target.value));
                    clearResult();
                  }}
                  disabled={busy || normalize}
                  aria-label="Volume percent"
                  className="accent-brand mt-3 w-full"
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-muted block">Current Volume</span>
                    <span className="font-semibold">100%</span>
                  </div>
                  <div>
                    <span className="text-muted block">Boosted Volume</span>
                    <span className="font-semibold">{volumePercent}%</span>
                  </div>
                  <div>
                    <span className="text-muted block">Max Allowed</span>
                    <span className="font-semibold">{maxAllowedPercent}%</span>
                  </div>
                </div>
              </Field>

              <Field label="Gain Adjustment">
                <SliderField
                  label=""
                  value={gainDb}
                  onChange={(value) => {
                    setGainDb(value);
                    clearResult();
                  }}
                  min={-20}
                  max={20}
                  step={0.5}
                  suffix=" dB"
                  disabled={busy || normalize}
                />
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {GAIN_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setGainDb(preset);
                        clearResult();
                      }}
                      disabled={busy || normalize}
                      aria-pressed={gainDb === preset}
                      className={`rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
                        gainDb === preset
                          ? 'bg-brand border-brand text-on-brand'
                          : 'border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {preset > 0 ? `+${preset}` : preset} dB
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Normalize">
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
                    <span className="text-muted block text-xs">
                      Make volume consistent and remove volume differences.
                    </span>
                  </span>
                </label>
                {normalize && (
                  <div className="mt-3">
                    <label htmlFor="target-lufs" className="text-muted mb-1 block text-xs font-semibold">
                      Target Level
                    </label>
                    <select
                      id="target-lufs"
                      value={targetLufs}
                      disabled={busy}
                      onChange={(event) => {
                        setTargetLufs(Number(event.target.value) as LufsPreset);
                        clearResult();
                      }}
                      className="border-border bg-background h-10 w-full rounded-full border px-3 text-sm outline-none"
                    >
                      {LUFS_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-muted mt-1 text-xs">
                      Normalization analyzes the audio and adjusts it to the target loudness.
                    </p>
                  </div>
                )}
              </Field>
            </div>

            {stats && (
              <div className="border-border bg-cream/30 grid grid-cols-2 gap-3 rounded-xl border p-3 text-xs sm:grid-cols-4">
                <div className="flex items-center gap-2">
                  <Activity aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Peak Level</span>
                    <span className="font-semibold">{formatDb(stats.peak_db)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">RMS Level</span>
                    <span className="font-semibold">{formatDb(stats.rms_db)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Radio aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">LUFS (Estimated)</span>
                    <span className="font-semibold">{formatLufs(stats.lufs_integrated)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Dynamic Range</span>
                    <span className="font-semibold">{stats.dynamic_range_db.toFixed(1)} dB</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Headphones aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Channels</span>
                    <span className="font-semibold">{meta?.channels === 1 ? 'Mono' : 'Stereo'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AudioLines aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Sample Rate</span>
                    <span className="font-semibold">
                      {meta?.sample_rate ? `${(meta.sample_rate / 1000).toFixed(1)} kHz` : 'Unknown'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Gauge aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Bitrate</span>
                    <span className="font-semibold">{sourceBitrateKbps ? `${sourceBitrateKbps} kbps` : 'Unknown'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Applied Gain</span>
                    <span className="font-semibold">{normalize ? `To ${targetLufs} LUFS` : formatDb(20 * Math.log10(gainFactor || 1))}</span>
                  </span>
                </div>
              </div>
            )}

            {notice && <Notice>{notice}</Notice>}
            {willClip && (
              <Notice variant="info">
                This gain will push the loudest moment past 0 dBFS and may clip. Lower the boost
                or gain, or turn on Normalize instead.
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
                    {result ? formatBytes(result.artifact.blob.size) : 'Export to see'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Music aria-hidden className="text-muted size-4" />
                  <span>
                    <span className="text-muted block text-xs">Output</span>
                    {outputExtension.toUpperCase()} · {formatTime(duration).slice(0, 5)}
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
                    <Volume2 aria-hidden className="size-4" />
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
