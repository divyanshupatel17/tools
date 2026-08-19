'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { ProcessorProgress } from '@tools/tool_engine';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
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
import { FileUpload } from '@/components/file_upload/file_upload';
import { decodeImage } from '@/lib/image/decode';
import {
  IMAGE_ACCEPT,
  IMAGE_LABEL,
  OUTPUT_FORMATS,
  imageRule,
  isLossy,
  type OutputFormat,
} from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  ASPECT_OPTIONS,
  BACKGROUND_PRESETS,
  DEFAULT_ASPECT_ID,
  DEFAULT_DIRECTION_ID,
  EXPORT_LONG_EDGE,
  GRADIENT_DIRECTIONS,
  computeCanvasSize,
  type BackgroundType,
} from './background_options';
import { drawScreenshotComposition, titleBarHeightFor } from './draw_screenshot';

const RULE = imageRule({ max_files: 1, max_bytes: 40 * 1024 * 1024 });
const PREVIEW_LONG_EDGE = 640;
const PREVIEW_FRAME_WIDTH = 480;

export function ScreenshotBeautifierWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);

  const [aspectId, setAspectId] = useState(DEFAULT_ASPECT_ID);
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('solid');
  const [backgroundColor, setBackgroundColor] = useState('#eef1f5');
  const [backgroundColor2, setBackgroundColor2] = useState('#3a8dff');
  const [direction, setDirection] = useState(DEFAULT_DIRECTION_ID);
  const [padding, setPadding] = useState(120);
  const [cornerRadius, setCornerRadius] = useState(24);
  const [shadowStrength, setShadowStrength] = useState(40);
  const [frame, setFrame] = useState(true);
  const [frameColor, setFrameColor] = useState('#1f2126');
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<ImageResultItem[]>([]);

  const abort = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      bitmapRef.current?.close();
    },
    [],
  );

  const naturalSize = bitmap
    ? { width: bitmap.width, height: bitmap.height }
    : { width: 1, height: 1 };
  const size = computeCanvasSize(aspectId, naturalSize, PREVIEW_LONG_EDGE);
  const exportSize = computeCanvasSize(aspectId, naturalSize, EXPORT_LONG_EDGE);

  // The whole composition is tuned by eye, so every option repaints the left pane immediately.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scale = size.width / exportSize.width;
    drawScreenshotComposition(ctx, size.width, size.height, bitmap, {
      backgroundType,
      backgroundColor,
      backgroundColor2,
      direction,
      padding,
      cornerRadius,
      shadowStrength,
      frame,
      frameColor,
      dotColor: '#ffffff',
      titleBarHeight: titleBarHeightFor(exportSize.height) * scale,
      // Options are set in exported pixels; the preview canvas is smaller, so it scales them.
      scale,
    });
  }, [
    bitmap,
    size.width,
    size.height,
    exportSize.width,
    exportSize.height,
    backgroundType,
    backgroundColor,
    backgroundColor2,
    direction,
    padding,
    cornerRadius,
    shadowStrength,
    frame,
    frameColor,
  ]);

  function clearResult() {
    setResult([]);
  }

  async function addFiles(files: File[]) {
    setNotice(null);
    const picked = files[0];
    if (!picked) return;

    try {
      const decoded = await decodeImage(picked);
      bitmapRef.current?.close();
      bitmapRef.current = decoded.bitmap;
      setFile(picked);
      setBitmap(decoded.bitmap);
      clearResult();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'That file could not be read as an image.',
      );
    }
  }

  function resetFile() {
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setFile(null);
    setBitmap(null);
    clearResult();
    setNotice(null);
  }

  const busy = progress !== null;
  const canRun = bitmap !== null && file !== null && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  async function run() {
    if (!canRun || !file) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.screenshot-beautifier');
      const output = await processor(
        {
          files: [file],
          options: {
            aspect_ratio: aspectId,
            background_type: backgroundType,
            background_color: backgroundColor,
            background_color2: backgroundColor2,
            direction,
            padding,
            corner_radius: cornerRadius,
            shadow_strength: shadowStrength,
            frame,
            frame_color: frameColor,
            dot_color: '#ffffff',
            format,
            quality,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult([{ artifact, caption: `${exportSize.width} x ${exportSize.height} px` }]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The screenshot could not be beautified.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFiles} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const preview = (
    <ImageCanvasPreview
      file={file}
      width={PREVIEW_FRAME_WIDTH}
      aspectRatio={`${size.width} / ${size.height}`}
      caption={`Live preview · exports at ${exportSize.width} x ${exportSize.height} px`}
      render={() => <canvas ref={canvasRef} className="size-full" />}
    />
  );

  const panel = (
    <ControlPanel>
      <Field label="Background style">
        <SegmentedControl
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
          value={backgroundType}
          onChange={(value) => {
            setBackgroundType(value);
            clearResult();
          }}
          disabled={busy}
        />
      </Field>

      <Field label="Preset">
        <div className="flex flex-wrap gap-2">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setBackgroundType(preset.type);
                setBackgroundColor(preset.color);
                if (preset.color2) setBackgroundColor2(preset.color2);
                if (preset.direction) setDirection(preset.direction);
                clearResult();
              }}
              disabled={busy}
              title={preset.label}
              aria-label={preset.label}
              className="border-border focus-visible:ring-brand size-9 cursor-pointer rounded-full border outline-none focus-visible:ring-2"
              style={{
                background:
                  preset.type === 'gradient'
                    ? `linear-gradient(135deg, ${preset.color}, ${preset.color2})`
                    : preset.color,
              }}
            />
          ))}
        </div>
      </Field>

      <div className="flex gap-3">
        <label className="flex-1 text-sm">
          <span className="font-semibold">Colour</span>
          <input
            type="color"
            value={backgroundColor}
            onChange={(event) => {
              setBackgroundColor(event.target.value);
              clearResult();
            }}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full cursor-pointer rounded-full border p-1"
          />
        </label>
        {backgroundType === 'gradient' && (
          <label className="flex-1 text-sm">
            <span className="font-semibold">Second colour</span>
            <input
              type="color"
              value={backgroundColor2}
              onChange={(event) => {
                setBackgroundColor2(event.target.value);
                clearResult();
              }}
              disabled={busy}
              className="border-border bg-background mt-1.5 h-11 w-full cursor-pointer rounded-full border p-1"
            />
          </label>
        )}
      </div>

      {backgroundType === 'gradient' && (
        <Field label="Direction">
          <SegmentedControl
            options={GRADIENT_DIRECTIONS.map((item) => ({ value: item.id, label: item.label }))}
            value={direction}
            onChange={(value) => {
              setDirection(value);
              clearResult();
            }}
            disabled={busy}
          />
        </Field>
      )}

      {/* Five shapes do not fit one segmented row in a 340px panel, so they wrap as pills. */}
      <Field label="Shape">
        <div className="flex flex-wrap gap-2">
          {ASPECT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setAspectId(option.id);
                clearResult();
              }}
              disabled={busy}
              aria-pressed={aspectId === option.id}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                aspectId === option.id
                  ? 'bg-brand border-brand text-on-brand'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Padding" hint="Space around the screenshot, in exported pixels.">
        <NumberField
          value={padding}
          onChange={(value) => {
            setPadding(value);
            clearResult();
          }}
          min={0}
          max={400}
          disabled={busy}
          aria-label="Padding in pixels"
          className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
        />
      </Field>

      <SliderField
        label="Corner rounding"
        value={cornerRadius}
        onChange={(value) => {
          setCornerRadius(value);
          clearResult();
        }}
        min={0}
        max={80}
        disabled={busy}
      />

      <SliderField
        label="Shadow"
        value={shadowStrength}
        onChange={(value) => {
          setShadowStrength(value);
          clearResult();
        }}
        min={0}
        max={100}
        suffix="%"
        disabled={busy}
      />

      <Field label="Window frame" hint="Adds a title bar with three dots above the screenshot.">
        <SegmentedControl
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={frame ? 'on' : 'off'}
          onChange={(value) => {
            setFrame(value === 'on');
            clearResult();
          }}
          disabled={busy}
        />
      </Field>

      {frame && (
        <label className="text-sm">
          <span className="font-semibold">Frame colour</span>
          <input
            type="color"
            value={frameColor}
            onChange={(event) => {
              setFrameColor(event.target.value);
              clearResult();
            }}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-14 cursor-pointer rounded-full border p-1"
          />
        </label>
      )}

      <Field label="Format">
        <SegmentedControl
          options={OUTPUT_FORMATS.map((value) => ({ value, label: IMAGE_LABEL[value] }))}
          value={format}
          onChange={(value) => {
            setFormat(value);
            clearResult();
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
            clearResult();
          }}
          min={10}
          max={100}
          suffix="%"
          disabled={busy}
        />
      )}

      {notice && <Notice>{notice}</Notice>}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Sparkles aria-hidden className="size-4" />
        )}
        {busy ? `Beautifying ${percent}%` : 'Beautify the screenshot'}
      </Button>

      <ImageResultCard artifacts={result} label="Result" />

      <Button size="sm" variant="ghost" onClick={resetFile} disabled={busy}>
        Choose a different file
      </Button>
    </ControlPanel>
  );

  return <ImageWorkspaceLayout preview={preview} panel={panel} />;
}
