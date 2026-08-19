'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Shrink } from 'lucide-react';
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
import { canEncode } from '@/lib/image/encode';
import {
  IMAGE_LABEL,
  OUTPUT_FORMATS,
  detectFormat,
  imageRule,
  isLossy,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';

const RULE = imageRule({ max_files: 30, max_bytes: 60 * 1024 * 1024 });
const SINGLE_PREVIEW_WIDTH = 420;
const ROW_PREVIEW_WIDTH = 140;

type Mode = 'quality' | 'target_size';

interface Entry {
  id: string;
  file: File;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Shows both units, e.g. "2.3 MB (2,304 KB)", so a KB target size is easy to compare against. */
function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const kbLabel = `${Math.round(kb).toLocaleString()} KB`;
  return mb >= 1 ? `${mb.toFixed(1)} MB (${kbLabel})` : kbLabel;
}

/** Signed size delta as a short label. Never hides a result that grew. */
function sizeChangeLabel(originalBytes: number, newBytes: number): string {
  if (originalBytes <= 0) return '';
  const percent = Math.round(Math.abs(1 - newBytes / originalBytes) * 100);
  return newBytes <= originalBytes ? `${percent}% smaller` : `${percent}% larger`;
}

export function CompressImageWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [formatOptions, setFormatOptions] = useState<OutputFormat[]>([...OUTPUT_FORMATS]);
  const [mode, setMode] = useState<Mode>('quality');
  const [quality, setQuality] = useState(75);
  const [targetKb, setTargetKb] = useState(200);
  const [background] = useState('#ffffff');

  const [originalDims, setOriginalDims] = useState<{ width: number; height: number } | null>(null);
  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<ImageResultItem[] | null>(null);
  const [downloadAll, setDownloadAll] = useState<(() => void) | null>(null);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    canEncode('avif').then((ok) => {
      setFormatOptions(
        ok ? [...OUTPUT_FORMATS] : OUTPUT_FORMATS.filter((value) => value !== 'avif'),
      );
    });
  }, []);

  const firstFile = entries[0]?.file ?? null;

  // Auto picks the output format from the first upload, matching what came in.
  useEffect(() => {
    if (!firstFile) return;
    let cancelled = false;
    detectFormat(firstFile).then((detected) => {
      if (cancelled) return;
      if (detected === 'jpeg' || detected === 'png' || detected === 'webp' || detected === 'avif') {
        setFormat(detected);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [firstFile]);

  const singleFile = entries.length === 1 ? entries[0]!.file : null;

  // Reads pixel dimensions for the single preview frame's aspect ratio only. readImageSize
  // handles every supported format, including HEIC and TIFF, which a plain <img> cannot decode.
  useEffect(() => {
    if (!singleFile) {
      queueMicrotask(() => setOriginalDims(null));
      return;
    }
    let cancelled = false;
    readImageSize(singleFile)
      .then((dims) => {
        if (!cancelled) setOriginalDims(dims);
      })
      .catch(() => {
        if (!cancelled) setOriginalDims(null);
      });
    return () => {
      cancelled = true;
    };
  }, [singleFile]);

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

  // One object URL per compressed artifact, rebuilt whenever a fresh result set lands.
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
    const nextEntries = files.map((file) => ({ id: makeId(), file }));
    setEntries((prev) => [...prev, ...nextEntries]);
    clearResults();
    setNotice(null);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    clearResults();
  }

  function changeFormat(value: OutputFormat) {
    setFormat(value);
    // Quality and target size only affect lossy formats; PNG output ignores both.
    if (!isLossy(value)) setMode('quality');
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
      const processor = await loadProcessor('image.compress-image');
      const output = await processor(
        {
          files: entries.map((entry) => entry.file),
          options: { format, mode, quality, target_kb: targetKb, background },
        },
        { signal: controller.signal, on_progress: setProgress },
      );

      // One artifact per input file, in the same order (see processor.ts's auto_zip: false).
      setResults(
        output.artifacts.map((artifact, index) => {
          const source = entries[index]?.file;
          let caption = source ? sizeChangeLabel(source.size, artifact.blob.size) : undefined;
          if (mode === 'target_size' && artifact.blob.size > targetKb * 1024) {
            caption = caption ? `${caption} · target size not reached` : 'target size not reached';
          }
          return { artifact, caption, sizeLabel: formatSize(artifact.blob.size) };
        }),
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
            downloadBlob(zipBlob, 'compressed_images.zip');
          })();
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'These images could not be compressed.');
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

  function compressedFileFor(index: number): File | null {
    const item = results?.[index];
    if (!item) return null;
    return new File([item.artifact.blob], item.artifact.file_name, {
      type: item.artifact.mime_type,
    });
  }

  const aspectRatio = originalDims ? `${originalDims.width} / ${originalDims.height}` : '4 / 3';

  const preview = singleFile ? (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <ImageCanvasPreview
        file={entries[0]!.file}
        src={originalUrls[0] ?? null}
        width={SINGLE_PREVIEW_WIDTH / 2 - 8}
        aspectRatio={aspectRatio}
        caption="Original"
      />
      {compressedFileFor(0) && (
        <>
          <ArrowRight aria-hidden className="text-muted hidden size-6 shrink-0 sm:block" />
          <ImageCanvasPreview
            file={entries[0]!.file}
            displayFile={compressedFileFor(0)!}
            src={resultUrls[0] ?? null}
            width={SINGLE_PREVIEW_WIDTH / 2 - 8}
            aspectRatio={aspectRatio}
            caption={`Compressed${results![0]!.caption ? ` · ${results![0]!.caption}` : ''}`}
          />
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const compressed = compressedFileFor(index);
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
              caption={`Uploaded · ${formatSize(entry.file.size)}`}
              onRemove={busy ? undefined : () => removeEntry(entry.id)}
            />
            <ArrowRight aria-hidden className="text-muted hidden size-5 shrink-0 sm:block" />
            {compressed ? (
              <ImageCanvasPreview
                file={entry.file}
                displayFile={compressed}
                src={resultUrls[index] ?? null}
                width={ROW_PREVIEW_WIDTH}
                aspectRatio="4 / 3"
                hideFileInfo
                caption={`Compressed · ${formatSize(compressed.size)}${
                  results![index]!.caption ? ` · ${results![index]!.caption}` : ''
                }`}
              />
            ) : (
              <div
                className="border-border text-muted flex items-center justify-center rounded-xl border border-dashed text-center text-xs"
                style={{ width: ROW_PREVIEW_WIDTH, aspectRatio: '4 / 3' }}
              >
                Not compressed yet
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

      <Field label="Output format">
        <SegmentedControl
          options={formatOptions.map((value) => ({ value, label: IMAGE_LABEL[value] }))}
          value={format}
          onChange={changeFormat}
          disabled={busy}
        />
      </Field>

      {isLossy(format) ? (
        <>
          <Field label="Compress by">
            <SegmentedControl
              options={[
                { value: 'quality', label: 'Quality' },
                { value: 'target_size', label: 'Target size' },
              ]}
              value={mode}
              onChange={(value) => {
                setMode(value);
                clearResults();
              }}
              disabled={busy}
            />
          </Field>

          {mode === 'quality' ? (
            <SliderField
              label="Quality"
              value={quality}
              onChange={(value) => {
                setQuality(value);
                clearResults();
              }}
              min={1}
              max={100}
              suffix="%"
              disabled={busy}
            />
          ) : (
            <Field
              label="Target size"
              hint="The result may land above this if the image cannot compress further."
            >
              <div className="flex items-center gap-2">
                <NumberField
                  value={targetKb}
                  onChange={(value) => {
                    setTargetKb(value);
                    clearResults();
                  }}
                  min={1}
                  max={51200}
                  allowDecimal
                  disabled={busy}
                  className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                />
                <span className="text-muted text-sm">KB</span>
              </div>
            </Field>
          )}
        </>
      ) : (
        <Notice variant="info">
          PNG recompresses losslessly, so quality and target size do not apply. The result is never
          bigger than the file you uploaded, but it may not shrink much either. Switch to JPG, WebP
          or AVIF for a guaranteed smaller file.
        </Notice>
      )}

      <Notice variant="info">
        Dimensions are kept as is. Reencoding always drops metadata such as camera and location
        data.
      </Notice>

      {notice && <Notice>{notice}</Notice>}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Shrink aria-hidden className="size-4" />
        )}
        {busy
          ? 'Compressing'
          : `Compress ${entries.length > 1 ? `${entries.length} images` : 'image'}`}
      </Button>

      {results && (
        <ImageResultCard
          artifacts={results}
          label="Compressed image"
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
