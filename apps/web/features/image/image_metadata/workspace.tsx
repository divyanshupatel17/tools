'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Eraser, Loader2, MapPin } from 'lucide-react';
import { formatBytes, replaceExtension, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import {
  ControlPanel,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
} from '@/components/image/control_panel';
import { ImageCanvasPreview } from '@/components/image/image_canvas_preview';
import { ImageResultCard } from '@/components/image/image_result_card';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { createPreviewUrl } from '@/lib/image/decode';
import { canEncode } from '@/lib/image/encode';
import {
  IMAGE_ACCEPT,
  IMAGE_LABEL,
  imageRule,
  OUTPUT_FORMATS,
  type OutputFormat,
} from '@/lib/image/image_formats';
import type { ImageMetadata } from '@/lib/image/metadata';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 60 * 1024 * 1024;
const RULE: FileRule = imageRule({ max_files: 1, max_bytes: MAX_BYTES });

type Mode = 'view' | 'remove';

const MODE_OPTIONS: readonly { value: Mode; label: string }[] = [
  { value: 'view', label: 'View metadata' },
  { value: 'remove', label: 'Remove metadata' },
];

interface Result {
  artifact: ProcessorArtifact;
}

/** Flattens everything on screen into the plain text file the "Save details" button writes. */
function buildMetadataText(file: File, metadata: ImageMetadata): string {
  const lines: string[] = [`File: ${safeFileName(file.name)}`];
  lines.push(`Type: ${metadata.mime_type}`);
  lines.push(`File size: ${formatBytes(metadata.file_size)}`);
  if (metadata.dimensions) {
    lines.push(`Dimensions: ${metadata.dimensions.width} x ${metadata.dimensions.height} pixels`);
  }
  if (metadata.dpi !== undefined) lines.push(`Resolution: ${metadata.dpi} DPI`);
  if (metadata.orientation !== undefined) lines.push(`Orientation: ${metadata.orientation}`);

  for (const group of metadata.groups) {
    lines.push('', group.group);
    for (const entry of group.entries) lines.push(`  ${entry.label}: ${entry.value}`);
  }

  if (!metadata.has_metadata) {
    lines.push('', 'No camera, date or location metadata was found in this file.');
  }
  return `${lines.join('\n')}\n`;
}

interface DetailRow {
  label: string;
  value: string;
}

/** A real table so a screen reader reads each value with the label it belongs to. */
function DetailTable({ title, rows }: { title: string; rows: readonly DetailRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="text-muted mb-1 text-left text-xs font-semibold tracking-wide uppercase">
        {title}
      </caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="align-top">
            <th scope="row" className="text-muted w-32 py-0.5 pr-2 text-left font-medium">
              {row.label}
            </th>
            <td className="py-0.5 break-words">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImageMetadataWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [formatOptions, setFormatOptions] = useState<OutputFormat[]>([...OUTPUT_FORMATS]);
  const [mode, setMode] = useState<Mode>('view');
  const [copied, setCopied] = useState<'details' | 'gps' | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const previewRequest = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // AVIF encoding is not available everywhere, so the option is hidden rather than failing later.
  useEffect(() => {
    canEncode('avif').then((ok) => {
      setFormatOptions(
        ok ? [...OUTPUT_FORMATS] : OUTPUT_FORMATS.filter((value) => value !== 'avif'),
      );
    });
  }, []);

  function clearFile() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    previewRequest.current += 1;
    setFile(null);
    setPreviewSrc(null);
    setMetadata(null);
    setMetadataError(null);
    setResult(null);
    setNotice(null);
    setCopied(null);
    setMode('view');
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;

    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    const requestId = (previewRequest.current += 1);

    setFile(next);
    setPreviewSrc(null);
    setMetadata(null);
    setMetadataError(null);
    setResult(null);
    setNotice(null);
    setCopied(null);
    setMode('view');

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
          setMetadataError('This picture could not be shown, but its details still load below.');
        }
      });

    try {
      const [{ readMetadata }, { detectFormat }] = await Promise.all([
        import('@/lib/image/metadata'),
        import('@/lib/image/image_formats'),
      ]);
      const read = await readMetadata(next);
      if (requestId !== previewRequest.current) return;
      setMetadata(read);

      // Default the clean copy to the format that came in, so nothing silently changes type.
      const sourceFormat = await detectFormat(next);
      if (requestId !== previewRequest.current) return;
      setFormat(
        sourceFormat && (OUTPUT_FORMATS as readonly string[]).includes(sourceFormat)
          ? (sourceFormat as OutputFormat)
          : 'png',
      );
    } catch {
      if (requestId === previewRequest.current) {
        setMetadataError('The details in this file could not be read.');
      }
    }
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('image.image-metadata');
      const output = await processor(
        { files: [file], options: { format } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact });
      else setNotice('No clean copy was produced. Try a different file.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The details could not be removed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  function flagCopied(what: 'details' | 'gps') {
    setCopied(what);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  }

  async function copyDetails() {
    if (!file || !metadata) return;
    await navigator.clipboard.writeText(buildMetadataText(file, metadata));
    flagCopied('details');
  }

  async function copyGps() {
    if (!metadata?.gps) return;
    await navigator.clipboard.writeText(
      `${metadata.gps.latitude.toFixed(6)}, ${metadata.gps.longitude.toFixed(6)}`,
    );
    flagCopied('gps');
  }

  function saveDetails() {
    if (!file || !metadata) return;
    const blob = new Blob([buildMetadataText(file, metadata)], { type: 'text/plain' });
    downloadBlob(blob, replaceExtension(file.name, 'txt'));
  }

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept={IMAGE_ACCEPT} onFiles={addFile} />
        {notice && <Notice>{notice}</Notice>}
      </div>
    );
  }

  const dimensions = metadata?.dimensions;
  const fileRows: DetailRow[] = metadata
    ? [
        {
          label: 'Dimensions',
          value: dimensions ? `${dimensions.width} x ${dimensions.height} pixels` : 'Unknown',
        },
        { label: 'Type', value: metadata.mime_type },
        { label: 'File size', value: formatBytes(metadata.file_size) },
        ...(metadata.dpi !== undefined
          ? [{ label: 'Resolution', value: `${metadata.dpi} DPI` }]
          : []),
        ...(metadata.orientation !== undefined
          ? [{ label: 'Orientation', value: String(metadata.orientation) }]
          : []),
      ]
    : [];

  const preview = (
    <div className="flex flex-col gap-4">
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

      <div className="border-border bg-surface rounded-2xl border p-4">
        <p className="text-sm font-semibold">What this file contains</p>

        {metadataError && (
          <div className="mt-2">
            <Notice>{metadataError}</Notice>
          </div>
        )}

        {metadata && (
          <div className="mt-3 flex flex-col gap-4">
            <DetailTable title="File" rows={fileRows} />

            {metadata.gps && (
              <div className="text-danger flex flex-wrap items-start gap-2 text-sm">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  This photo carries a location: {metadata.gps.latitude.toFixed(6)},{' '}
                  {metadata.gps.longitude.toFixed(6)}
                </span>
                <Button size="sm" variant="secondary" onClick={copyGps}>
                  {copied === 'gps' ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                  {copied === 'gps' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            )}

            {metadata.groups.map((group) => (
              <DetailTable key={group.group} title={group.group} rows={group.entries} />
            ))}

            {!metadata.has_metadata && (
              <p className="text-muted text-sm">
                This file carries no camera, date or location details beyond the file information
                above.
              </p>
            )}
          </div>
        )}

        {!metadata && !metadataError && (
          <p className="text-muted mt-2 flex items-center gap-2 text-sm">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Reading details
          </p>
        )}
      </div>
    </div>
  );

  const panel = (
    <ControlPanel>
      <SegmentedControl
        options={MODE_OPTIONS}
        value={mode}
        onChange={(value) => {
          setMode(value);
          setNotice(null);
        }}
        disabled={busy}
      />

      {mode === 'view' && (
        <>
          {metadata && (
            <section
              aria-label="Saved details"
              className="border-brand bg-cream flex flex-col gap-2 rounded-xl border p-3"
            >
              <span className="text-xs font-bold">
                {metadata.has_metadata
                  ? 'Details found in this file'
                  : 'Only basic file information was found'}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={copyDetails}>
                  {copied === 'details' ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                  {copied === 'details' ? 'Copied' : 'Copy'}
                </Button>
                <Button className="flex-1" onClick={saveDetails}>
                  <Download aria-hidden className="size-4" />
                  Save as text
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      {mode === 'remove' && (
        <>
          <Field label="Save the clean copy as">
            <SegmentedControl
              options={formatOptions.map((value) => ({ value, label: IMAGE_LABEL[value] }))}
              value={format}
              onChange={(value) => {
                setFormat(value);
                setResult(null);
              }}
              disabled={busy}
            />
          </Field>

          <Notice variant="info">
            The picture is saved again from scratch, so a JPG or WebP loses a little quality.
          </Notice>

          {notice && <Notice>{notice}</Notice>}

          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Eraser aria-hidden className="size-4" />
            )}
            {busy ? 'Cleaning' : 'Remove metadata'}
          </Button>

          {result && (
            <ImageResultCard
              label="Clean copy"
              artifacts={[
                {
                  artifact: result.artifact,
                  caption: `${
                    dimensions ? `${dimensions.width} x ${dimensions.height} pixels · ` : ''
                  }${metadata?.has_metadata ? 'details removed' : 'no details were present'}`,
                },
              ]}
            />
          )}
        </>
      )}

      <Button size="sm" variant="ghost" onClick={clearFile} disabled={busy}>
        Choose a different file
      </Button>
    </ControlPanel>
  );

  return <ImageWorkspaceLayout preview={preview} panel={panel} />;
}
