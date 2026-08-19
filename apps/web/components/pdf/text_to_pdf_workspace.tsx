'use client';

import { useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Download, Loader2, Maximize2, Upload, TriangleAlert } from 'lucide-react';
import { formatBytes, validateFile, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import type { TypesetPageSize } from '@/lib/pdf/pdf_typeset';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MARGINS: Array<[number, string]> = [
  [0, 'None'],
  [36, 'Normal'],
  [72, 'Wide'],
];

interface Result {
  artifact: ProcessorArtifact;
}

export interface TextToPdfWorkspaceProps {
  /** Registry processor id, e.g. "pdf.text-to-pdf". */
  processorId: string;
  actionIcon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  actionLabel: string;
  actioningLabel: string;
  hint: string;
  placeholder: string;
  /** Validates a dropped/chosen file before it's read as text; also drives the file input's `accept`. */
  fileRule: FileRule;
  /** e.g. ".md,.markdown,text/markdown" — passed straight to the file input's `accept`. */
  fileAccept: string;
  /** Extra per-tool controls (e.g. Text to PDF's page-number toggle), rendered above the run button. */
  extraOptions?: (context: { disabled: boolean }) => ReactNode;
  /** Extra option values to merge into the processor call, re-read fresh on every run. */
  buildExtraOptions?: () => Record<string, unknown>;
}

/** Shared by Text to PDF, Markdown to PDF and HTML to PDF: paste content, pick page size,
 * margin and font size, and typeset it — only the processor and content differ. */
export function TextToPdfWorkspace({
  processorId,
  actionIcon: ActionIcon,
  actionLabel,
  actioningLabel,
  hint,
  placeholder,
  fileRule,
  fileAccept,
  extraOptions,
  buildExtraOptions,
}: TextToPdfWorkspaceProps) {
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<TypesetPageSize>('a4');
  const [margin, setMargin] = useState(36);
  const [fontSize, setFontSize] = useState(11);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewing, setViewing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const fileInputId = useId();

  const busy = progress !== null;
  const canRun = text.trim() !== '' && !busy;

  async function loadFile(file: File) {
    const check = validateFile(file, fileRule);
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'That file could not be read.');
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setSourceName(file.name);
      setNotice(null);
      setResult(null);
      setResultFile(null);
    } catch {
      setNotice('That file could not be read as text.');
    }
  }

  async function run() {
    if (!canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor(processorId);
      const output = await processor(
        {
          files: [],
          text,
          options: {
            page_size: pageSize,
            margin,
            font_size: fontSize,
            ...buildExtraOptions?.(),
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be completed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-muted text-sm">
            <span className="text-foreground font-semibold">{text.length.toLocaleString()}</span>{' '}
            characters
            {sourceName && (
              <>
                {' · '}
                <span className="text-foreground font-medium">{sourceName}</span>
              </>
            )}
          </p>
          <label
            htmlFor={fileInputId}
            className="decoration-brand text-muted hover:text-foreground flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium underline decoration-2 underline-offset-4"
          >
            <Upload aria-hidden className="size-3.5" />
            Upload a file
          </label>
          <input
            id={fileInputId}
            type="file"
            accept={fileAccept}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void loadFile(file);
            }}
          />
        </div>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (!busy && file) void loadFile(file);
          }}
          className={dragging ? 'ring-brand rounded-2xl ring-2 ring-offset-2' : undefined}
        >
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSourceName(null);
              setResult(null);
              setResultFile(null);
            }}
            placeholder={placeholder}
            disabled={busy}
            className="min-h-[60vh] font-mono"
          />
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">{hint}</p>

        <label className="text-sm">
          <span className="font-semibold">Page size</span>
          <select
            name="page-size"
            value={pageSize}
            onChange={(event) => setPageSize(event.target.value as TypesetPageSize)}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Margin</span>
          <select
            name="margin"
            value={margin}
            onChange={(event) => setMargin(Number(event.target.value))}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            {MARGINS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Font size</span>
          <NumberField
            value={fontSize}
            onChange={setFontSize}
            min={8}
            max={24}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        {extraOptions?.({ disabled: busy })}

        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-xs">
            <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
            {notice}
          </p>
        )}

        {busy && (
          <div>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progress"
              className="bg-cream h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-brand h-full rounded-full transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-muted mt-1.5 text-xs">
              {progress?.label ?? 'Working'} · {percent}%
            </p>
          </div>
        )}

        <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <ActionIcon aria-hidden className="size-4" />
          )}
          {busy ? actioningLabel : actionLabel}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Generated document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setViewing(true)}>
                <Maximize2 aria-hidden className="size-4" />
                View
              </Button>
              <Button
                className="flex-1"
                onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
              >
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            </div>
          </section>
        )}
      </aside>

      {viewing && resultFile && (
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewing(false)} />
      )}
    </div>
  );
}
