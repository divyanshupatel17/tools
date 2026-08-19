'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ComponentType } from 'react';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPages } from '@/lib/pdf/pdf_pages';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { PageDetailModal } from './page_detail_modal';
import { PageGrid, type PageGridItem } from './page_grid';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};

interface Result {
  artifact: ProcessorArtifact;
  text: string;
  pages: number;
}

export interface TextExtractWorkspaceProps {
  /** Registry processor id, e.g. "pdf.pdf-to-text". */
  processorId: string;
  actionIcon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  actionLabel: string;
  actioningLabel: string;
  hint: string;
  /** Monospace preview by default (plain text / Markdown source); set false for rendered HTML source. */
  monospacePreview?: boolean;
}

/** Shared by PDF to Text, PDF to Markdown and PDF to HTML: same source-page view, same
 * "extract, preview, copy or download" result shape — only the processor and copy differ. */
export function TextExtractWorkspace({
  processorId,
  actionIcon: ActionIcon,
  actionLabel,
  actioningLabel,
  hint,
  monospacePreview = true,
}: TextExtractWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageGridItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const thumbnails = useRef(new Set<string>());

  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of thumbnails.current) URL.revokeObjectURL(url);
      thumbnails.current.clear();
    },
    [],
  );

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setNotice(null);
    setPages([]);
    setPageCount(0);

    const controller = new AbortController();
    abort.current = controller;

    try {
      const total = await readPdfPages(
        next,
        (page) => {
          if (page.thumbnail) thumbnails.current.add(page.thumbnail);
          setPages((current) => [
            ...current,
            {
              id: `page-${page.index}`,
              pageIndex: page.index,
              thumbnail: page.thumbnail,
              rotation: 0,
              selected: false,
            },
          ]);
        },
        controller.signal,
      );
      setPageCount(total);
    } catch {
      setNotice('That file could not be read as a PDF.');
    } finally {
      abort.current = null;
    }
  }

  const busy = progress !== null;
  const canRun = pageCount > 0 && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setCopied(false);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor(processorId);
      const output = await processor(
        { files: [file], options: {} },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        const text = await artifact.blob.text();
        setResult({ artifact, text, pages: Number(output.text ?? 0) });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be completed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept="application/pdf,.pdf" onFiles={addFile} />
        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <p className="text-muted mb-3 text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount > 0 ? `${pageCount} pages` : 'Reading…'}
        </p>
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <PageGrid items={pages} zoomable onZoom={setZoomPage} busy={busy} />
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">{hint}</p>

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

        {result && (
          <section
            aria-label="Extracted content"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} pages · {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <pre
              className={`bg-surface border-border max-h-64 overflow-auto rounded-lg border p-2.5 text-xs whitespace-pre-wrap ${monospacePreview ? 'font-mono' : ''}`}
            >
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
                onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
              >
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            </div>
          </section>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            for (const url of thumbnails.current) URL.revokeObjectURL(url);
            thumbnails.current.clear();
            setFile(null);
            setPages([]);
            setResult(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {zoomPage !== null && (
        <PageDetailModal file={file} pageIndex={zoomPage} onClose={() => setZoomPage(null)} />
      )}
    </div>
  );
}
