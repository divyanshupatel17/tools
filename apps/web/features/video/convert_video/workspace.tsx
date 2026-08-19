'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Repeat } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/video/control_panel';
import { SyncedVideoPair } from '@/components/video/synced_video_pair';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import { formatDuration, readVideoMeta, VIDEO_ACCEPT, videoRule } from '@/lib/video/video_formats';
import {
  AUDIO_OUTPUT_FORMATS,
  FORMAT_LABEL,
  isAudioFormat,
  VIDEO_OUTPUT_FORMATS,
  type ConvertVideoFormat,
} from './formats';
import { MAX_GIF_SECONDS, type ConvertVideoOutput } from './processor';

const RULE = videoRule();

interface SourceMeta {
  duration: number;
  width: number;
  height: number;
}

interface Result {
  artifact: ProcessorArtifact;
  is_audio: boolean;
  /** A second, always playable rendition for the preview player; null when the real artifact is
   *  already natively playable (used directly instead) or a preview couldn't be made. */
  preview: { blob: Blob; mime_type: string } | null;
}

/** Turns a raw ffprobe read into the label/value pairs a pane's stat grid shows. Skips the
 *  resolution and frame rows entirely once a source has no video stream (an audio result). */
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
  if (probe.audio_bitrate_kbps) {
    items.push({ label: 'Audio bitrate', value: `${probe.audio_bitrate_kbps} kbps` });
  }
  if (probe.duration) items.push({ label: 'Duration', value: formatDuration(probe.duration) });
  if (probe.container) {
    const container = probe.container === 'matroska' ? 'mkv' : probe.container;
    items.push({ label: 'Container', value: container.toUpperCase() });
  }
  return items;
}

export function ConvertVideoWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const [format, setFormat] = useState<ConvertVideoFormat>('mp4');

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [beforeProbe, setBeforeProbe] = useState<VideoProbe | null>(null);
  const [afterProbe, setAfterProbe] = useState<VideoProbe | null>(null);
  const [probingBefore, setProbingBefore] = useState(false);
  const [probingAfter, setProbingAfter] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const beforeProbeRequest = useRef(0);
  const afterProbeRequest = useRef(0);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function clearResult() {
    setResult(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setAfterProbe(null);
    afterProbeRequest.current += 1;
  }

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
      // Some containers (e.g. certain MKV or TS files) decode fine in ffmpeg but not in the
      // browser's own <video> element; duration/size still comes from the ffprobe read below.
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

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('video.convert-video');
      const output = await processor(
        { files: [file], options: { format } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        const convertOutput = output as ConvertVideoOutput;
        const is_audio = convertOutput.is_audio ?? isAudioFormat(format);
        const preview = convertOutput.preview ?? null;
        setResult({ artifact, is_audio, preview });
        const url = URL.createObjectURL(artifact.blob);
        resultUrlRef.current = url;
        setResultUrl(url);

        if (preview) {
          const previewObjectUrl = URL.createObjectURL(preview.blob);
          previewUrlRef.current = previewObjectUrl;
          setPreviewUrl(previewObjectUrl);
        }

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
        setNotice(error instanceof Error ? error.message : 'This video could not be converted.');
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
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    sourceUrlRef.current = null;
    resultUrlRef.current = null;
    previewUrlRef.current = null;
    beforeProbeRequest.current += 1;
    afterProbeRequest.current += 1;
    setFile(null);
    setMeta(null);
    setSourceUrl(null);
    setResult(null);
    setResultUrl(null);
    setPreviewUrl(null);
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

  const afterPlaceholder = busy
    ? `Converting ${percent}%`
    : `The converted ${isAudioFormat(format) ? 'audio' : 'video'} appears here once you run it.`;

  // A GIF is an image, not something a <video> tag can decode; the browser can still show it
  // perfectly well, just through an <img>, so it gets its own pane instead of the shared
  // "can't be played back" fallback every other unsupported container falls into.
  const isGifResult = result?.artifact.mime_type === 'image/gif';

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
            // Prefer the artifact itself; fall back to the always playable proxy the processor
            // built when the real format's container or codec isn't one a browser can decode.
            src: result && !isGifResult ? (previewUrl ?? resultUrl) : null,
            caption: afterCaption,
            details: probeDetails(afterProbe, probingAfter),
            placeholder:
              isGifResult && resultUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resultUrl}
                  alt="Converted GIF preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="text-muted px-6 text-center text-sm">{afterPlaceholder}</p>
              ),
          }}
        />
      }
      panel={
        <ControlPanel>
          <Field label="Convert to video" hint="Keeps the picture; the audio track comes along too.">
            <div className="flex flex-wrap gap-2">
              {VIDEO_OUTPUT_FORMATS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setFormat(option);
                    clearResult();
                  }}
                  disabled={busy}
                  aria-pressed={format === option}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    format === option
                      ? 'bg-brand border-brand text-on-brand'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {FORMAT_LABEL[option]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Or pull out the audio" hint="Drops the picture entirely; only the sound is kept.">
            <div className="flex flex-wrap gap-2">
              {AUDIO_OUTPUT_FORMATS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setFormat(option);
                    clearResult();
                  }}
                  disabled={busy}
                  aria-pressed={format === option}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    format === option
                      ? 'bg-brand border-brand text-on-brand'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {FORMAT_LABEL[option]}
                </button>
              ))}
            </div>
          </Field>

          {format === 'gif' && (
            <Notice variant="info">
              GIF keeps at most 256 colours and has no audio, so the result is silent and can look
              banded on photographic footage. Only the first {MAX_GIF_SECONDS} seconds are
              converted; for a custom clip or a longer export, use GIF Maker instead.
            </Notice>
          )}

          {notice && <Notice>{notice}</Notice>}

          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Repeat aria-hidden className="size-4" />
            )}
            {busy ? `Converting ${percent}%` : `Convert to ${FORMAT_LABEL[format]}`}
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
              Drop a video on the left, or choose one, to convert it. Nothing is uploaded; the
              whole thing runs in this browser tab.
            </p>
          )}
        </ControlPanel>
      }
    />
  );
}
