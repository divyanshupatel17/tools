'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Layers, Loader2, Maximize2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};

interface Result {
  artifact: ProcessorArtifact;
  fields: number;
}

/** Bakes form field values into the page and removes the fields — see
 * `features/pdf/flatten_pdf/processor.ts`. Irreversible: the output can no longer be filled in. */
export function FlattenPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setResultFile(null);
    setNotice(null);
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.flatten-pdf');
      const output = await processor(
        { files: [file], options: {} },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, fields: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This document could not be flattened.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <p className="text-muted mb-3 text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {formatBytes(file.size)}
        </p>

        <div className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border p-10 text-center">
          <FileText aria-hidden className="text-muted size-10" />
          <div>
            <p className="font-semibold">{safeFileName(file.name)}</p>
            <p className="text-muted text-sm">{formatBytes(file.size)}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setViewingSource(true)}>
            <Maximize2 aria-hidden className="size-4" />
            View document
          </Button>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          Bakes every form field&rsquo;s current value into the page and removes the field. The
          result looks the same but can no longer be filled in. This cannot be undone.
        </p>

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
            <Layers aria-hidden className="size-4" />
          )}
          {busy ? `Flattening ${percent}%` : 'Flatten PDF'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Flattened document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.fields > 0
                  ? `${result.fields} field${result.fields === 1 ? '' : 's'} flattened`
                  : 'No form fields found'}
                {' · '}
                {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setViewingResult(true)}>
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

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setFile(null);
            setResult(null);
            setResultFile(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {viewingSource && (
        <PageDetailModal file={file} pageIndex={0} onClose={() => setViewingSource(false)} />
      )}
      {viewingResult && resultFile && (
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewingResult(false)} />
      )}
    </div>
  );
}
