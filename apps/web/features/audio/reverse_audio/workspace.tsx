'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Download,
  FileText,
  Gauge,
  Headphones,
  Loader2,
  Music,
  Radio,
  Trash2,
  X,
} from 'lucide-react';
import { formatBytes, fileExtension, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformPlayer } from '@/components/audio/waveform_player';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  audioRule,
  AUDIO_ACCEPT,
  computeWaveformPeaks,
  formatTime,
  readAudioMeta,
  type AudioMeta,
} from '@/lib/audio/audio_formats';
import { codecForExtension } from './formats';
import { buildReversedPreview, type ReversedPreview } from './preview';
import type { ReverseAudioOptions } from './processor';

const RULE = audioRule();

interface Result {
  artifact: ProcessorArtifact;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-brand/15 text-ink w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {children}
    </span>
  );
}

export function ReverseAudioWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [reading, setReading] = useState(false);
  const [reversed, setReversed] = useState<ReversedPreview | null>(null);
  const [reversedUnavailable, setReversedUnavailable] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const reversedUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (reversedUrlRef.current) URL.revokeObjectURL(reversedUrlRef.current);
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
    if (reversedUrlRef.current) URL.revokeObjectURL(reversedUrlRef.current);
    reversedUrlRef.current = null;
    clearResult();

    setFile(next);
    setNotice(null);
    setMeta(null);
    setReversed(null);
    setReversedUnavailable(false);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    setReading(true);
    try {
      const [readMeta, preview] = await Promise.all([
        readAudioMeta(next),
        buildReversedPreview(next, computeWaveformPeaks),
      ]);
      setMeta(readMeta);
      if (preview) {
        reversedUrlRef.current = preview.url;
        setReversed(preview);
      } else {
        setReversedUnavailable(true);
      }
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
    if (reversedUrlRef.current) URL.revokeObjectURL(reversedUrlRef.current);
    sourceUrlRef.current = null;
    resultUrlRef.current = null;
    reversedUrlRef.current = null;
    setFile(null);
    setSourceUrl(null);
    setMeta(null);
    setReversed(null);
    setReversedUnavailable(false);
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

  const extension = file ? fileExtension(file.name) || 'mp3' : 'mp3';
  const spec = codecForExtension(extension);

  const options: ReverseAudioOptions = {
    bitrate_kbps: sourceBitrateKbps ?? 160,
  };

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.reverse-audio');
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
              <div className="flex flex-col gap-1.5">
                <Badge>Original Audio</Badge>
                <WaveformPlayer key={sourceUrl} src={sourceUrl} peaks={meta.peaks} duration={duration} />
              </div>
            )}

            {!reading && reversed && (
              <div className="flex flex-col gap-1.5">
                <Badge>Reversed Audio</Badge>
                <WaveformPlayer
                  key={reversed.url}
                  src={reversed.url}
                  peaks={reversed.peaks}
                  duration={duration}
                />
              </div>
            )}
            {!reading && !reversed && reversedUnavailable && (
              <p className="text-muted text-xs">
                A reversed preview isn&apos;t available for this file, but export still works.
              </p>
            )}
            {reading && (
              <>
                <div className="bg-cream/50 h-[120px] animate-pulse rounded-xl" />
                <div className="bg-cream/50 h-[120px] animate-pulse rounded-xl" />
              </>
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className="flex items-center gap-2 text-sm">
                <FileText aria-hidden className="text-muted size-4 shrink-0" />
                <span>
                  <span className="text-muted block text-xs">Original Duration</span>
                  <span className="font-semibold">{formatTime(duration).slice(0, 5)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Gauge aria-hidden className="text-muted size-4 shrink-0" />
                <span>
                  <span className="text-muted block text-xs">Reversed Duration</span>
                  <span className="font-semibold">{formatTime(duration).slice(0, 5)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Music aria-hidden className="text-muted size-4 shrink-0" />
                <span>
                  <span className="text-muted block text-xs">Format</span>
                  <span className="font-semibold">{spec.extension.toUpperCase()}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Radio aria-hidden className="text-muted size-4 shrink-0" />
                <span>
                  <span className="text-muted block text-xs">Bitrate</span>
                  <span className="font-semibold">
                    {sourceBitrateKbps ? `${sourceBitrateKbps} kbps` : 'Unknown'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Gauge aria-hidden className="text-muted size-4 shrink-0" />
                <span>
                  <span className="text-muted block text-xs">Sample Rate</span>
                  <span className="font-semibold">
                    {meta?.sample_rate ? `${(meta.sample_rate / 1000).toFixed(1)} kHz` : 'Unknown'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Headphones aria-hidden className="text-muted size-4 shrink-0" />
                <span>
                  <span className="text-muted block text-xs">Channels</span>
                  <span className="font-semibold">{meta?.channels === 1 ? 'Mono' : 'Stereo'}</span>
                </span>
              </div>
            </div>

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm">
                <Music aria-hidden className="text-muted size-4" />
                <span>
                  <span className="text-muted flex items-center gap-1 text-xs">
                    Estimated Output Size
                    <span title="Reversing doesn't change the audio's own length or bitrate, so the exported file lands close to the original's size.">
                      (?)
                    </span>
                  </span>
                  <span className="font-semibold">~ {formatBytes(file.size)}</span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={result ? () => downloadBlob(result.artifact.blob, result.artifact.file_name) : run}
                  disabled={!canRun}
                  className="h-12 px-6 text-base"
                >
                  {busy ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Download aria-hidden className="size-4" />
                  )}
                  {busy ? `Exporting ${percent}%` : result ? 'Download Reversed Audio' : 'Export Reversed Audio'}
                </Button>
              </div>
            </div>
          </ControlPanel>
        )
      }
    />
  );
}
