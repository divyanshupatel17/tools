'use client';

import { useEffect, useRef, useState } from 'react';
import { EyeOff, Loader2, X } from 'lucide-react';
import type { FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
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
import { ImageResultCard } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { Button } from '@/components/ui/button';
import {
  IMAGE_ACCEPT,
  IMAGE_LABEL,
  imageRule,
  isLossy,
  OUTPUT_FORMATS,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import type { BlurRegion, RegionEffect } from './processor';
import { renderRegions } from './processor';

const MAX_BYTES = 60 * 1024 * 1024;
const RULE: FileRule = imageRule({ max_files: 1, max_bytes: MAX_BYTES });
const MIN_BOX = 0.02;
const MAX_DISPLAY_WIDTH = 520;
const DEFAULT_STRENGTH = 5;
const MIN_STRENGTH = 1;
const MAX_STRENGTH = 20;
/** Arrow key nudge, as a fraction of the image. Shift multiplies it. */
const NUDGE = 0.005;

type HideMode = 'regions' | 'whole';

const MODE_OPTIONS: readonly { value: HideMode; label: string }[] = [
  { value: 'regions', label: 'Marked areas' },
  { value: 'whole', label: 'Whole image' },
];

const EFFECT_OPTIONS: readonly { value: RegionEffect; label: string }[] = [
  { value: 'blur', label: 'Blur' },
  { value: 'strong_blur', label: 'Strong' },
  { value: 'pixelate', label: 'Pixelate' },
];

interface RegionItem {
  id: string;
  region: BlurRegion;
}

type Drag =
  | { kind: 'create'; start: { x: number; y: number } }
  | { kind: 'move'; id: string; start: { x: number; y: number }; from: BlurRegion }
  | { kind: 'resize'; id: string; start: { x: number; y: number }; from: BlurRegion };

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `region-${nextId}`;
}

/** Keeps a region inside the image and never smaller than a grabbable box. */
function clampRegion(region: BlurRegion): BlurRegion {
  const width = Math.min(Math.max(MIN_BOX, region.width), 1);
  const height = Math.min(Math.max(MIN_BOX, region.height), 1);
  return {
    ...region,
    width,
    height,
    x: Math.min(Math.max(0, region.x), 1 - width),
    y: Math.min(Math.max(0, region.y), 1 - height),
  };
}

export function BlurPixelateWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [decodeCount, setDecodeCount] = useState(0);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<HideMode>('regions');
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [draftBox, setDraftBox] = useState<BlurRegion | null>(null);
  const [newEffect, setNewEffect] = useState<RegionEffect>('pixelate');
  const [newStrength, setNewStrength] = useState(DEFAULT_STRENGTH);
  const [wholeEffect, setWholeEffect] = useState<RegionEffect>('blur');
  const [wholeStrength, setWholeStrength] = useState(DEFAULT_STRENGTH);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<ProcessorArtifact | null>(null);

  const abort = useRef<AbortController | null>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      bitmap.current?.close();
    },
    [],
  );

  function resetState() {
    bitmap.current?.close();
    bitmap.current = null;
    setNaturalSize(null);
    setDisplaySize(null);
    setRegions([]);
    setDraftBox(null);
    setResult(null);
    setNotice(null);
    setLoadError(null);
    setMode('regions');
    setNewEffect('pixelate');
    setNewStrength(DEFAULT_STRENGTH);
    setWholeEffect('blur');
    setWholeStrength(DEFAULT_STRENGTH);
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    resetState();
    setFile(next);

    try {
      const [{ decodeImage }, { detectFormat }] = await Promise.all([
        import('@/lib/image/decode'),
        import('@/lib/image/image_formats'),
      ]);
      const decoded = await decodeImage(next);
      bitmap.current = decoded.bitmap;
      setNaturalSize({ width: decoded.width, height: decoded.height });

      const displayWidth = Math.min(decoded.width, MAX_DISPLAY_WIDTH);
      const displayHeight = Math.max(
        1,
        Math.round(decoded.height * (displayWidth / decoded.width)),
      );
      setDisplaySize({ width: displayWidth, height: displayHeight });
      setDecodeCount((count) => count + 1);

      const sourceFormat = await detectFormat(next);
      setFormat(
        sourceFormat && (OUTPUT_FORMATS as readonly string[]).includes(sourceFormat)
          ? (sourceFormat as OutputFormat)
          : 'png',
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'That image could not be read.');
      setFile(null);
    }
  }

  /** What the preview paints and what the processor is asked for: identical by construction. */
  function activeRegions(): BlurRegion[] {
    if (mode === 'whole') {
      return [{ x: 0, y: 0, width: 1, height: 1, effect: wholeEffect, strength: wholeStrength }];
    }
    return regions.map((item) => item.region);
  }

  // Re-paints the live preview with the real blur or pixelate effect, not a placeholder, on
  // every option, region and mode change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const size = displaySize;
    const source = bitmap.current;
    if (!canvas || !size || !source) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const painted = renderRegions(
      source,
      size.width,
      size.height,
      mode === 'whole'
        ? [{ x: 0, y: 0, width: 1, height: 1, effect: wholeEffect, strength: wholeStrength }]
        : regions.map((item) => item.region),
    );
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.drawImage(painted.canvas, 0, 0);
  }, [regions, displaySize, decodeCount, mode, wholeEffect, wholeStrength]);

  function fractionAt(clientX: number, clientY: number): { x: number; y: number } {
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  }

  function beginDrag(event: React.PointerEvent, next: Drag) {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = next;
    setResult(null);
  }

  function onSurfacePointerDown(event: React.PointerEvent) {
    if (!displaySize || busy) return;
    const point = fractionAt(event.clientX, event.clientY);
    beginDrag(event, { kind: 'create', start: point });
    setDraftBox({
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      effect: newEffect,
      strength: newStrength,
    });
  }

  function onSurfacePointerMove(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const point = fractionAt(event.clientX, event.clientY);

    if (current.kind === 'create') {
      setDraftBox({
        x: Math.min(current.start.x, point.x),
        y: Math.min(current.start.y, point.y),
        width: Math.abs(point.x - current.start.x),
        height: Math.abs(point.y - current.start.y),
        effect: newEffect,
        strength: newStrength,
      });
      return;
    }

    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    const from = current.from;
    const moved: BlurRegion =
      current.kind === 'move'
        ? { ...from, x: from.x + dx, y: from.y + dy }
        : { ...from, width: from.width + dx, height: from.height + dy };
    patchRegion(current.id, clampRegion(moved));
  }

  function onSurfacePointerUp() {
    const current = drag.current;
    drag.current = null;
    if (current?.kind !== 'create') return;
    if (draftBox && draftBox.width > MIN_BOX && draftBox.height > MIN_BOX) {
      setRegions((items) => [...items, { id: newId(), region: clampRegion(draftBox) }]);
      setResult(null);
    }
    setDraftBox(null);
  }

  function patchRegion(id: string, region: BlurRegion) {
    setRegions((items) => items.map((item) => (item.id === id ? { ...item, region } : item)));
  }

  function removeRegion(id: string) {
    setRegions((items) => items.filter((item) => item.id !== id));
    setResult(null);
  }

  function updateRegion(id: string, patch: Partial<BlurRegion>) {
    setRegions((items) =>
      items.map((item) =>
        item.id === id ? { ...item, region: { ...item.region, ...patch } } : item,
      ),
    );
    setResult(null);
  }

  function onRegionKeyDown(event: React.KeyboardEvent, item: RegionItem) {
    const step = event.shiftKey ? NUDGE * 5 : NUDGE;
    const region = item.region;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeRegion(item.id);
      return;
    }
    const resizing = event.altKey;
    let next: BlurRegion | null = null;
    if (event.key === 'ArrowLeft') {
      next = resizing
        ? { ...region, width: region.width - step }
        : { ...region, x: region.x - step };
    } else if (event.key === 'ArrowRight') {
      next = resizing
        ? { ...region, width: region.width + step }
        : { ...region, x: region.x + step };
    } else if (event.key === 'ArrowUp') {
      next = resizing
        ? { ...region, height: region.height - step }
        : { ...region, y: region.y - step };
    } else if (event.key === 'ArrowDown') {
      next = resizing
        ? { ...region, height: region.height + step }
        : { ...region, y: region.y + step };
    }
    if (!next) return;
    event.preventDefault();
    patchRegion(item.id, clampRegion(next));
    setResult(null);
  }

  const busy = progress !== null;
  const canRun =
    file !== null && naturalSize !== null && !busy && (mode === 'whole' || regions.length > 0);

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.blur-pixelate');
      const output = await processor(
        {
          files: [file],
          options: {
            regions: activeRegions(),
            format,
            quality: isLossy(format) ? quality / 100 : undefined,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult(artifact);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The image could not be processed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFile} />
        {loadError && <Notice>{loadError}</Notice>}
      </div>
    );
  }

  const sizeLabel = naturalSize ? `${naturalSize.width} x ${naturalSize.height} px` : '';
  const caption =
    mode === 'whole'
      ? `${sizeLabel} · the whole image is hidden`
      : regions.length === 0
        ? `${sizeLabel} · drag over the image to mark an area`
        : `${sizeLabel} · ${regions.length} area${regions.length === 1 ? '' : 's'} marked`;

  const preview = (
    <ImageCanvasPreview
      file={file}
      width={displaySize?.width ?? MAX_DISPLAY_WIDTH}
      aspectRatio={displaySize ? `${displaySize.width} / ${displaySize.height}` : '4 / 3'}
      caption={caption}
      render={() => (
        <>
          {displaySize ? (
            <canvas ref={canvasRef} className="pointer-events-none size-full" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            </div>
          )}

          {/* Only the marked areas mode is interactive. Whole image mode renders no overlay at
              all, so no drag handler can fire while it is selected. */}
          {mode === 'regions' && displaySize && (
            <div
              ref={overlayRef}
              onPointerDown={onSurfacePointerDown}
              onPointerMove={onSurfacePointerMove}
              onPointerUp={onSurfacePointerUp}
              onPointerCancel={onSurfacePointerUp}
              className="absolute inset-0 cursor-crosshair touch-none select-none"
            >
              {regions.map((item, index) => (
                <div
                  key={item.id}
                  role="group"
                  tabIndex={0}
                  aria-label={`Marked area ${index + 1}. Arrow keys move it, Alt with an arrow key resizes it, Delete removes it.`}
                  onKeyDown={(event) => onRegionKeyDown(event, item)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    beginDrag(event, {
                      kind: 'move',
                      id: item.id,
                      start: fractionAt(event.clientX, event.clientY),
                      from: item.region,
                    });
                  }}
                  className="border-brand focus-visible:ring-brand absolute cursor-move touch-none border-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{
                    left: `${item.region.x * 100}%`,
                    top: `${item.region.y * 100}%`,
                    width: `${item.region.width * 100}%`,
                    height: `${item.region.height * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeRegion(item.id)}
                    aria-label={`Remove marked area ${index + 1}`}
                    title="Remove this area"
                    className="bg-surface/90 border-border text-muted hover:text-foreground focus-visible:ring-brand absolute top-0 right-0 flex size-5 cursor-pointer items-center justify-center rounded-full border outline-none focus-visible:ring-2"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      beginDrag(event, {
                        kind: 'resize',
                        id: item.id,
                        start: fractionAt(event.clientX, event.clientY),
                        from: item.region,
                      });
                    }}
                    aria-label={`Resize marked area ${index + 1}`}
                    title="Drag to resize"
                    className="border-brand-strong bg-brand focus-visible:ring-brand absolute -right-1.5 -bottom-1.5 size-4 cursor-grab touch-none rounded-full border-2 outline-none focus-visible:ring-2 active:cursor-grabbing"
                  />
                </div>
              ))}

              {draftBox && (
                <div
                  className="border-brand pointer-events-none absolute border-2 border-dashed"
                  style={{
                    left: `${draftBox.x * 100}%`,
                    top: `${draftBox.y * 100}%`,
                    width: `${draftBox.width * 100}%`,
                    height: `${draftBox.height * 100}%`,
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
    />
  );

  const panel = (
    <ControlPanel>
      <Field label="What to hide">
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={(value) => {
            setMode(value);
            setDraftBox(null);
            setResult(null);
          }}
          disabled={busy}
        />
      </Field>

      {mode === 'whole' ? (
        <>
          <Field label="Effect">
            <SegmentedControl
              options={EFFECT_OPTIONS}
              value={wholeEffect}
              onChange={(value) => {
                setWholeEffect(value);
                setResult(null);
              }}
              disabled={busy}
            />
          </Field>
          <SliderField
            label="Strength"
            value={wholeStrength}
            onChange={(value) => {
              setWholeStrength(value);
              setResult(null);
            }}
            min={MIN_STRENGTH}
            max={MAX_STRENGTH}
            disabled={busy}
          />
        </>
      ) : (
        <>
          <Field label="New area effect">
            <SegmentedControl
              options={EFFECT_OPTIONS}
              value={newEffect}
              onChange={setNewEffect}
              disabled={busy}
            />
          </Field>
          <SliderField
            label="New area strength"
            value={newStrength}
            onChange={setNewStrength}
            min={MIN_STRENGTH}
            max={MAX_STRENGTH}
            disabled={busy}
          />

          {regions.length > 0 && (
            <div className="flex flex-col gap-3">
              {regions.map((item, index) => (
                <div
                  key={item.id}
                  className="border-border bg-cream flex flex-col gap-2 rounded-xl border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Area {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeRegion(item.id)}
                      aria-label={`Remove area ${index + 1}`}
                      className="focus-visible:ring-brand text-muted hover:text-foreground cursor-pointer rounded-full p-1 outline-none focus-visible:ring-2"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </div>
                  <SegmentedControl
                    options={EFFECT_OPTIONS}
                    value={item.region.effect}
                    onChange={(value) => updateRegion(item.id, { effect: value })}
                    disabled={busy}
                  />
                  <SliderField
                    label="Strength"
                    value={item.region.strength}
                    onChange={(value) => updateRegion(item.id, { strength: value })}
                    min={MIN_STRENGTH}
                    max={MAX_STRENGTH}
                    disabled={busy}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Field label="Format">
        <SegmentedControl
          options={OUTPUT_FORMATS.map((value) => ({ value, label: IMAGE_LABEL[value] }))}
          value={format}
          onChange={(value) => {
            setFormat(value);
            setResult(null);
          }}
          disabled={busy}
        />
      </Field>

      {isLossy(format) && (
        <SliderField
          label="Quality"
          value={quality}
          onChange={(value) => {
            setQuality(value);
            setResult(null);
          }}
          min={10}
          max={100}
          suffix="%"
          disabled={busy}
        />
      )}

      <Notice variant="info">
        Hidden pixels are genuinely reprocessed in the export, so the detail underneath cannot be
        recovered.
      </Notice>

      {notice && <Notice>{notice}</Notice>}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <EyeOff aria-hidden className="size-4" />
        )}
        {busy ? `Processing ${percent}%` : 'Blur and pixelate'}
      </Button>

      {result && (
        <ImageResultCard
          label="Result"
          artifacts={[{ artifact: result, caption: sizeLabel || undefined }]}
        />
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          resetState();
          setFile(null);
        }}
        disabled={busy}
      >
        Choose a different file
      </Button>
    </ControlPanel>
  );

  return <ImageWorkspaceLayout preview={preview} panel={panel} />;
}
