'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Download, FileText, Loader2, ScanText } from 'lucide-react';
import { formatBytes, replaceExtension, safeFileName } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/image/control_panel';
import { ImageCanvasPreview } from '@/components/image/image_canvas_preview';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { createPreviewUrl, readImageSize } from '@/lib/image/decode';
import { IMAGE_ACCEPT, imageRule } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { OCR_LANGUAGES, type ImageToTextOutput } from './processor';

const RULE = imageRule({ max_files: 1, max_bytes: 40 * 1024 * 1024 });
/** Below this Tesseract is guessing more than reading, and the user should be told. */
const LOW_CONFIDENCE = 60;

interface Result {
  blob: Blob;
  fileName: string;
  text: string;
  confidence?: number;
}

/** Extracts text from a photo or a scan with tesseract.js, which runs the recogniser in its own
 *  Web Worker, then offers the result as plain text or Markdown. */
export function ImageToTextWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [language, setLanguage] = useState('eng');
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const languageId = useId();
  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const previewRequest = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      // Aborting terminates the tesseract worker inside the processor.
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  function reset() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    previewRequest.current += 1;
    setFile(null);
    setPreviewSrc(null);
    setDimensions(null);
    setResult(null);
    setNotice(null);
    setCopied(false);
  }

  function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    const requestId = (previewRequest.current += 1);

    setFile(next);
    setPreviewSrc(null);
    setDimensions(null);
    setResult(null);
    setNotice(null);
    setCopied(false);

    // HEIC and TIFF cannot be painted by a plain <img>, so createPreviewUrl rasterises those
    // through decodeImage() first.
    createPreviewUrl(next)
      .then((url) => {
        if (requestId !== previewRequest.current) {
          URL.revokeObjectURL(url); // A newer file replaced this one meanwhile.
          return;
        }
        previewUrl.current = url;
        setPreviewSrc(url);
      })
      .catch(() => {
        if (requestId === previewRequest.current) {
          setNotice('This picture could not be shown. Scanning it may still work.');
        }
      });

    readImageSize(next)
      .then((size) => {
        if (requestId === previewRequest.current) setDimensions(size);
      })
      .catch(() => {
        if (requestId === previewRequest.current) setDimensions(null);
      });
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setCopied(false);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.image-to-text');
      const output = (await processor(
        { files: [file], options: { language } },
        { signal: controller.signal, on_progress: setProgress },
      )) as ImageToTextOutput;

      const artifact = output.artifacts[0];
      if (!artifact) {
        setNotice('No text could be read from this picture.');
        return;
      }
      setResult({
        blob: artifact.blob,
        fileName: artifact.file_name,
        text: await artifact.blob.text(),
        confidence: output.confidence,
      });
    } catch (error) {
      if (controller.signal.aborted) setNotice('Scanning was stopped.');
      else setNotice(error instanceof Error ? error.message : 'That picture could not be scanned.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFile} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const foundText = result !== null && result.text.trim().length > 0;
  const lowConfidence =
    foundText && result.confidence !== undefined && result.confidence < LOW_CONFIDENCE;

  return (
    <ImageWorkspaceLayout
      preview={
        <ImageCanvasPreview
          file={file}
          src={previewSrc}
          aspectRatio={dimensions ? `${dimensions.width} / ${dimensions.height}` : '4 / 3'}
          caption={
            dimensions
              ? `${dimensions.width} x ${dimensions.height} pixels · ${formatBytes(file.size)}`
              : formatBytes(file.size)
          }
        />
      }
      panel={
        <ControlPanel>
          <Field
            label="Language"
            htmlFor={languageId}
            hint="The language pack downloads once, the first time you pick it."
          >
            <select
              id={languageId}
              value={language}
              disabled={busy}
              onChange={(event) => {
                setLanguage(event.target.value);
                setResult(null);
              }}
              className="border-border bg-background text-foreground h-11 w-full rounded-full border px-4 text-sm outline-none"
            >
              {OCR_LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Notice variant="info">
            Photos, handwriting and low resolution scans lose the most accuracy.
          </Notice>

          {notice && <Notice>{notice}</Notice>}

          {busy && (
            <>
              <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />
              <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
                Stop scanning
              </Button>
            </>
          )}

          <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <ScanText aria-hidden className="size-4" />
            )}
            {busy ? `Reading text ${percent}%` : 'Extract text'}
          </Button>

          {result && (
            <section
              aria-label="Extracted text"
              className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{safeFileName(file.name)}</span>
                <span className="text-muted block text-xs">
                  {foundText
                    ? `${result.text.trim().length.toLocaleString()} characters · ${formatBytes(
                        result.blob.size,
                      )}`
                    : 'No text found'}
                  {foundText && result.confidence !== undefined
                    ? ` · ${Math.round(result.confidence)}% confidence`
                    : ''}
                </span>
              </span>

              {lowConfidence && (
                <Notice>Confidence is low, so read this through before you use it.</Notice>
              )}

              {foundText ? (
                <>
                  <pre className="bg-surface border-border max-h-64 overflow-auto rounded-lg border p-2.5 font-mono text-xs whitespace-pre-wrap">
                    {result.text}
                  </pre>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={copy}>
                      {copied ? (
                        <Check aria-hidden className="size-4" />
                      ) : (
                        <Copy aria-hidden className="size-4" />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => downloadBlob(result.blob, result.fileName)}
                    >
                      <Download aria-hidden className="size-4" />
                      Text file
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      downloadBlob(
                        new Blob([result.text], { type: 'text/markdown' }),
                        replaceExtension(file.name, 'md'),
                      )
                    }
                  >
                    <FileText aria-hidden className="size-4" />
                    Markdown file
                  </Button>
                </>
              ) : (
                <p className="text-muted text-xs">
                  Nothing readable was found. Try a sharper picture, or check the language.
                </p>
              )}
            </section>
          )}

          <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
            Choose a different file
          </Button>
        </ControlPanel>
      }
    />
  );
}
