'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Droplets, Loader2 } from 'lucide-react';
import { formatBytes, safeFileName, validateFile, type FileRule } from '@tools/file_utils';
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
import {
  createPreviewUrl,
  decodeImage,
  readImageSize,
  type DecodedImage,
} from '@/lib/image/decode';
import { IMAGE_ACCEPT, imageRule } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { DESIGN_WIDTH, renderWatermark, WATERMARK_ANCHORS, type WatermarkPosition } from './render';

const MAX_BYTES = 40 * 1024 * 1024;
const RULE: FileRule = imageRule({ max_files: 50, max_bytes: MAX_BYTES });
const LOGO_RULE: FileRule = imageRule({ max_files: 1, max_bytes: 10 * 1024 * 1024 });

const SINGLE_PREVIEW_WIDTH = 420;
const ROW_PREVIEW_WIDTH = 140;

const FONT_WEIGHTS = [
  { value: '400', label: 'Regular' },
  { value: '700', label: 'Bold' },
  { value: '900', label: 'Black' },
] as const;

const ANCHOR_LABEL: Record<Exclude<WatermarkPosition, 'tile'>, string> = {
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  center: 'Center',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom center',
  'bottom-right': 'Bottom right',
};

interface Entry {
  id: string;
  file: File;
}

interface Size {
  width: number;
  height: number;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sizeLabel(size: Size | undefined): string {
  return size ? `${size.width} x ${size.height} px` : '';
}

export function WatermarkImageWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);

  const [kind, setKind] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('SAMPLE');
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState('#ffffff');
  const [fontWeight, setFontWeight] = useState<'400' | '700' | '900'>('700');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageScale, setImageScale] = useState(30);
  const [anchor, setAnchor] = useState<Exclude<WatermarkPosition, 'tile'>>('center');
  const [tile, setTile] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [rotation, setRotation] = useState(-30);
  const [scale, setScale] = useState(100);

  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [sizes, setSizes] = useState<(Size | undefined)[]>([]);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<ImageResultItem[] | null>(null);
  const [downloadAll, setDownloadAll] = useState<(() => void) | null>(null);

  const abort = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewDecodedRef = useRef<DecodedImage | null>(null);
  const logoDecodedRef = useRef<DecodedImage | null>(null);

  const [previewDecoded, setPreviewDecoded] = useState<DecodedImage | null>(null);
  const [logoDecoded, setLogoDecoded] = useState<DecodedImage | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  // Only a single upload gets the live watermark preview: one cheap canvas redraw per option
  // change. A batch is gated behind the run button instead.
  const singleEntry = entries.length === 1 ? entries[0]! : null;
  const singleFile = singleEntry?.file ?? null;

  useEffect(() => {
    if (!singleFile) return;
    let cancelled = false;
    decodeImage(singleFile)
      .then((decoded) => {
        if (cancelled) {
          decoded.bitmap.close();
          return;
        }
        previewDecodedRef.current?.bitmap.close();
        previewDecodedRef.current = decoded;
        setPreviewDecoded(decoded);
      })
      .catch(() => {
        if (!cancelled) setDecodeError('That image could not be read.');
      });
    // Cleared on the way out so the effect body never sets state synchronously. Running on
    // cleanup also covers the preview target going away, which no longer needs its own branch.
    return () => {
      cancelled = true;
      previewDecodedRef.current?.bitmap.close();
      previewDecodedRef.current = null;
      setPreviewDecoded(null);
      setDecodeError(null);
    };
  }, [singleFile]);

  // Decode the logo file whenever it changes, closing the previous bitmap.
  useEffect(() => {
    if (!logoFile) return;
    let cancelled = false;
    decodeImage(logoFile)
      .then((decoded) => {
        if (cancelled) {
          decoded.bitmap.close();
          return;
        }
        logoDecodedRef.current?.bitmap.close();
        logoDecodedRef.current = decoded;
        setLogoDecoded(decoded);
      })
      .catch(() => {
        if (!cancelled) setNotice('That logo image could not be read.');
      });
    return () => {
      cancelled = true;
      logoDecodedRef.current?.bitmap.close();
      logoDecodedRef.current = null;
      setLogoDecoded(null);
    };
  }, [logoFile]);

  useEffect(
    () => () => {
      abort.current?.abort();
      previewDecodedRef.current?.bitmap.close();
      logoDecodedRef.current?.bitmap.close();
    },
    [],
  );

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

  // Pixel dimensions for the captions and the single preview frame's aspect ratio. readImageSize
  // covers every supported format, including the ones a plain <img> cannot decode.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      entries.map((entry) => readImageSize(entry.file).catch(() => undefined as Size | undefined)),
    ).then((next) => {
      if (!cancelled) setSizes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // One object URL per watermarked artifact. Results are always a native output format, so a
  // plain object URL is always displayable.
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

  const position: WatermarkPosition = tile ? 'tile' : anchor;

  // The live preview: re-paints the base image plus the watermark on every option change,
  // sharing renderWatermark with the processor so the download matches exactly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewDecoded) return;
    const ratio = previewDecoded.height / previewDecoded.width;
    const width = Math.min(DESIGN_WIDTH, previewDecoded.width);
    const height = Math.max(1, Math.round(width * ratio));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(previewDecoded.bitmap, 0, 0, width, height);
    renderWatermark({
      ctx,
      canvasWidth: width,
      canvasHeight: height,
      options: {
        kind,
        text,
        font_size: fontSize,
        color,
        font_weight: Number(fontWeight),
        image_scale: imageScale,
        position,
        opacity: opacity / 100,
        rotation,
        scale,
      },
      logo: logoDecoded
        ? { bitmap: logoDecoded.bitmap, width: logoDecoded.width, height: logoDecoded.height }
        : null,
    });
  }, [
    previewDecoded,
    logoDecoded,
    kind,
    text,
    fontSize,
    color,
    fontWeight,
    imageScale,
    position,
    opacity,
    rotation,
    scale,
  ]);

  function clearResults() {
    setResults(null);
    setDownloadAll(null);
  }

  function addFiles(files: File[]) {
    setEntries((prev) => [...prev, ...files.map((file) => ({ id: makeId(), file }))]);
    clearResults();
    setNotice(null);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    clearResults();
  }

  function addLogo(files: File[]) {
    const next = files[0];
    if (!next) return;
    const check = validateFile(next, LOGO_RULE);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That logo image could not be used.');
      return;
    }
    setLogoFile(next);
    clearResults();
    setNotice(null);
  }

  const busy = progress !== null;
  const canRun =
    entries.length > 0 && !busy && (kind === 'text' ? text.trim().length > 0 : logoFile !== null);

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResults();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.watermark-image');
      const baseFiles = entries.map((entry) => entry.file);
      const files = kind === 'image' && logoFile ? [...baseFiles, logoFile] : baseFiles;
      const output = await processor(
        {
          files,
          options: {
            kind,
            text,
            font_size: fontSize,
            color,
            font_weight: Number(fontWeight),
            image_scale: imageScale,
            position,
            opacity: opacity / 100,
            rotation,
            scale,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );

      // One artifact per input file, in the same order (see processor.ts's auto_zip: false).
      setResults(
        output.artifacts.map((artifact, index) => ({
          artifact,
          caption: sizeLabel(sizes[index]) || undefined,
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
            downloadBlob(zipBlob, 'watermarked_images.zip');
          })();
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The watermark could not be added.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const anchorHint = useMemo(() => (tile ? 'Tiling covers the whole image.' : undefined), [tile]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} multiple onFiles={addFiles} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  function watermarkedFileFor(index: number): File | null {
    const item = results?.[index];
    if (!item) return null;
    return new File([item.artifact.blob], item.artifact.file_name, {
      type: item.artifact.mime_type,
    });
  }

  const singleSize = sizes[0];
  const singleAspect = singleSize ? `${singleSize.width} / ${singleSize.height}` : '4 / 3';
  const singleResult = watermarkedFileFor(0);

  const preview = singleEntry ? (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <ImageCanvasPreview
        file={singleEntry.file}
        src={originalUrls[0] ?? null}
        width={SINGLE_PREVIEW_WIDTH / 2 - 8}
        aspectRatio={singleAspect}
        caption={
          decodeError
            ? decodeError
            : `Live preview${singleSize ? ` · ${sizeLabel(singleSize)}` : ''}`
        }
        render={
          previewDecoded
            ? () => <canvas ref={canvasRef} className="size-full object-contain" />
            : undefined
        }
      />
      {singleResult ? (
        <>
          <ArrowRight aria-hidden className="text-muted hidden size-6 shrink-0 sm:block" />
          <ImageCanvasPreview
            file={singleEntry.file}
            displayFile={singleResult}
            src={resultUrls[0] ?? null}
            width={SINGLE_PREVIEW_WIDTH / 2 - 8}
            aspectRatio={singleAspect}
            caption={`Watermarked · ${sizeLabel(singleSize)} · ${formatBytes(singleResult.size)}`}
          />
        </>
      ) : (
        <>
          <ArrowRight aria-hidden className="text-muted hidden size-6 shrink-0 sm:block" />
          <div
            className="border-border text-muted flex items-center justify-center rounded-xl border border-dashed text-center text-xs"
            style={{ width: SINGLE_PREVIEW_WIDTH / 2 - 8, aspectRatio: singleAspect }}
          >
            Not watermarked yet
          </div>
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const watermarked = watermarkedFileFor(index);
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
              caption={`${safeFileName(entry.file.name)} · ${formatBytes(entry.file.size)}`}
              onRemove={busy ? undefined : () => removeEntry(entry.id)}
            />
            <ArrowRight aria-hidden className="text-muted hidden size-5 shrink-0 sm:block" />
            {watermarked ? (
              <ImageCanvasPreview
                file={entry.file}
                displayFile={watermarked}
                src={resultUrls[index] ?? null}
                width={ROW_PREVIEW_WIDTH}
                aspectRatio="4 / 3"
                hideFileInfo
                caption={`Watermarked · ${sizeLabel(sizes[index])} · ${formatBytes(
                  watermarked.size,
                )}`}
              />
            ) : (
              <div
                className="border-border text-muted flex items-center justify-center rounded-xl border border-dashed text-center text-xs"
                style={{ width: ROW_PREVIEW_WIDTH, aspectRatio: '4 / 3' }}
              >
                Not watermarked yet
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const panel = (
    <ControlPanel>
      <FileUpload rule={RULE} accept={IMAGE_ACCEPT} multiple onFiles={addFiles} disabled={busy} />

      <Field label="Watermark">
        <SegmentedControl
          options={[
            { value: 'text', label: 'Text' },
            { value: 'image', label: 'Logo' },
          ]}
          value={kind}
          onChange={(value) => {
            setKind(value);
            clearResults();
          }}
          disabled={busy}
        />
      </Field>

      {kind === 'text' ? (
        <>
          <Field label="Watermark text">
            <input
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                clearResults();
              }}
              disabled={busy}
              className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Font size">
              <NumberField
                value={fontSize}
                onChange={(value) => {
                  setFontSize(value);
                  clearResults();
                }}
                min={8}
                max={200}
                disabled={busy}
                aria-label="Font size in pixels"
                className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={color}
                onChange={(event) => {
                  setColor(event.target.value);
                  clearResults();
                }}
                disabled={busy}
                className="border-border bg-background h-11 w-14 cursor-pointer rounded-full border p-1"
              />
            </Field>
          </div>

          <Field label="Weight">
            <SegmentedControl
              options={FONT_WEIGHTS}
              value={fontWeight}
              onChange={(value) => {
                setFontWeight(value);
                clearResults();
              }}
              disabled={busy}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Logo image" hint="A second image, stamped in place of text.">
            <FileUpload rule={LOGO_RULE} accept={IMAGE_ACCEPT} onFiles={addLogo} disabled={busy} />
          </Field>
          {logoFile && (
            <p className="text-muted -mt-2 text-xs">
              {safeFileName(logoFile.name)} · {formatBytes(logoFile.size)}
            </p>
          )}
          <SliderField
            label="Logo size"
            value={imageScale}
            onChange={(value) => {
              setImageScale(value);
              clearResults();
            }}
            min={5}
            max={80}
            suffix="% of image width"
            disabled={busy}
          />
        </>
      )}

      <Field label="Position" hint={anchorHint}>
        <div className="flex flex-wrap gap-2">
          {WATERMARK_ANCHORS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setAnchor(value);
                clearResults();
              }}
              disabled={busy || tile}
              aria-pressed={anchor === value && !tile}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                anchor === value && !tile
                  ? 'bg-brand border-brand text-on-brand'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {ANCHOR_LABEL[value]}
            </button>
          ))}
        </div>
      </Field>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={tile}
          onChange={(event) => {
            setTile(event.target.checked);
            clearResults();
          }}
          disabled={busy}
          className="accent-brand size-4"
        />
        <span className="font-semibold">Repeat across the whole image</span>
      </label>

      <SliderField
        label="Opacity"
        value={opacity}
        onChange={(value) => {
          setOpacity(value);
          clearResults();
        }}
        min={2}
        max={100}
        suffix="%"
        disabled={busy}
      />
      <SliderField
        label="Scale"
        value={scale}
        onChange={(value) => {
          setScale(value);
          clearResults();
        }}
        min={10}
        max={300}
        suffix="%"
        disabled={busy}
      />
      <SliderField
        label="Rotation"
        value={rotation}
        onChange={(value) => {
          setRotation(value);
          clearResults();
        }}
        min={-180}
        max={180}
        suffix="°"
        disabled={busy}
      />

      {entries.length > 1 && (
        <Notice variant="info">Every uploaded image gets the same watermark.</Notice>
      )}

      {notice && <Notice>{notice}</Notice>}
      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Droplets aria-hidden className="size-4" />
        )}
        {busy
          ? 'Stamping'
          : `Add watermark to ${entries.length > 1 ? `${entries.length} images` : 'image'}`}
      </Button>

      {results && (
        <ImageResultCard
          artifacts={results}
          label="Watermarked image"
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
