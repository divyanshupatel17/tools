'use client';

import { useEffect, useRef, useState } from 'react';
import { GripVertical, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/image/control_panel';
import { ImageCanvasPreview } from '@/components/image/image_canvas_preview';
import { ImageResultCard, type ImageResultItem } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { decodeImage, type DecodedImage } from '@/lib/image/decode';
import { IMAGE_ACCEPT, imageRule } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { DESIGN_WIDTH, renderMeme, type MemeTextBox } from './render';

const RULE = imageRule({ max_files: 1, max_bytes: 40 * 1024 * 1024 });
const PREVIEW_WIDTH = 420;

let idSeed = 0;
function nextId(prefix: string): string {
  idSeed += 1;
  return `${prefix}-${idSeed}`;
}

function defaultBoxes(): MemeTextBox[] {
  return [
    {
      id: nextId('box'),
      label: 'Top caption',
      text: 'TOP TEXT',
      x: 0.5,
      y: 0.1,
      font_size: 46,
      color: '#ffffff',
      outline: true,
      outline_color: '#000000',
      uppercase: true,
    },
    {
      id: nextId('box'),
      label: 'Bottom caption',
      text: 'BOTTOM TEXT',
      x: 0.5,
      y: 0.9,
      font_size: 46,
      color: '#ffffff',
      outline: true,
      outline_color: '#000000',
      uppercase: true,
    },
  ];
}

export function MemeGeneratorWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [boxes, setBoxes] = useState<MemeTextBox[]>(defaultBoxes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<ImageResultItem | null>(null);

  const abort = useRef<AbortController | null>(null);
  const decodedRef = useRef<DecodedImage | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    decodeImage(file)
      .then((next) => {
        if (cancelled) {
          next.bitmap.close();
          return;
        }
        decodedRef.current?.bitmap.close();
        decodedRef.current = next;
        setDecoded(next);
      })
      .catch(() => {
        if (!cancelled) setDecodeError('That image could not be read.');
      });
    // Cleared on the way out so the effect body never sets state synchronously. Running on
    // cleanup also covers the file being removed, which no longer needs its own branch.
    return () => {
      cancelled = true;
      decodedRef.current?.bitmap.close();
      decodedRef.current = null;
      setDecoded(null);
      setDecodeError(null);
    };
  }, [file]);

  useEffect(
    () => () => {
      abort.current?.abort();
      decodedRef.current?.bitmap.close();
    },
    [],
  );

  // The live preview: the meme itself, re-painted on every option or drag change, sharing
  // renderMeme with the processor so the download matches exactly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded) return;
    const ratio = decoded.height / decoded.width;
    const width = Math.min(DESIGN_WIDTH, decoded.width);
    const height = Math.max(1, Math.round(width * ratio));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(decoded.bitmap, 0, 0, width, height);
    renderMeme(ctx, width, height, boxes);
  }, [decoded, boxes]);

  function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setBoxes(defaultBoxes());
    setSelectedId(null);
    setResult(null);
    setNotice(null);
  }

  function updateSelected(patch: Partial<MemeTextBox>) {
    if (!selectedId) return;
    setBoxes((prev) => prev.map((box) => (box.id === selectedId ? { ...box, ...patch } : box)));
    setResult(null);
  }

  function addBox() {
    const box: MemeTextBox = {
      id: nextId('box'),
      label: 'Text box',
      text: 'YOUR TEXT HERE',
      x: 0.5,
      y: 0.5,
      font_size: 34,
      color: '#ffffff',
      outline: true,
      outline_color: '#000000',
      uppercase: true,
    };
    setBoxes((prev) => [...prev, box]);
    setSelectedId(box.id);
    setResult(null);
  }

  function removeBox(id: string) {
    setBoxes((prev) => prev.filter((box) => box.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    setResult(null);
  }

  function positionFromPointer(clientX: number, clientY: number): { x: number; y: number } | null {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  const busy = progress !== null;
  const canRun = file !== null && decoded !== null && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.meme-generator');
      const output = await processor(
        { files: [file], options: { boxes } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({
          artifact,
          caption: decoded ? `${decoded.width} x ${decoded.height} px` : undefined,
        });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The meme could not be generated.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const selected = boxes.find((box) => box.id === selectedId) ?? null;

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFile} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const caption = decodeError
    ? decodeError
    : decoded
      ? `Live preview · ${decoded.width} x ${decoded.height} px · drag a handle to move its text`
      : 'Reading image';

  const preview = (
    <ImageCanvasPreview
      file={file}
      width={PREVIEW_WIDTH}
      aspectRatio={decoded ? `${decoded.width} / ${decoded.height}` : '4 / 3'}
      caption={caption}
      render={
        decoded
          ? () => (
              <div
                ref={frameRef}
                className="relative size-full select-none"
                style={{ touchAction: 'none' }}
              >
                <canvas ref={canvasRef} className="size-full" />
                {boxes.map((box) => (
                  <button
                    key={box.id}
                    type="button"
                    aria-label={`Move ${box.label}`}
                    title={`Move ${box.label}`}
                    onClick={() => setSelectedId(box.id)}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setSelectedId(box.id);
                      setDraggingId(box.id);
                    }}
                    onPointerMove={(event) => {
                      if (draggingId !== box.id) return;
                      const next = positionFromPointer(event.clientX, event.clientY);
                      if (next) {
                        setBoxes((prev) =>
                          prev.map((other) =>
                            other.id === box.id ? { ...other, ...next } : other,
                          ),
                        );
                        setResult(null);
                      }
                    }}
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                      setDraggingId(null);
                    }}
                    className={`absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border shadow-sm active:cursor-grabbing ${
                      selectedId === box.id
                        ? 'bg-brand border-brand'
                        : 'bg-surface/90 border-border text-muted hover:text-foreground'
                    }`}
                    style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%` }}
                  >
                    <GripVertical aria-hidden className="size-3.5" />
                  </button>
                ))}
              </div>
            )
          : undefined
      }
    />
  );

  const panel = (
    <ControlPanel>
      <div className="text-sm">
        <span className="font-semibold">Text boxes</span>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {boxes.map((box) => (
            <li key={box.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedId(box.id)}
                disabled={busy}
                aria-pressed={selectedId === box.id}
                className={`min-w-0 flex-1 truncate rounded-full border px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                  selectedId === box.id
                    ? 'bg-brand border-brand text-on-brand'
                    : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {box.label} · {box.text.trim() || 'Empty'}
              </button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${box.label}`}
                onClick={() => removeBox(box.id)}
                disabled={busy}
                className="px-2"
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          onClick={addBox}
          disabled={busy}
          className="mt-2 w-full"
        >
          <Plus aria-hidden className="size-4" />
          Add text box
        </Button>
      </div>

      {selected ? (
        <>
          <Field label="Text">
            <textarea
              value={selected.text}
              onChange={(event) => updateSelected({ text: event.target.value })}
              disabled={busy}
              rows={2}
              className="border-border bg-background w-full resize-none rounded-2xl border px-4 py-2.5 outline-none"
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Font size">
              <NumberField
                value={selected.font_size}
                onChange={(value) => updateSelected({ font_size: value })}
                min={10}
                max={120}
                disabled={busy}
                aria-label="Font size in pixels"
                className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={selected.color}
                onChange={(event) => updateSelected({ color: event.target.value })}
                disabled={busy}
                className="border-border bg-background h-11 w-14 cursor-pointer rounded-full border p-1"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={selected.outline}
              onChange={(event) => updateSelected({ outline: event.target.checked })}
              disabled={busy}
              className="accent-brand size-4"
            />
            <span className="font-semibold">Outline</span>
          </label>

          {selected.outline && (
            <Field label="Outline color">
              <input
                type="color"
                value={selected.outline_color}
                onChange={(event) => updateSelected({ outline_color: event.target.value })}
                disabled={busy}
                className="border-border bg-background h-11 w-14 cursor-pointer rounded-full border p-1"
              />
            </Field>
          )}

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={selected.uppercase}
              onChange={(event) => updateSelected({ uppercase: event.target.checked })}
              disabled={busy}
              className="accent-brand size-4"
            />
            <span className="font-semibold">Uppercase</span>
          </label>
        </>
      ) : (
        <p className="text-muted text-xs">Pick a text box to edit its wording and style.</p>
      )}

      {notice && <Notice>{notice}</Notice>}
      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Sparkles aria-hidden className="size-4" />
        )}
        {busy ? 'Generating' : 'Generate meme'}
      </Button>

      {result && <ImageResultCard artifacts={[result]} label="Meme" />}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setFile(null);
          setBoxes(defaultBoxes());
          setSelectedId(null);
          setResult(null);
          setNotice(null);
        }}
        disabled={busy}
      >
        Choose a different file
      </Button>
    </ControlPanel>
  );

  return <ImageWorkspaceLayout preview={preview} panel={panel} />;
}
