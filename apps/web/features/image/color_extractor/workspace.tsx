'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, Copy, Download, Loader2, Maximize2, Pipette } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { ControlPanel, Notice, ProgressBar, SliderField } from '@/components/image/control_panel';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { decodeImage } from '@/lib/image/decode';
import { IMAGE_ACCEPT, imageRule } from '@/lib/image/image_formats';
import { describeColor, extractPalette, type SampledColor } from '@/lib/image/palette';
import { loadProcessor } from '@/lib/processing/processor_registry';

const RULE = imageRule({ max_files: 1, max_bytes: 40 * 1024 * 1024 });
/** The sampling canvas is capped so a 50 megapixel photo does not sit in memory at full size.
 *  Anything at or under this keeps its exact pixels. */
const MAX_CANVAS_DIMENSION = 2400;
const PREVIEW_WIDTH = 420;

function rgbString(color: SampledColor): string {
  return `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`;
}

function hslString(color: SampledColor): string {
  return `hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%)`;
}

interface ColorChipProps {
  chipKey: string;
  value: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}

/** A single copyable value (hex, rgb, or hsl). Reads "Copied" back for a moment after a copy. */
function ColorChip({ chipKey, value, copiedKey, onCopy }: ColorChipProps) {
  const copied = copiedKey === chipKey;
  return (
    <button
      type="button"
      onClick={() => onCopy(chipKey, value)}
      title={`Copy ${value}`}
      className="border-border bg-surface hover:bg-surface-muted focus-visible:ring-brand flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1 text-left text-xs outline-none focus-visible:ring-2"
    >
      <span className="truncate font-mono">{copied ? 'Copied' : value}</span>
      {copied ? (
        <Check aria-hidden className="text-brand size-3.5 shrink-0" />
      ) : (
        <Copy aria-hidden className="text-muted size-3.5 shrink-0" />
      )}
      <span className="sr-only">{copied ? `Copied ${value}` : `Copy ${value}`}</span>
    </button>
  );
}

interface SwatchProps {
  color: SampledColor;
  keyPrefix: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}

/** One extracted colour: the colour itself, its share of the picture, and its three values. */
function Swatch({ color, keyPrefix, copiedKey, onCopy }: SwatchProps) {
  return (
    <div className="border-border bg-surface rounded-lg border p-2">
      <div
        aria-hidden
        className="border-border mb-1.5 h-10 w-full rounded-md border"
        style={{ backgroundColor: color.hex }}
      />
      {color.share !== undefined && (
        <p className="text-muted mb-1.5 text-[10px]">
          {Math.round(color.share * 100)}% of the pixels
        </p>
      )}
      <div className="flex flex-col gap-1">
        <ColorChip
          chipKey={`${keyPrefix}-hex`}
          value={color.hex}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
        <ColorChip
          chipKey={`${keyPrefix}-rgb`}
          value={rgbString(color)}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
        <ColorChip
          chipKey={`${keyPrefix}-hsl`}
          value={hslString(color)}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}

/**
 * Extracts the dominant colours from an uploaded image and lets a user sample any exact pixel,
 * with every hex, RGB and HSL value individually copyable. The palette itself is the result: it
 * appears the moment an image loads and follows the slider live. The export button only writes a
 * downloadable form of the same colours, so nothing on screen depends on running it.
 */
export function ColorExtractorWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [count, setCount] = useState(6);
  const [pickedColor, setPickedColor] = useState<SampledColor | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [exportArtifacts, setExportArtifacts] = useState<ProcessorArtifact[] | null>(null);
  const [viewingSource, setViewingSource] = useState(false);

  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      bitmapRef.current?.close();
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    },
    [],
  );

  function reset() {
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setBitmap(null);
    setFile(null);
    setNaturalSize(null);
    setCanvasSize(null);
    setPickedColor(null);
    setCursor(null);
    setExportArtifacts(null);
    setNotice(null);
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setBitmap(null);
    setFile(next);
    setNotice(null);
    setExportArtifacts(null);
    setPickedColor(null);
    setCursor(null);
    setLoadingImage(true);

    try {
      // decodeImage covers every format the tool accepts, including HEIC and TIFF, which a
      // plain <img> cannot paint at all.
      const decoded = await decodeImage(next);
      bitmapRef.current = decoded.bitmap;
      const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(decoded.width, decoded.height));
      setNaturalSize({ width: decoded.width, height: decoded.height });
      setCanvasSize({
        width: Math.max(1, Math.round(decoded.width * scale)),
        height: Math.max(1, Math.round(decoded.height * scale)),
      });
      setBitmap(decoded.bitmap);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That image could not be read.');
    } finally {
      setLoadingImage(false);
    }
  }

  // Paints the sampling canvas, then samples its middle pixel so the eyedropper reads a real
  // colour straight away rather than sitting empty until the first click.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || !canvasSize) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.drawImage(bitmap, 0, 0, canvasSize.width, canvasSize.height);
    sampleAt(Math.round(canvasSize.width / 2), Math.round(canvasSize.height / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, canvasSize]);

  // The palette follows both the image and the slider, with no run button in between. It is
  // derived, not stored: extractPalette quantises a 100px copy, so recomputing is cheap.
  const palette = useMemo(() => (bitmap ? extractPalette(bitmap, count) : []), [bitmap, count]);

  function sampleAt(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize) return;
    const clampedX = Math.min(canvasSize.width - 1, Math.max(0, Math.round(x)));
    const clampedY = Math.min(canvasSize.height - 1, Math.max(0, Math.round(y)));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const [r, g, b] = ctx.getImageData(clampedX, clampedY, 1, 1).data;
    if (r === undefined || g === undefined || b === undefined) return;
    setCursor({ x: clampedX, y: clampedY });
    setPickedColor(describeColor(r, g, b));
  }

  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * canvasSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvasSize.height;
    sampleAt(x, y);
  }

  function handleCanvasKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!canvasSize || !cursor) return;
    const step = Math.max(1, Math.round(canvasSize.width / 100));

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      sampleAt(cursor.x - step, cursor.y);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      sampleAt(cursor.x + step, cursor.y);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      sampleAt(cursor.x, cursor.y - step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      sampleAt(cursor.x, cursor.y + step);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      sampleAt(cursor.x, cursor.y);
    }
  }

  function copy(key: string, value: string) {
    const clipboardFailed = () =>
      setNotice('This browser blocked the clipboard. Select the value and copy it by hand.');
    try {
      navigator.clipboard.writeText(value).then(() => {
        setCopiedKey(key);
        if (copyTimeout.current) clearTimeout(copyTimeout.current);
        copyTimeout.current = setTimeout(() => setCopiedKey(null), 1500);
      }, clipboardFailed);
    } catch {
      clipboardFailed();
    }
  }

  const busy = progress !== null;

  async function exportPalette() {
    if (!file || busy) return;
    setNotice(null);
    setExportArtifacts(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.color-extractor');
      const output = await processor(
        { files: [file], options: { count } },
        { signal: controller.signal, on_progress: setProgress },
      );
      setExportArtifacts(output.artifacts);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The palette could not be saved.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFile} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  return (
    <>
      <ImageWorkspaceLayout
        preview={
          <div className="flex flex-col items-center">
            <p className="text-muted mb-3 self-start text-sm">
              <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
              {' · '}
              {formatBytes(file.size)}
            </p>

            <div
              className="border-border bg-cream relative overflow-hidden rounded-xl border shadow-sm"
              style={{
                width: PREVIEW_WIDTH,
                maxWidth: '100%',
                aspectRatio: canvasSize ? `${canvasSize.width} / ${canvasSize.height}` : '4 / 3',
              }}
            >
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="button"
                aria-label="Image color picker. Click a pixel, or use the arrow keys to move and press Enter to sample it."
                onClick={handleCanvasClick}
                onKeyDown={handleCanvasKeyDown}
                className="focus-visible:ring-brand size-full cursor-crosshair object-contain outline-none focus-visible:ring-2"
              />
              {canvasSize && cursor && (
                <div
                  aria-hidden
                  className="border-brand pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                  style={{
                    left: `${(cursor.x / canvasSize.width) * 100}%`,
                    top: `${(cursor.y / canvasSize.height) * 100}%`,
                  }}
                />
              )}
              {bitmap && (
                <button
                  type="button"
                  onClick={() => setViewingSource(true)}
                  aria-label={`View ${safeFileName(file.name)}`}
                  title="View the full image"
                  className="bg-surface/90 border-border text-muted hover:text-foreground focus-visible:ring-brand absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm outline-none focus-visible:ring-2"
                >
                  <Maximize2 aria-hidden className="size-3.5" />
                </button>
              )}
              {loadingImage && (
                <div className="bg-surface/70 absolute inset-0 flex items-center justify-center gap-2 text-sm">
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Reading the image
                </div>
              )}
            </div>
            <p className="text-muted mt-2 text-center text-xs">
              {naturalSize ? `${naturalSize.width} x ${naturalSize.height} px · ` : ''}
              click or use the arrow keys and Enter to sample any pixel
            </p>
            {pickedColor && cursor && (
              <p className="text-muted mt-1 text-center text-xs">
                Sampling pixel {cursor.x}, {cursor.y} · {pickedColor.hex}
              </p>
            )}
          </div>
        }
        panel={
          <ControlPanel>
            <SliderField
              label="Colors"
              value={count}
              onChange={(value) => {
                setCount(value);
                setExportArtifacts(null);
              }}
              min={2}
              max={20}
              id="color-count"
              hint="Values update as you drag. Nothing needs to be run."
            />

            {notice && <Notice>{notice}</Notice>}

            <p aria-live="polite" className="sr-only">
              {copiedKey ? 'Copied to the clipboard' : ''}
            </p>

            {palette.length > 0 && (
              <section aria-label="Dominant colors" className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Dominant colors</span>
                <div className="grid grid-cols-2 gap-2">
                  {palette.map((color, index) => (
                    <Swatch
                      key={`${color.hex}-${index}`}
                      color={color}
                      keyPrefix={`palette-${index}`}
                      copiedKey={copiedKey}
                      onCopy={copy}
                    />
                  ))}
                </div>
              </section>
            )}

            {pickedColor && (
              <section
                aria-label="Picked pixel"
                className="border-brand bg-cream flex flex-col gap-2 rounded-xl border p-3"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Pipette aria-hidden className="size-3.5" />
                  Picked pixel
                </span>
                <div
                  aria-hidden
                  className="border-border h-10 w-full rounded-md border"
                  style={{ backgroundColor: pickedColor.hex }}
                />
                <div className="flex flex-col gap-1">
                  <ColorChip
                    chipKey="picked-hex"
                    value={pickedColor.hex}
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                  <ColorChip
                    chipKey="picked-rgb"
                    value={rgbString(pickedColor)}
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                  <ColorChip
                    chipKey="picked-hsl"
                    value={hslString(pickedColor)}
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                </div>
              </section>
            )}

            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <Button
              onClick={exportPalette}
              disabled={busy || palette.length === 0}
              className="h-12 w-full text-base"
            >
              {busy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Download aria-hidden className="size-4" />
              )}
              {busy ? `Saving the palette ${percent}%` : 'Save the palette as files'}
            </Button>

            {exportArtifacts && exportArtifacts.length > 0 && (
              <section
                aria-label="Saved palette"
                className="border-brand bg-cream flex flex-col gap-2 rounded-xl border p-3"
              >
                <span className="text-sm font-bold">Palette files</span>
                <span className="text-muted text-xs">
                  The same {palette.length} colors, as CSS variables and as a plain list.
                </span>
                {exportArtifacts.map((artifact) => (
                  <Button
                    key={artifact.file_name}
                    variant="secondary"
                    className="w-full justify-between"
                    onClick={() => downloadBlob(artifact.blob, artifact.file_name)}
                  >
                    <span className="truncate">{artifact.file_name}</span>
                    <span className="text-muted shrink-0 text-xs">
                      {formatBytes(artifact.blob.size)}
                    </span>
                    <Download aria-hidden className="size-4 shrink-0" />
                  </Button>
                ))}
              </section>
            )}

            <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
              Choose a different file
            </Button>
          </ControlPanel>
        }
      />
      {viewingSource && (
        <PageDetailModal file={file} pageIndex={0} onClose={() => setViewingSource(false)} />
      )}
    </>
  );
}
