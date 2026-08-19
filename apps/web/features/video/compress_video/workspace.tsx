'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Minimize2 } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import {
  ControlPanel,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  SliderField,
} from '@/components/video/control_panel';
import { SyncedVideoPair } from '@/components/video/synced_video_pair';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import { formatDuration, readVideoMeta, VIDEO_ACCEPT, videoRule } from '@/lib/video/video_formats';
import type { CompressMode } from './processor';
import { qualityToCrf } from './processor';

const RULE = videoRule();

const MODE_OPTIONS = [
  { value: 'quality' as const, label: 'Quality' },
  { value: 'target_size' as const, label: 'Target size' },
  { value: 'bitrate' as const, label: 'Bitrate' },
];

type SizeUnit = 'KB' | 'MB' | 'GB';

const SIZE_UNIT_OPTIONS = [
  { value: 'KB' as const, label: 'KB' },
  { value: 'MB' as const, label: 'MB' },
  { value: 'GB' as const, label: 'GB' },
];

/** Bounds and the default value to switch to when the unit changes, per unit. */
const SIZE_UNIT_CONFIG: Record<SizeUnit, { min: number; max: number; default: number }> = {
  KB: { min: 1, max: 1_000_000, default: 500 },
  MB: { min: 0.1, max: 2000, default: 10 },
  GB: { min: 0.1, max: 50, default: 1 },
};

function toMegabytes(value: number, unit: SizeUnit): number {
  if (unit === 'KB') return value / 1024;
  if (unit === 'GB') return value * 1024;
  return value;
}

interface SourceMeta {
  duration: number;
  width: number;
  height: number;
}

interface Result {
  artifact: ProcessorArtifact;
  hit_target: boolean;
}

/** Turns a raw ffprobe read into the label/value pairs a pane's stat grid shows. */
function probeDetails(probe: VideoProbe | null, probing: boolean): { label: string; value: string }[] {
  if (probing) return [{ label: 'Details', value: 'Reading…' }];
  if (!probe) return [];
  const items: { label: string; value: string }[] = [];
  if (probe.width && probe.height) {
    items.push({ label: 'Resolution', value: `${probe.width}×${probe.height}` });
  }
  if (probe.fps) items.push({ label: 'Frame rate', value: `${probe.fps} fps` });
  if (probe.frame_count) items.push({ label: 'Frames', value: probe.frame_count.toLocaleString() });
  if (probe.video_codec) items.push({ label: 'Video codec', value: probe.video_codec.toUpperCase() });
  if (probe.bitrate_kbps) items.push({ label: 'Bitrate', value: `${probe.bitrate_kbps} kbps` });
  if (probe.audio_codec) {
    const rate = probe.sample_rate ? ` · ${(probe.sample_rate / 1000).toFixed(1)} kHz` : '';
    items.push({ label: 'Audio', value: `${probe.audio_codec.toUpperCase()}${rate}` });
  }
  if (probe.container) {
    const container = probe.container === 'matroska' ? 'mkv' : probe.container;
    items.push({ label: 'Container', value: container.toUpperCase() });
  }
  return items;
}

export function CompressVideoWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const [mode, setMode] = useState<CompressMode>('quality');
  const [quality, setQuality] = useState(60);
  const [targetSizeUnit, setTargetSizeUnit] = useState<SizeUnit>('MB');
  const [targetSize, setTargetSize] = useState(SIZE_UNIT_CONFIG.MB.default);
  const [videoKbps, setVideoKbps] = useState(2000);
  const [audioKbps, setAudioKbps] = useState(128);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [beforeProbe, setBeforeProbe] = useState<VideoProbe | null>(null);
  const [afterProbe, setAfterProbe] = useState<VideoProbe | null>(null);
  const [probingBefore, setProbingBefore] = useState(false);
  const [probingAfter, setProbingAfter] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  // Bumped on every new file/result so a slow probe from a previous one never overwrites the
  // details for whatever the visitor is looking at now. Separate counters because the before
  // and after probes run independently of each other.
  const beforeProbeRequest = useRef(0);
  const afterProbeRequest = useRef(0);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;

    setFile(next);
    setResult(null);
    setResultUrl(null);
    setNotice(null);
    setMeta(null);
    setBeforeProbe(null);
    setAfterProbe(null);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    try {
      const readMeta = await readVideoMeta(next);
      setMeta(readMeta);
    } catch {
      setNotice('That file could not be read as a video.');
    }

    const requestId = (beforeProbeRequest.current += 1);
    setProbingBefore(true);
    try {
      const probe = await probeVideo(next);
      if (beforeProbeRequest.current === requestId) setBeforeProbe(probe);
    } catch {
      // FFprobe detail is a bonus, not required; the tool still works without it.
    } finally {
      if (beforeProbeRequest.current === requestId) setProbingBefore(false);
    }
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const estimatedCrf = useMemo(() => qualityToCrf(quality), [quality]);

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
    setAfterProbe(null);
    afterProbeRequest.current += 1;
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('video.compress-video');
      const output = await processor(
        {
          files: [file],
          options: {
            mode,
            quality,
            target_size_mb: toMegabytes(targetSize, targetSizeUnit),
            video_kbps: videoKbps,
            audio_kbps: audioKbps,
            duration_seconds: meta?.duration,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        const hit_target = (output as { hit_target?: boolean }).hit_target ?? true;
        setResult({ artifact, hit_target });
        const url = URL.createObjectURL(artifact.blob);
        resultUrlRef.current = url;
        setResultUrl(url);

        const requestId = (afterProbeRequest.current += 1);
        setProbingAfter(true);
        probeVideo(artifact.blob)
          .then((probe) => {
            if (afterProbeRequest.current === requestId) setAfterProbe(probe);
          })
          .catch(() => {
            // FFprobe detail is a bonus, not required; the tool still works without it.
          })
          .finally(() => {
            if (afterProbeRequest.current === requestId) setProbingAfter(false);
          });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(error instanceof Error ? error.message : 'This video could not be compressed.');
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  function reset() {
    abort.current?.abort();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    sourceUrlRef.current = null;
    resultUrlRef.current = null;
    beforeProbeRequest.current += 1;
    afterProbeRequest.current += 1;
    setFile(null);
    setMeta(null);
    setSourceUrl(null);
    setResult(null);
    setResultUrl(null);
    setBeforeProbe(null);
    setAfterProbe(null);
    setProbingBefore(false);
    setProbingAfter(false);
    setNotice(null);
    setProgress(null);
  }

  const beforeCaption = file
    ? `${safeFileName(file.name)} · ${formatBytes(file.size)}${
        meta ? ` · ${formatDuration(meta.duration)} · ${meta.width}×${meta.height}` : ''
      }`
    : undefined;

  const afterCaption = result
    ? `${result.artifact.file_name} · ${formatBytes(result.artifact.blob.size)}`
    : undefined;

  return (
    <VideoWorkspaceLayout
      stage={
        <SyncedVideoPair
          before={{
            src: sourceUrl,
            caption: beforeCaption,
            details: probeDetails(beforeProbe, probingBefore),
            placeholder: (
              <div className="flex size-full items-center justify-center p-4">
                <FileUpload rule={RULE} accept={VIDEO_ACCEPT} onFiles={addFile} />
              </div>
            ),
          }}
          after={{
            src: resultUrl,
            caption: afterCaption,
            details: probeDetails(afterProbe, probingAfter),
            placeholder: (
              <p className="text-muted px-6 text-center text-sm">
                {busy
                  ? `Compressing ${percent}%`
                  : 'The compressed video appears here once you run it.'}
              </p>
            ),
          }}
        />
      }
      panel={
        <ControlPanel>
          <Field label="Mode">
            <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} disabled={busy} />
          </Field>

          {mode === 'quality' && (
            <SliderField
              label="Quality"
              value={quality}
              onChange={setQuality}
              min={1}
              max={100}
              suffix="%"
              disabled={busy}
              hint={`Higher keeps more detail and a bigger file · encoder level ${estimatedCrf}`}
            />
          )}

          {mode === 'target_size' && (
            <Field
              label="Target size"
              hint="This browser gets as close as it can; it is not always exact."
            >
              <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-stretch">
                <NumberField
                  value={targetSize}
                  onChange={setTargetSize}
                  min={SIZE_UNIT_CONFIG[targetSizeUnit].min}
                  max={SIZE_UNIT_CONFIG[targetSizeUnit].max}
                  allowDecimal
                  disabled={busy}
                  aria-label="Target size"
                  className="border-border bg-background h-11 w-full min-w-0 rounded-full border px-4 outline-none min-[420px]:flex-1"
                />
                {/* `w-fit` sizes this to its own three pills' real content width instead of a
                    guessed pixel value, so it can never push past the panel's edge. */}
                <div className="min-w-0 min-[420px]:w-fit min-[420px]:shrink-0">
                  <SegmentedControl
                    options={SIZE_UNIT_OPTIONS}
                    value={targetSizeUnit}
                    disabled={busy}
                    onChange={(unit) => {
                      setTargetSizeUnit(unit);
                      setTargetSize(SIZE_UNIT_CONFIG[unit].default);
                    }}
                  />
                </div>
              </div>
            </Field>
          )}

          {mode === 'bitrate' && (
            <div className="flex gap-3">
              <Field label="Video (kbps)">
                <NumberField
                  value={videoKbps}
                  onChange={setVideoKbps}
                  min={150}
                  max={20000}
                  disabled={busy}
                  className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                />
              </Field>
              <Field label="Audio (kbps)">
                <NumberField
                  value={audioKbps}
                  onChange={setAudioKbps}
                  min={32}
                  max={320}
                  disabled={busy}
                  className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                />
              </Field>
            </div>
          )}

          {notice && <Notice>{notice}</Notice>}
          {result && !result.hit_target && (
            <Notice variant="info">
              That target size was tight for this length of video; the result may still run a
              little larger than asked.
            </Notice>
          )}

          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Minimize2 aria-hidden className="size-4" />
            )}
            {busy ? `Compressing ${percent}%` : 'Compress video'}
          </Button>

          {result && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
            >
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          )}

          {file && (
            <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
              Choose a different file
            </Button>
          )}

          {!file && (
            <p className="text-muted text-xs">
              Drop a video on the left, or choose one, to compress it. Nothing is uploaded; the
              whole thing runs in this browser tab.
            </p>
          )}
        </ControlPanel>
      }
    />
  );
}
