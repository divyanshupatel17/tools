'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Download, Loader2, Scaling } from 'lucide-react';
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
} from '@/components/video/control_panel';
import { SyncedVideoPair, type CropBox } from '@/components/video/synced_video_pair';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import { formatDuration, readVideoMeta, VIDEO_ACCEPT, videoRule } from '@/lib/video/video_formats';
import type { ResizeCropMode } from './processor';

const RULE = videoRule();

const STYLE_OPTIONS = [
  { value: 'resize' as const, label: 'Resize' },
  { value: 'crop' as const, label: 'Crop' },
];

type ResizePreset = '2160p' | '1440p' | '1080p' | '720p' | '480p' | 'custom';

const RESIZE_PRESET_OPTIONS: { value: ResizePreset; label: string }[] = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p' },
  { value: '2160p', label: '4K' },
  { value: 'custom', label: 'Custom' },
];

const RESIZE_PRESET_HEIGHT: Record<Exclude<ResizePreset, 'custom'>, number> = {
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

type CropRatioKey = 'original' | '1:1' | '4:5' | '9:16' | '16:9';

const CROP_RATIO_OPTIONS: { value: CropRatioKey; label: string; ratio: number }[] = [
  { value: '1:1', label: 'Square 1:1', ratio: 1 },
  { value: '4:5', label: 'Portrait 4:5', ratio: 4 / 5 },
  { value: '9:16', label: 'Story 9:16', ratio: 9 / 16 },
  { value: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
];

/** "Original" always leads the list and its ratio comes from the source, so it goes first here
 * and gets its ratio filled in once a file's real dimensions are known. */
function cropRatioOptions(meta: SourceMeta | null): { value: CropRatioKey; label: string; ratio: number }[] {
  return [
    { value: 'original', label: 'Original', ratio: meta ? meta.width / meta.height : 1 },
    ...CROP_RATIO_OPTIONS,
  ];
}

function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * The largest preset that does not upscale the source, so the tool never invents detail by
 * default. Every preset stays selectable regardless — picking a larger one is still allowed,
 * it just shows the upscale caveat instead of being hidden or blocked outright.
 */
function defaultResizePreset(sourceHeight: number): ResizePreset {
  const preset = [...RESIZE_PRESET_OPTIONS]
    .reverse()
    .find((option) => option.value !== 'custom' && RESIZE_PRESET_HEIGHT[option.value] <= sourceHeight);
  return preset?.value ?? 'custom';
}

function centeredCropBox(meta: SourceMeta, ratio: number): CropBox {
  const sourceRatio = meta.width / meta.height;
  let width: number;
  let height: number;
  if (sourceRatio > ratio) {
    height = meta.height;
    width = height * ratio;
  } else {
    width = meta.width;
    height = width / ratio;
  }
  width = toEven(width);
  height = toEven(height);
  return {
    width,
    height,
    x: Math.round((meta.width - width) / 2),
    y: Math.round((meta.height - height) / 2),
  };
}

interface SourceMeta {
  duration: number;
  width: number;
  height: number;
}

interface Result {
  artifact: ProcessorArtifact;
}

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
  if (probe.container) {
    const container = probe.container === 'matroska' ? 'mkv' : probe.container;
    items.push({ label: 'Container', value: container.toUpperCase() });
  }
  return items;
}

export function ResizeCropVideoWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const [style, setStyle] = useState<ResizeCropMode>('resize');
  const [resizePreset, setResizePreset] = useState<ResizePreset>('custom');
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(720);
  const [lockAspect, setLockAspect] = useState(true);
  const [cropRatio, setCropRatio] = useState<CropRatioKey | null>('original');
  const [cropBox, setCropBox] = useState<CropBox | null>(null);

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
      setCustomWidth(toEven(readMeta.width));
      setCustomHeight(toEven(readMeta.height));
      setResizePreset(defaultResizePreset(readMeta.height));
      setCropRatio('original');
      setCropBox(centeredCropBox(readMeta, readMeta.width / readMeta.height));
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

  const resizeDims = useMemo(() => {
    if (!meta) return null;
    if (resizePreset === 'custom') {
      return { width: toEven(customWidth), height: toEven(customHeight) };
    }
    const targetHeight = RESIZE_PRESET_HEIGHT[resizePreset];
    const width = toEven(Math.round(targetHeight * (meta.width / meta.height)));
    return { width, height: toEven(targetHeight) };
  }, [meta, resizePreset, customWidth, customHeight]);

  // Every preset and any custom size stays pickable even above the source's own resolution;
  // this just tells the visitor plainly that going bigger interpolates pixels, it does not
  // recover detail the source never had.
  const isUpscale = Boolean(meta && resizeDims && resizeDims.height > meta.height);

  function selectCropRatio(key: CropRatioKey) {
    if (!meta) return;
    const ratio = cropRatioOptions(meta).find((option) => option.value === key)?.ratio ?? 1;
    setCropRatio(key);
    setCropBox(centeredCropBox(meta, ratio));
  }

  function onCustomWidthChange(next: number) {
    if (lockAspect && customWidth > 0 && customHeight > 0) {
      const ratio = customHeight / customWidth;
      setCustomHeight(Math.round(next * ratio));
    }
    setCustomWidth(next);
  }

  function onCustomHeightChange(next: number) {
    if (lockAspect && customWidth > 0 && customHeight > 0) {
      const ratio = customWidth / customHeight;
      setCustomWidth(Math.round(next * ratio));
    }
    setCustomHeight(next);
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy && (style === 'resize' ? resizeDims !== null : cropBox !== null);
  const percent = Math.round((progress?.ratio ?? 0) * 100);

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
      const processor = await loadProcessor('video.resize-crop-video');
      const options =
        style === 'crop' && cropBox
          ? {
              mode: 'crop' as const,
              crop_width: cropBox.width,
              crop_height: cropBox.height,
              crop_x: cropBox.x,
              crop_y: cropBox.y,
            }
          : {
              mode: 'resize' as const,
              width: resizeDims?.width,
              height: resizeDims?.height,
            };

      const output = await processor(
        { files: [file], options },
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
          .catch(() => {})
          .finally(() => {
            if (afterProbeRequest.current === requestId) setProbingAfter(false);
          });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(
          error instanceof Error
            ? error.message
            : style === 'crop'
              ? 'This video could not be cropped.'
              : 'This video could not be resized.',
        );
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
    setResizePreset('custom');
    setCropRatio('original');
    setCropBox(null);
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
            cropBox: style === 'crop' ? cropBox : null,
            onCropBoxChange:
              style === 'crop'
                ? (box) => {
                    setCropBox(box);
                    setCropRatio(null);
                  }
                : undefined,
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
                  ? `${style === 'crop' ? 'Cropping' : 'Resizing'} ${percent}%`
                  : 'The result appears here once you run it.'}
              </p>
            ),
          }}
        />
      }
      panel={
        <ControlPanel>
          <Field label="Style">
            <SegmentedControl options={STYLE_OPTIONS} value={style} onChange={setStyle} disabled={busy} />
          </Field>

          {style === 'resize' && (
            <>
              <Field label="Resolution">
                <div className="flex flex-wrap gap-2">
                  {RESIZE_PRESET_OPTIONS.map((option) => {
                    const upscales =
                      option.value !== 'custom' &&
                      meta !== null &&
                      RESIZE_PRESET_HEIGHT[option.value] > meta.height;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setResizePreset(option.value)}
                        disabled={busy}
                        aria-pressed={resizePreset === option.value}
                        title={upscales ? `${option.label} is larger than the source` : undefined}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                          resizePreset === option.value
                            ? 'bg-brand border-brand text-on-brand'
                            : 'border-border text-muted hover:text-foreground'
                        }`}
                      >
                        {option.label}
                        {upscales ? ' ↑' : ''}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {resizePreset === 'custom' ? (
                <div className="flex gap-3">
                  <Field label="Width">
                    <NumberField
                      value={customWidth}
                      onChange={onCustomWidthChange}
                      min={2}
                      max={7680}
                      disabled={busy}
                      className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                    />
                  </Field>
                  <Field label="Height">
                    <NumberField
                      value={customHeight}
                      onChange={onCustomHeightChange}
                      min={2}
                      max={7680}
                      disabled={busy}
                      className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                    />
                  </Field>
                </div>
              ) : null}

              {resizePreset === 'custom' && (
                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={lockAspect}
                    onChange={(event) => setLockAspect(event.target.checked)}
                    disabled={busy}
                    className="accent-brand size-4"
                  />
                  <span className="font-semibold">Lock aspect ratio</span>
                </label>
              )}

              {resizeDims && (
                <Notice variant="info">
                  Will resize to {resizeDims.width}×{resizeDims.height}.
                  {isUpscale &&
                    ' This is bigger than the source, so it interpolates pixels rather than adding real detail.'}
                </Notice>
              )}
            </>
          )}

          {style === 'crop' && (
            <>
              <Field label="Aspect ratio">
                <div className="flex flex-wrap gap-2">
                  {cropRatioOptions(meta).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => selectCropRatio(option.value)}
                      disabled={busy || !meta}
                      aria-pressed={cropRatio === option.value}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        cropRatio === option.value
                          ? 'bg-brand border-brand text-on-brand'
                          : 'border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>

              {cropBox && meta && (
                <Notice variant="info">
                  {cropBox.width === toEven(meta.width) && cropBox.height === toEven(meta.height)
                    ? 'Original framing, nothing cropped yet. Drag the box on the left, or pick a ratio, to cut it down.'
                    : `Will crop to ${cropBox.width}×${cropBox.height}. Drag any side or corner of the box on the left to fine tune it.`}
                </Notice>
              )}
            </>
          )}

          {notice && <Notice>{notice}</Notice>}

          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : style === 'crop' ? (
              <Crop aria-hidden className="size-4" />
            ) : (
              <Scaling aria-hidden className="size-4" />
            )}
            {busy
              ? `${style === 'crop' ? 'Cropping' : 'Resizing'} ${percent}%`
              : style === 'crop'
                ? 'Crop video'
                : 'Resize video'}
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
              Drop a video on the left, or choose one. Nothing is uploaded; the whole thing runs
              in this browser tab.
            </p>
          )}
        </ControlPanel>
      }
    />
  );
}
