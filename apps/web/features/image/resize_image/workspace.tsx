'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Maximize } from 'lucide-react';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import {
  ControlPanel,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  SliderField,
} from '@/components/image/control_panel';
import { ImageCanvasPreview } from '@/components/image/image_canvas_preview';
import { ImageResultCard, type ImageResultItem } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { zipFiles } from '@/lib/browser/zip';
import { createPreviewUrl, readImageSize } from '@/lib/image/decode';
import { imageRule } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';

const RULE = imageRule({ max_files: 30, max_bytes: 60 * 1024 * 1024 });
const SINGLE_PREVIEW_WIDTH = 420;
const ROW_PREVIEW_WIDTH = 140;

type Mode = 'pixels' | 'percent';
type Smoothing = 'high' | 'medium' | 'low' | 'none';

interface Entry {
  id: string;
  file: File;
}

interface Dims {
  width: number;
  height: number;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Reads natural pixel dimensions from any supported format, including HEIC and TIFF. */
function readDims(file: File): Promise<Dims | null> {
  return readImageSize(file).catch(() => null);
}

function dimsLabel(dims: Dims | null): string {
  return dims ? `${dims.width} x ${dims.height}` : '…';
}

export function ResizeImageWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('pixels');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [lockAspect, setLockAspect] = useState(true);
  const [percent, setPercent] = useState(50);
  const [smoothing, setSmoothing] = useState<Smoothing>('high');

  const [originalDims, setOriginalDims] = useState<(Dims | null)[]>([]);
  const [resultDims, setResultDims] = useState<(Dims | null)[]>([]);
  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<ImageResultItem[] | null>(null);
  const [downloadAll, setDownloadAll] = useState<(() => void) | null>(null);

  const abort = useRef<AbortController | null>(null);

  // One preview URL per uploaded file, rebuilt whenever the entry list changes. HEIC and TIFF
  // cannot be painted by a plain <img>, so createPreviewUrl rasterises those through decodeImage.
  useEffect(() => {
    let cancelled = false;
    let createdUrls: string[] = [];
    Promise.all(entries.map((entry) => createPreviewUrl(entry.file))).then((urls) => {
      if (cancelled) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      createdUrls = urls;
      setOriginalUrls(urls);
    });
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [entries]);

  // Natural pixel dimensions for every uploaded file, read once per entry list.
  useEffect(() => {
    let cancelled = false;
    Promise.all(entries.map((entry) => readDims(entry.file))).then((dims) => {
      if (!cancelled) setOriginalDims(dims);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // One object URL per resized artifact, rebuilt whenever a fresh result set lands.
  useEffect(() => {
    if (!results) {
      queueMicrotask(() => setResultUrls([]));
      return;
    }
    const urls = results.map((item) => URL.createObjectURL(item.artifact.blob));
    queueMicrotask(() => setResultUrls(urls));
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [results]);

  // Natural pixel dimensions for every resized artifact, so the caption shows what actually
  // came out rather than the target the user typed (clamping can differ by a pixel or two).
  useEffect(() => {
    if (!results) {
      queueMicrotask(() => setResultDims([]));
      return;
    }
    let cancelled = false;
    Promise.all(
      results.map((item) => readDims(new File([item.artifact.blob], item.artifact.file_name))),
    ).then((dims) => {
      if (!cancelled) setResultDims(dims);
    });
    return () => {
      cancelled = true;
    };
  }, [results]);

  function clearResults() {
    setResults(null);
    setDownloadAll(null);
  }

  function addFiles(files: File[]) {
    const wasEmpty = entries.length === 0;
    const nextEntries = files.map((file) => ({ id: makeId(), file }));
    setEntries((prev) => [...prev, ...nextEntries]);
    clearResults();
    setNotice(null);

    // Seeds the width and height fields from the first upload's real dimensions, so "lock
    // aspect ratio" starts out matching the actual image instead of the 1920x1080 default.
    if (wasEmpty && files[0]) {
      readImageSize(files[0])
        .then((dims) => {
          setWidth(dims.width);
          setHeight(dims.height);
        })
        .catch(() => {});
    }
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    clearResults();
  }

  const busy = progress !== null;
  const canRun = entries.length > 0 && !busy && (mode === 'percent' ? percent > 0 : width > 0);

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResults();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.resize-image');
      const output = await processor(
        {
          files: entries.map((entry) => entry.file),
          options: { mode, width, height, lock_aspect: lockAspect, percent, smoothing },
        },
        { signal: controller.signal, on_progress: setProgress },
      );

      // One artifact per input file, in the same order (see processor.ts's auto_zip: false).
      setResults(output.artifacts.map((artifact) => ({ artifact })));

      if (output.artifacts.length > 1) {
        setDownloadAll(() => () => {
          void (async () => {
            const zipEntries = await Promise.all(
              output.artifacts.map(async (artifact) => ({
                file_name: artifact.file_name,
                bytes: new Uint8Array(await artifact.blob.arrayBuffer()),
              })),
            );
            const zipBlob = await zipFiles(zipEntries);
            downloadBlob(zipBlob, 'resized_images.zip');
          })();
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'These images could not be resized.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} multiple accept="image/*" onFiles={addFiles} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  function resizedFileFor(index: number): File | null {
    const item = results?.[index];
    if (!item) return null;
    return new File([item.artifact.blob], item.artifact.file_name, {
      type: item.artifact.mime_type,
    });
  }

  const singleFile = entries.length === 1;
  const singleAspectRatio = originalDims[0]
    ? `${originalDims[0].width} / ${originalDims[0].height}`
    : '4 / 3';

  const preview = singleFile ? (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <ImageCanvasPreview
        file={entries[0]!.file}
        src={originalUrls[0] ?? null}
        width={SINGLE_PREVIEW_WIDTH / 2 - 8}
        aspectRatio={singleAspectRatio}
        caption={`Original · ${dimsLabel(originalDims[0] ?? null)}`}
      />
      {resizedFileFor(0) && (
        <>
          <ArrowRight aria-hidden className="text-muted hidden size-6 shrink-0 sm:block" />
          <ImageCanvasPreview
            file={entries[0]!.file}
            displayFile={resizedFileFor(0)!}
            src={resultUrls[0] ?? null}
            width={SINGLE_PREVIEW_WIDTH / 2 - 8}
            aspectRatio={
              resultDims[0] ? `${resultDims[0].width} / ${resultDims[0].height}` : singleAspectRatio
            }
            caption={`Resized · ${dimsLabel(resultDims[0] ?? null)}`}
          />
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const resized = resizedFileFor(index);
        return (
          <div
            key={entry.id}
            className="border-border bg-cream flex flex-wrap items-center gap-3 rounded-xl border p-3"
          >
            <ImageCanvasPreview
              file={entry.file}
              src={originalUrls[index] ?? null}
              width={ROW_PREVIEW_WIDTH}
              aspectRatio="4 / 3"
              hideFileInfo
              caption={`Uploaded · ${dimsLabel(originalDims[index] ?? null)}`}
              onRemove={busy ? undefined : () => removeEntry(entry.id)}
            />
            <ArrowRight aria-hidden className="text-muted hidden size-5 shrink-0 sm:block" />
            {resized ? (
              <ImageCanvasPreview
                file={entry.file}
                displayFile={resized}
                src={resultUrls[index] ?? null}
                width={ROW_PREVIEW_WIDTH}
                aspectRatio="4 / 3"
                hideFileInfo
                caption={`Resized · ${dimsLabel(resultDims[index] ?? null)}`}
              />
            ) : (
              <div
                className="border-border text-muted flex items-center justify-center rounded-xl border border-dashed text-center text-xs"
                style={{ width: ROW_PREVIEW_WIDTH, aspectRatio: '4 / 3' }}
              >
                Not resized yet
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const panel = (
    <ControlPanel>
      <FileUpload rule={RULE} multiple accept="image/*" onFiles={addFiles} disabled={busy} />

      <Field label="Resize by">
        <SegmentedControl
          options={[
            { value: 'pixels', label: 'Pixels' },
            { value: 'percent', label: 'Percentage' },
          ]}
          value={mode}
          onChange={(value) => {
            setMode(value);
            clearResults();
          }}
          disabled={busy}
        />
      </Field>

      {mode === 'pixels' ? (
        <>
          <div className="flex gap-3">
            <Field label="Width">
              <NumberField
                value={width}
                onChange={(value) => {
                  setWidth(value);
                  if (lockAspect && width > 0) {
                    setHeight(Math.max(1, Math.round((value * height) / width)));
                  }
                  clearResults();
                }}
                min={1}
                max={10000}
                disabled={busy}
                className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
              />
            </Field>
            <Field label="Height">
              <NumberField
                value={height}
                onChange={(value) => {
                  setHeight(value);
                  if (lockAspect && height > 0) {
                    setWidth(Math.max(1, Math.round((value * width) / height)));
                  }
                  clearResults();
                }}
                min={1}
                max={10000}
                disabled={busy}
                className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={lockAspect}
              onChange={(event) => {
                setLockAspect(event.target.checked);
                clearResults();
              }}
              disabled={busy}
              className="accent-brand size-4"
            />
            <span className="font-semibold">Lock aspect ratio</span>
          </label>
          {entries.length > 1 && (
            <p className="text-muted -mt-2 text-xs">
              Each image keeps its own aspect ratio when locked; height only applies per file.
            </p>
          )}
        </>
      ) : (
        <SliderField
          label="Scale"
          value={percent}
          onChange={(value) => {
            setPercent(value);
            clearResults();
          }}
          min={1}
          max={300}
          suffix="%"
          disabled={busy}
        />
      )}

      <Field label="Resampling quality" hint="Higher quality is slower on large batches.">
        <SegmentedControl
          options={[
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
            { value: 'none', label: 'None' },
          ]}
          value={smoothing}
          onChange={(value) => {
            setSmoothing(value);
            clearResults();
          }}
          disabled={busy}
        />
      </Field>

      {notice && <Notice>{notice}</Notice>}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Maximize aria-hidden className="size-4" />
        )}
        {busy ? 'Resizing' : `Resize ${entries.length > 1 ? `${entries.length} images` : 'image'}`}
      </Button>

      {results && (
        <ImageResultCard
          artifacts={results}
          label="Resized image"
          onDownloadAll={downloadAll ?? undefined}
        />
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEntries([]);
          clearResults();
          setNotice(null);
        }}
        disabled={busy}
      >
        Choose different files
      </Button>
    </ControlPanel>
  );

  return <ImageWorkspaceLayout preview={preview} panel={panel} />;
}
