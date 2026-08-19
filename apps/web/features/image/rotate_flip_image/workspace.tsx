'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FlipHorizontal2, FlipVertical2, Loader2, RotateCw } from 'lucide-react';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import {
  ControlPanel,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
} from '@/components/image/control_panel';
import { ImageCanvasPreview } from '@/components/image/image_canvas_preview';
import { ImageResultCard, type ImageResultItem } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { zipFiles } from '@/lib/browser/zip';
import { createPreviewUrl } from '@/lib/image/decode';
import { imageRule } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';

const RULE = imageRule({ max_files: 30, max_bytes: 60 * 1024 * 1024 });
const SINGLE_PREVIEW_WIDTH = 420;
const ROW_PREVIEW_WIDTH = 140;

type RotationPreset = '0' | '90' | '180' | '270' | 'custom';

interface Transform {
  rotation: number;
  flip_horizontal: boolean;
  flip_vertical: boolean;
}

interface Entry {
  id: string;
  file: File;
  transform: Transform;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDegrees(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

function transformLabel(transform: Transform): string {
  const parts = [`${normalizeDegrees(transform.rotation)}°`];
  if (transform.flip_horizontal) parts.push('flipped H');
  if (transform.flip_vertical) parts.push('flipped V');
  return parts.join(' · ');
}

export function RotateFlipImageWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);

  // The "default" panel on the right: every change here overwrites every entry's transform,
  // so it always acts as an apply to all. A row's own rotate or flip icon then nudges that one
  // entry away from the default without disturbing the others.
  const [preset, setPreset] = useState<RotationPreset>('0');
  const [customAngle, setCustomAngle] = useState(45);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [background] = useState('#ffffff');

  const defaultRotation = preset === 'custom' ? customAngle : Number(preset);

  const [originalUrls, setOriginalUrls] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<ImageResultItem[] | null>(null);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [downloadAll, setDownloadAll] = useState<(() => void) | null>(null);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // One preview URL per uploaded file. HEIC and TIFF cannot be painted by a plain <img>, so
  // createPreviewUrl rasterises those through decodeImage() first.
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

  // One object URL per rotated artifact. Results are always a native output format, so a plain
  // object URL is always displayable.
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

  function clearResults() {
    setResults(null);
    setDownloadAll(null);
  }

  function addFiles(files: File[]) {
    const transform: Transform = {
      rotation: defaultRotation,
      flip_horizontal: flipHorizontal,
      flip_vertical: flipVertical,
    };
    const nextEntries = files.map((file) => ({ id: makeId(), file, transform }));
    setEntries((prev) => [...prev, ...nextEntries]);
    clearResults();
    setNotice(null);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    clearResults();
  }

  /** Applies a new default rotation and flip to every uploaded file at once. */
  function applyToAll(next: Partial<Transform>) {
    setEntries((prev) =>
      prev.map((entry) => ({ ...entry, transform: { ...entry.transform, ...next } })),
    );
    clearResults();
  }

  /** Nudges a single entry's rotation by 90°, independent of every other file. */
  function rotateEntry(id: string) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              transform: {
                ...entry.transform,
                rotation: normalizeDegrees(entry.transform.rotation + 90),
              },
            }
          : entry,
      ),
    );
    clearResults();
  }

  /** Toggles one axis of a single entry's flip, independent of every other file. */
  function flipEntry(id: string, axis: 'flip_horizontal' | 'flip_vertical') {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, transform: { ...entry.transform, [axis]: !entry.transform[axis] } }
          : entry,
      ),
    );
    clearResults();
  }

  const busy = progress !== null;
  const canRun = entries.length > 0 && !busy;

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResults();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.rotate-flip-image');
      const output = await processor(
        {
          files: entries.map((entry) => entry.file),
          options: { transforms: entries.map((entry) => entry.transform), background },
        },
        { signal: controller.signal, on_progress: setProgress },
      );

      setResults(
        output.artifacts.map((artifact, index) => ({
          artifact,
          caption: transformLabel(entries[index]!.transform),
        })),
      );

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
            downloadBlob(zipBlob, 'rotated_images.zip');
          })();
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'These images could not be rotated.');
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

  function rotatedFileFor(index: number): File | null {
    const item = results?.[index];
    if (!item) return null;
    return new File([item.artifact.blob], item.artifact.file_name, {
      type: item.artifact.mime_type,
    });
  }

  const singleFile = entries.length === 1;

  const preview = singleFile ? (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <ImageCanvasPreview
        file={entries[0]!.file}
        src={originalUrls[0] ?? null}
        width={SINGLE_PREVIEW_WIDTH / 2 - 8}
        caption="Original"
      />
      {rotatedFileFor(0) && (
        <>
          <ArrowRight aria-hidden className="text-muted hidden size-6 shrink-0 sm:block" />
          <ImageCanvasPreview
            file={entries[0]!.file}
            displayFile={rotatedFileFor(0)!}
            src={resultUrls[0] ?? null}
            width={SINGLE_PREVIEW_WIDTH / 2 - 8}
            caption={`Rotated · ${results![0]!.caption}`}
          />
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const rotated = rotatedFileFor(index);
        return (
          <div
            key={entry.id}
            className="border-border bg-cream flex flex-wrap items-center gap-3 rounded-xl border p-3"
          >
            <div className="flex flex-col items-center gap-2">
              <ImageCanvasPreview
                file={entry.file}
                src={originalUrls[index] ?? null}
                width={ROW_PREVIEW_WIDTH}
                aspectRatio="4 / 3"
                hideFileInfo
                caption={`Uploaded · ${transformLabel(entry.transform)}`}
                onRemove={busy ? undefined : () => removeEntry(entry.id)}
              />
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => rotateEntry(entry.id)}
                  disabled={busy}
                  aria-label="Rotate this image 90 degrees"
                  title="Rotate this image 90 degrees"
                >
                  <RotateCw aria-hidden className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={entry.transform.flip_horizontal ? 'primary' : 'secondary'}
                  onClick={() => flipEntry(entry.id, 'flip_horizontal')}
                  disabled={busy}
                  aria-pressed={entry.transform.flip_horizontal}
                  aria-label="Flip this image horizontally"
                  title="Flip this image horizontally"
                >
                  <FlipHorizontal2 aria-hidden className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={entry.transform.flip_vertical ? 'primary' : 'secondary'}
                  onClick={() => flipEntry(entry.id, 'flip_vertical')}
                  disabled={busy}
                  aria-pressed={entry.transform.flip_vertical}
                  aria-label="Flip this image vertically"
                  title="Flip this image vertically"
                >
                  <FlipVertical2 aria-hidden className="size-3.5" />
                </Button>
              </div>
            </div>
            <ArrowRight aria-hidden className="text-muted hidden size-5 shrink-0 sm:block" />
            {rotated ? (
              <ImageCanvasPreview
                file={entry.file}
                displayFile={rotated}
                src={resultUrls[index] ?? null}
                width={ROW_PREVIEW_WIDTH}
                aspectRatio="4 / 3"
                hideFileInfo
                caption={`Rotated · ${results![index]!.caption}`}
              />
            ) : (
              <div
                className="border-border text-muted flex items-center justify-center rounded-xl border border-dashed text-center text-xs"
                style={{ width: ROW_PREVIEW_WIDTH, aspectRatio: '4 / 3' }}
              >
                Not rotated yet
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

      <Field
        label="Rotation"
        hint={entries.length > 1 ? 'Applies to every uploaded image.' : undefined}
      >
        <SegmentedControl
          options={[
            { value: '0', label: '0°' },
            { value: '90', label: '90°' },
            { value: '180', label: '180°' },
            { value: '270', label: '270°' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={preset}
          onChange={(value) => {
            setPreset(value);
            applyToAll({ rotation: value === 'custom' ? customAngle : Number(value) });
          }}
          disabled={busy}
        />
      </Field>

      {preset === 'custom' && (
        <Field label="Custom angle" hint="A larger canvas is used so corners are never cropped.">
          <div className="flex items-center gap-2">
            <NumberField
              value={customAngle}
              onChange={(value) => {
                setCustomAngle(value);
                applyToAll({ rotation: value });
              }}
              min={-359}
              max={359}
              disabled={busy}
              className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
            />
            <span className="text-muted text-sm">degrees</span>
          </div>
        </Field>
      )}

      <Field
        label="Flip"
        hint={entries.length > 1 ? 'Applies to every uploaded image.' : undefined}
      >
        <div className="flex gap-2">
          <Button
            type="button"
            variant={flipHorizontal ? 'primary' : 'secondary'}
            className="flex-1"
            onClick={() => {
              const next = !flipHorizontal;
              setFlipHorizontal(next);
              applyToAll({ flip_horizontal: next });
            }}
            disabled={busy}
            aria-pressed={flipHorizontal}
          >
            <FlipHorizontal2 aria-hidden className="size-4" />
            Horizontal
          </Button>
          <Button
            type="button"
            variant={flipVertical ? 'primary' : 'secondary'}
            className="flex-1"
            onClick={() => {
              const next = !flipVertical;
              setFlipVertical(next);
              applyToAll({ flip_vertical: next });
            }}
            disabled={busy}
            aria-pressed={flipVertical}
          >
            <FlipVertical2 aria-hidden className="size-4" />
            Vertical
          </Button>
        </div>
      </Field>

      {entries.length > 1 && (
        <p className="text-muted -mt-2 text-xs">
          Use the icons under a single image to rotate or flip just that one.
        </p>
      )}

      {notice && <Notice>{notice}</Notice>}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <RotateCw aria-hidden className="size-4" />
        )}
        {busy ? 'Rotating' : `Rotate ${entries.length > 1 ? `${entries.length} images` : 'image'}`}
      </Button>

      {results && (
        <ImageResultCard
          artifacts={results}
          label="Rotated image"
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
