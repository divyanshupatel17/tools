'use client';

import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Loader2, Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { ControlPanel, Field, Notice, ProgressBar, SliderField } from '@/components/video/control_panel';
import { RangeTrim } from '@/components/video/range_trim';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import { generateFilmstrip } from '@/lib/video/thumbnails';
import { formatDuration, readVideoMeta, VIDEO_ACCEPT, videoRule } from '@/lib/video/video_formats';
import {
  DEFAULT_FPS,
  DEFAULT_WIDTH,
  MAX_FPS,
  MAX_FRAMES,
  MAX_WIDTH,
  MIN_FPS,
  MIN_WIDTH,
} from './processor';

const RULE = videoRule();
const THUMBNAIL_COUNT = 30;

interface SourceMeta {
  duration: number;
  width: number;
  height: number;
}

interface Result {
  artifact: { file_name: string; mime_type: string; blob: Blob };
}

function resultDetails(probe: VideoProbe | null, probing: boolean): { label: string; value: string }[] {
  if (probing) return [{ label: 'Details', value: 'Reading…' }];
  if (!probe) return [];
  const items: { label: string; value: string }[] = [];
  if (probe.width && probe.height) {
    items.push({ label: 'Size', value: `${probe.width}×${probe.height}` });
  }
  if (probe.fps) items.push({ label: 'Frame rate', value: `${probe.fps} fps` });
  if (probe.frame_count) items.push({ label: 'Frames', value: probe.frame_count.toLocaleString() });
  if (probe.duration) items.push({ label: 'Duration', value: formatDuration(probe.duration) });
  return items;
}

export function GifMakerWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [afterProbe, setAfterProbe] = useState<VideoProbe | null>(null);
  const [probingAfter, setProbingAfter] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const afterProbeRequest = useRef(0);
  const thumbnailRequest = useRef(0);

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
    setAfterProbe(null);
    setThumbnails([]);
    setPlaying(false);
    setCurrentTime(0);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    try {
      const readMeta = await readVideoMeta(next);
      setMeta(readMeta);
      setStart(0);
      setEnd(readMeta.duration);

      const thumbRequestId = (thumbnailRequest.current += 1);
      setLoadingThumbnails(true);
      try {
        const frames = await generateFilmstrip(next, readMeta.duration, THUMBNAIL_COUNT);
        if (thumbnailRequest.current === thumbRequestId) setThumbnails(frames);
      } catch {
        // The filmstrip is a visual aid, not required; the trim bar still works without it.
      } finally {
        if (thumbnailRequest.current === thumbRequestId) setLoadingThumbnails(false);
      }
    } catch {
      setNotice('That file could not be read as a video.');
    }
  }

  const busy = progress !== null;
  const selectedSeconds = Math.max(0, end - start);
  const estimatedFrames = Math.round(fps * selectedSeconds);
  const tooManyFrames = estimatedFrames > MAX_FRAMES;
  const canRun = file !== null && !busy && selectedSeconds >= 0.1 && !tooManyFrames;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  function seekPreview(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  }

  function handleRangeChange(nextStart: number, nextEnd: number) {
    setStart(nextStart);
    setEnd(nextEnd);
    // Scrub the preview to whichever edge just moved, so dragging a handle shows exactly that
    // frame instead of leaving the player wherever it happened to be.
    if (nextStart !== start) seekPreview(nextStart);
    else if (nextEnd !== end) seekPreview(nextEnd);
  }

  function useWholeVideo() {
    if (!meta) return;
    setStart(0);
    setEnd(meta.duration);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < start || video.currentTime >= end) {
        video.currentTime = start;
        setCurrentTime(start);
      }
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  /** Playback previews only the selected range: reaching the end handle loops back to the start
   *  handle instead of playing on into footage that will never be part of the GIF. */
  function onPreviewTimeUpdate(time: number) {
    setCurrentTime(time);
    const video = videoRef.current;
    if (!video || video.paused) return;
    if (time >= end - 0.02) {
      video.currentTime = start;
    }
  }

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('video.gif-maker');
      const output = await processor(
        { files: [file], options: { start, end, fps, width } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact });
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
        setNotice(error instanceof Error ? error.message : 'This clip could not be turned into a GIF.');
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
    afterProbeRequest.current += 1;
    thumbnailRequest.current += 1;
    setFile(null);
    setMeta(null);
    setSourceUrl(null);
    setThumbnails([]);
    setLoadingThumbnails(false);
    setStart(0);
    setEnd(0);
    setResult(null);
    setResultUrl(null);
    setAfterProbe(null);
    setProbingAfter(false);
    setNotice(null);
    setProgress(null);
    setPlaying(false);
    setCurrentTime(0);
  }

  const sourceCaption = file
    ? `${safeFileName(file.name)} · ${formatBytes(file.size)}${
        meta ? ` · ${formatDuration(meta.duration)} · ${meta.width}×${meta.height}` : ''
      }`
    : undefined;

  const resultCaption = result
    ? `${result.artifact.file_name} · ${formatBytes(result.artifact.blob.size)}`
    : undefined;

  return (
    <VideoWorkspaceLayout
      stage={
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Source pane */}
            <div className="border-border bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-sm">
              <div className="flex items-center justify-between px-3 pt-2.5">
                <span className="text-muted text-xs font-semibold tracking-wide uppercase">Source</span>
                {sourceUrl && (
                  <button
                    type="button"
                    onClick={() => videoRef.current?.requestFullscreen?.()}
                    aria-label="View source full screen"
                    title="Full screen"
                    className="text-muted hover:text-foreground"
                  >
                    <Maximize2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="bg-ink/5 relative mt-2 flex aspect-video max-h-[38vh] w-full items-center justify-center overflow-hidden">
                {sourceUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    ref={videoRef}
                    src={sourceUrl}
                    muted={muted}
                    className="size-full object-contain"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onTimeUpdate={(event) => onPreviewTimeUpdate(event.currentTarget.currentTime)}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center p-4">
                    <FileUpload rule={RULE} accept={VIDEO_ACCEPT} onFiles={addFile} />
                  </div>
                )}
              </div>

              {sourceUrl && (
                <div className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause' : 'Play selected range'}
                    title="Playback loops the selected range only"
                    className="bg-brand text-on-brand hover:bg-brand-strong flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors"
                  >
                    {playing ? (
                      <Pause aria-hidden className="size-5" fill="currentColor" />
                    ) : (
                      <Play aria-hidden className="ml-0.5 size-5" fill="currentColor" />
                    )}
                  </button>
                  <span className="text-muted flex-1 text-xs">Loops the selected range only.</span>
                  <button
                    type="button"
                    onClick={() => setMuted((value) => !value)}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    aria-pressed={muted}
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

              {sourceCaption && (
                <p className="text-muted border-border/60 border-t px-3 pt-2 pb-3 text-xs">{sourceCaption}</p>
              )}
            </div>

            {/* Result pane */}
            <div className="border-border bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-sm">
              <div className="px-3 pt-2.5">
                <span className="text-muted text-xs font-semibold tracking-wide uppercase">Result</span>
              </div>
              <div className="bg-ink/5 relative mt-2 flex aspect-video max-h-[38vh] w-full items-center justify-center overflow-hidden">
                {result && resultUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resultUrl}
                    alt="GIF preview"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <p className="text-muted px-6 text-center text-sm">
                    {busy
                      ? `Rendering ${percent}%`
                      : 'The GIF appears here once you convert.'}
                  </p>
                )}
              </div>
              {resultCaption && (
                <p className="text-muted border-border/60 border-t px-3 pt-2 text-xs">{resultCaption}</p>
              )}
              {resultDetails(afterProbe, probingAfter).length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pt-2 pb-3 text-xs sm:grid-cols-4">
                  {resultDetails(afterProbe, probingAfter).map((detail) => (
                    <div key={detail.label} className="flex items-baseline justify-between gap-2">
                      <dt className="text-muted">{detail.label}</dt>
                      <dd className="font-semibold tabular-nums">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          {/* Trim bar: a shared control over the source footage, so it spans both panes above
              rather than nesting inside just the Source one. */}
          {meta && (
            <div className="border-border bg-surface flex flex-col gap-2 rounded-2xl border p-3 shadow-sm">
              <RangeTrim
                duration={meta.duration}
                start={start}
                end={end}
                thumbnails={thumbnails}
                loadingThumbnails={loadingThumbnails}
                disabled={busy}
                currentTime={currentTime}
                onSeek={seekPreview}
                onChange={handleRangeChange}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted text-xs">
                  Selected {formatDuration(start)} to {formatDuration(end)} ·{' '}
                  <span className="font-semibold">{formatDuration(selectedSeconds)}</span> of the
                  video
                </p>
                <button
                  type="button"
                  onClick={useWholeVideo}
                  disabled={busy}
                  className="text-brand-strong text-xs font-semibold hover:underline disabled:opacity-40"
                >
                  Use whole video
                </button>
              </div>
            </div>
          )}
        </div>
      }
      panel={
        <ControlPanel>
          <SliderField
            label="Frame rate"
            value={fps}
            onChange={setFps}
            min={MIN_FPS}
            max={MAX_FPS}
            suffix=" fps"
            disabled={busy}
            hint="Higher looks smoother; lower keeps the file smaller."
          />

          <Field label="Width" htmlFor="gif-maker-width" hint="Height scales automatically to keep the aspect ratio.">
            <NumberField
              id="gif-maker-width"
              value={width}
              onChange={setWidth}
              min={MIN_WIDTH}
              max={MAX_WIDTH}
              disabled={busy}
              aria-label="Width in pixels"
              className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
            />
          </Field>

          <Notice variant="info">
            About {estimatedFrames.toLocaleString()} frames at this range and frame rate. GIF keeps
            at most 256 colours and has no audio, so busy footage can look banded.
          </Notice>

          {tooManyFrames && (
            <Notice>
              That range and frame rate add up to more than {MAX_FRAMES} frames, which is too slow
              to render in a browser tab. Pick a shorter range or a lower frame rate.
            </Notice>
          )}

          {notice && <Notice>{notice}</Notice>}

          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Clapperboard aria-hidden className="size-4" />
            )}
            {busy ? `Rendering ${percent}%` : 'Convert to GIF'}
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
              Drop a video on the left, or choose one. Leave the trim handles at the ends to
              convert the whole video, or drag them in to make a GIF from just part of it. Nothing
              is uploaded; the whole thing runs in this browser tab.
            </p>
          )}
        </ControlPanel>
      }
    />
  );
}
