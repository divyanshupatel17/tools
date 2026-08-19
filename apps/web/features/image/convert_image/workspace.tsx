'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { formatBytes, type FileRule } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import {
  ControlPanel,
  Field,
  Notice,
  ProgressBar,
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
  CONVERT_OUTPUT_FORMATS,
  detectFormat,
  IMAGE_ACCEPT,
  IMAGE_LABEL,
  imageRule,
  isLossy,
  supportsAlpha,
  type ConvertOutputFormat,
  type ImageFormat,
} from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { fitIcoSize, ICO_MAX_SIZE } from './ico_size';
import type { ConvertImageOptions } from './processor';

export interface ConvertImageWorkspaceProps {
  /** Locks the output format and tailors the copy for a one way SEO route. */
  preset?: { from: ImageFormat; to: ConvertOutputFormat };
}

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_FILES = 30;
const SINGLE_PREVIEW_WIDTH = 420;
const ROW_PREVIEW_WIDTH = 140;

/** Output formats a plain `<img>` can paint. TIFF is the one thing we can write but the browser
 *  cannot show inline, so its row states that instead of rendering a broken image. */
const VIEWABLE_OUTPUT = new Set<ConvertOutputFormat>([
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'bmp',
  'ico',
]);

// Extensions and MIME types the shared rule builder does not split per format; kept local
// because a preset route only ever needs its one input format, not the whole decode list.
const FORMAT_EXTENSIONS: Record<ImageFormat, string[]> = {
  jpeg: ['jpg', 'jpeg', 'jfif'],
  png: ['png'],
  webp: ['webp'],
  avif: ['avif'],
  gif: ['gif'],
  bmp: ['bmp'],
  tiff: ['tif', 'tiff'],
  heic: ['heic', 'heif'],
  svg: ['svg'],
  ico: ['ico'],
};
const FORMAT_MIME: Record<ImageFormat, string[]> = {
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  avif: ['image/avif'],
  gif: ['image/gif'],
  bmp: ['image/bmp'],
  tiff: ['image/tiff'],
  heic: ['image/heic', 'image/heif'],
  svg: ['image/svg+xml'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
};

interface Entry {
  id: string;
  file: File;
}

type Size = { width: number; height: number };

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sizeLabel(size: Size | null): string | null {
  return size ? `${size.width} x ${size.height}` : null;
}

/** Joins the parts of a caption that are actually known, so a caption never reads "· ·". */
function caption(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

export function ConvertImageWorkspace({ preset }: ConvertImageWorkspaceProps) {
  // Preset arrives as an inline object literal, so every field it drives is read as a primitive:
  // depending on the object itself would re-run each effect on every render.
  const presetFrom = preset?.from ?? null;
  const presetTo = preset?.to ?? null;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [sourceFormat, setSourceFormat] = useState<ImageFormat | null>(presetFrom);

  const [format, setFormat] = useState<ConvertOutputFormat>(presetTo ?? 'png');
  const [availableFormats, setAvailableFormats] = useState<ConvertOutputFormat[] | null>(null);
  const [quality, setQuality] = useState(82);
  const [background, setBackground] = useState('#ffffff');
  const [svgWidth, setSvgWidth] = useState(1024);
  const [svgHeight, setSvgHeight] = useState(1024);

  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [originalSizes, setOriginalSizes] = useState<(Size | null)[]>([]);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<ImageResultItem[] | null>(null);
  const [resultFormat, setResultFormat] = useState<ConvertOutputFormat | null>(null);
  const [downloadAll, setDownloadAll] = useState<(() => void) | null>(null);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Probes real encoder support once, whether or not a preset is fixing the format, so an
  // unsupported target (in practice only AVIF) is hidden rather than failing after the click.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CONVERT_OUTPUT_FORMATS.map(async (candidate) =>
        (await canEncode(candidate)) ? candidate : null,
      ),
    ).then((list) => {
      if (cancelled) return;
      const supported = list.filter((value): value is ConvertOutputFormat => value !== null);
      setAvailableFormats(supported);
      if (!presetTo) {
        setFormat((current) => (supported.includes(current) ? current : (supported[0] ?? current)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [presetTo]);

  const firstFile = entries[0]?.file ?? null;

  // The input format only decides whether the SVG raster size fields are needed.
  useEffect(() => {
    if (presetFrom || !firstFile) return;
    let cancelled = false;
    detectFormat(firstFile).then((detected) => {
      if (!cancelled) setSourceFormat(detected);
    });
    return () => {
      cancelled = true;
    };
  }, [firstFile, presetFrom]);

  const isSvgInput = (presetFrom ?? sourceFormat) === 'svg';

  // One preview URL per uploaded file, rebuilt whenever the entry list changes. HEIC and TIFF
  // cannot be painted by a plain <img>, so createPreviewUrl rasterises those through decodeImage.
  useEffect(() => {
    let cancelled = false;
    let createdUrls: string[] = [];
    Promise.all(entries.map((entry) => createPreviewUrl(entry.file)))
      .then((urls) => {
        if (cancelled) {
          urls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        createdUrls = urls;
        setOriginalUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setNotice('One of these images could not be previewed.');
      });
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [entries]);

  // Pixel sizes for the captions. readImageSize handles every supported format, including HEIC
  // and TIFF, which a plain `new Image()` cannot decode.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      entries.map((entry) => readImageSize(entry.file).catch((): Size | null => null)),
    ).then((sizes) => {
      if (!cancelled) setOriginalSizes(sizes);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // One object URL per converted artifact, rebuilt whenever a fresh result set lands.
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
    setResultFormat(null);
    setDownloadAll(null);
  }

  function addFiles(files: File[]) {
    setEntries((previous) => [...previous, ...files.map((file) => ({ id: makeId(), file }))]);
    clearResults();
    setNotice(null);
  }

  function removeEntry(id: string) {
    setEntries((previous) => {
      const next = previous.filter((entry) => entry.id !== id);
      if (next.length === 0 && !presetFrom) setSourceFormat(null);
      return next;
    });
    clearResults();
  }

  const rule: FileRule = useMemo(
    () =>
      presetFrom
        ? {
            mime_types: FORMAT_MIME[presetFrom],
            extensions: FORMAT_EXTENSIONS[presetFrom],
            max_files: MAX_FILES,
            max_bytes: MAX_BYTES,
          }
        : imageRule({ max_files: MAX_FILES, max_bytes: MAX_BYTES }),
    [presetFrom],
  );

  const accept = presetFrom
    ? [
        ...FORMAT_MIME[presetFrom],
        ...FORMAT_EXTENSIONS[presetFrom].map((extension) => `.${extension}`),
      ].join(',')
    : IMAGE_ACCEPT;

  const busy = progress !== null;
  const targetSupported = availableFormats === null || availableFormats.includes(format);
  const canRun = entries.length > 0 && !busy && targetSupported;

  /** The size the processor will actually write, mirroring its own SVG and ICO rules. */
  function outputSize(index: number): Size | null {
    const source = isSvgInput ? { width: svgWidth, height: svgHeight } : originalSizes[index];
    if (!source) return null;
    if (format !== 'ico') return source;
    const fitted = fitIcoSize(source.width, source.height);
    return { width: fitted.width, height: fitted.height };
  }

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResults();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      // `satisfies` rather than an annotation: loadProcessor erases the options type to
      // Record<string, unknown>, which only a fresh object literal is assignable to.
      const options = {
        format,
        quality: quality / 100,
        background,
        svg_size: isSvgInput ? { width: svgWidth, height: svgHeight } : undefined,
      } satisfies ConvertImageOptions;
      const processor = await loadProcessor('image.convert-image');
      const output = await processor(
        { files: entries.map((entry) => entry.file), options },
        { signal: controller.signal, on_progress: setProgress },
      );

      // One artifact per input file, in the same order (see processor.ts's auto_zip: false).
      setResults(output.artifacts.map((artifact) => ({ artifact })));
      setResultFormat(format);

      if (output.artifacts.length > 1) {
        setDownloadAll(() => () => {
          void (async () => {
            const zipEntries = await Promise.all(
              output.artifacts.map(async (artifact) => ({
                file_name: artifact.file_name,
                bytes: new Uint8Array(await artifact.blob.arrayBuffer()),
              })),
            );
            downloadBlob(await zipFiles(zipEntries), 'converted_images.zip');
          })();
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'These images could not be converted.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={rule} accept={accept} multiple onFiles={addFiles} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  function convertedFileFor(index: number): File | null {
    const item = results?.[index];
    if (!item) return null;
    return new File([item.artifact.blob], item.artifact.file_name, {
      type: item.artifact.mime_type,
    });
  }

  function resultCaption(index: number): string {
    const converted = convertedFileFor(index);
    if (!converted) return '';
    const label = resultFormat ? IMAGE_LABEL[resultFormat] : 'Converted';
    return caption([label, sizeLabel(outputSize(index)), formatBytes(converted.size)]);
  }

  const resultViewable = resultFormat === null || VIEWABLE_OUTPUT.has(resultFormat);

  /** The right hand pane of a row: the converted picture, an honest "cannot be shown" frame for
   *  TIFF, or a dashed placeholder while there is no result yet. */
  function resultPane(index: number, width: number, aspectRatio: string, hideFileInfo: boolean) {
    const converted = convertedFileFor(index);
    if (!converted) {
      return (
        <div
          className="border-border text-muted flex items-center justify-center rounded-xl border border-dashed px-2 text-center text-xs"
          style={{ width, aspectRatio }}
        >
          Not converted yet
        </div>
      );
    }

    const source = entries[index]!.file;
    if (!resultViewable) {
      return (
        <ImageCanvasPreview
          file={source}
          displayFile={converted}
          width={width}
          aspectRatio={aspectRatio}
          hideFileInfo={hideFileInfo}
          caption={resultCaption(index)}
          render={() => (
            <div className="text-muted flex size-full items-center justify-center px-2 text-center text-xs">
              Preview not available for this format
            </div>
          )}
        />
      );
    }

    return (
      <ImageCanvasPreview
        file={source}
        displayFile={converted}
        src={resultUrls[index] ?? null}
        width={width}
        aspectRatio={aspectRatio}
        hideFileInfo={hideFileInfo}
        caption={resultCaption(index)}
      />
    );
  }

  const singleEntry = entries.length === 1 ? entries[0]! : null;
  const singleAspect = originalSizes[0]
    ? `${originalSizes[0].width} / ${originalSizes[0].height}`
    : '4 / 3';

  const preview = singleEntry ? (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <ImageCanvasPreview
        file={singleEntry.file}
        src={originalUrls[0] ?? null}
        width={SINGLE_PREVIEW_WIDTH / 2 - 8}
        aspectRatio={singleAspect}
        caption={caption([
          'Original',
          sizeLabel(originalSizes[0] ?? null),
          formatBytes(singleEntry.file.size),
        ])}
      />
      {results?.[0] && (
        <>
          <ArrowRight aria-hidden className="text-muted hidden size-6 shrink-0 sm:block" />
          {resultPane(0, SINGLE_PREVIEW_WIDTH / 2 - 8, singleAspect, false)}
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => (
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
            caption={caption([
              'Uploaded',
              sizeLabel(originalSizes[index] ?? null),
              formatBytes(entry.file.size),
            ])}
            onRemove={busy ? undefined : () => removeEntry(entry.id)}
          />
          <ArrowRight aria-hidden className="text-muted hidden size-5 shrink-0 sm:block" />
          {resultPane(index, ROW_PREVIEW_WIDTH, '4 / 3', true)}
        </div>
      ))}
    </div>
  );

  const pickerFormats = availableFormats ?? CONVERT_OUTPUT_FORMATS;
  const heading = preset
    ? `Convert ${IMAGE_LABEL[preset.from]} to ${IMAGE_LABEL[preset.to]}`
    : 'Convert image';

  const panel = (
    <ControlPanel>
      <p className="text-sm font-semibold">{heading}</p>

      <FileUpload rule={rule} accept={accept} multiple onFiles={addFiles} disabled={busy} />

      {!preset && (
        <Field
          label="Convert to"
          hint={availableFormats === null ? 'Checking what your browser can write' : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {pickerFormats.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setFormat(option);
                  clearResults();
                }}
                disabled={busy}
                aria-pressed={format === option}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  format === option
                    ? 'bg-brand border-brand text-on-brand'
                    : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {IMAGE_LABEL[option]}
              </button>
            ))}
          </div>
        </Field>
      )}

      {isLossy(format) && (
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
      )}

      {!supportsAlpha(format) && (
        <Field
          label="Background colour"
          htmlFor="convert-image-background"
          hint="Fills any transparency before saving, since this format has no transparency of its own."
        >
          <input
            id="convert-image-background"
            type="color"
            value={background}
            onChange={(event) => {
              setBackground(event.target.value);
              clearResults();
            }}
            disabled={busy}
            className="border-border bg-background h-11 w-14 cursor-pointer rounded-full border p-1"
          />
        </Field>
      )}

      {isSvgInput && (
        <div className="flex gap-3">
          <Field label="Width" htmlFor="convert-image-svg-width">
            <NumberField
              id="convert-image-svg-width"
              value={svgWidth}
              onChange={(value) => {
                setSvgWidth(value);
                clearResults();
              }}
              min={1}
              max={8000}
              disabled={busy}
              className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
            />
          </Field>
          <Field label="Height" htmlFor="convert-image-svg-height">
            <NumberField
              id="convert-image-svg-height"
              value={svgHeight}
              onChange={(value) => {
                setSvgHeight(value);
                clearResults();
              }}
              min={1}
              max={8000}
              disabled={busy}
              className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
            />
          </Field>
        </div>
      )}

      {format === 'ico' && (
        <Notice variant="info">
          An icon cannot be wider or taller than {ICO_MAX_SIZE} pixels, so a bigger image is scaled
          down to fit.
        </Notice>
      )}

      {format === 'tiff' && (
        <Notice variant="info">
          TIFF is written without compression, so the file is larger than the image you uploaded.
          Browsers cannot show a TIFF inline, so open it with View to see the result.
        </Notice>
      )}

      {format === 'gif' && (
        <Notice variant="info">
          GIF keeps at most 256 colours and only fully on or fully off transparency, so a photo
          shows visible banding.
        </Notice>
      )}

      {!targetSupported && (
        <Notice>{IMAGE_LABEL[format]} output is not supported in this browser.</Notice>
      )}

      {notice && <Notice>{notice}</Notice>}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <RefreshCw aria-hidden className="size-4" />
        )}
        {busy
          ? 'Converting'
          : entries.length > 1
            ? `Convert ${entries.length} images`
            : 'Convert image'}
      </Button>

      {results && (
        <ImageResultCard
          artifacts={results.map((item, index) => ({
            ...item,
            caption: sizeLabel(outputSize(index)) ?? undefined,
          }))}
          label="Converted image"
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
          if (!presetFrom) setSourceFormat(null);
        }}
        disabled={busy}
      >
        Choose different files
      </Button>
    </ControlPanel>
  );

  return <ImageWorkspaceLayout preview={preview} panel={panel} />;
}
