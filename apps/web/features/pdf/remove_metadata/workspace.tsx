'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Eraser, FileText, Loader2, Maximize2, TriangleAlert } from 'lucide-react';
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

interface FoundMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
}

interface Result {
  artifact: ProcessorArtifact;
  hadInfo: boolean;
  hadXmp: boolean;
}

/** Reads only the info-dictionary fields worth showing the user before they remove them —
 * the same fields `features/pdf/remove_metadata/processor.ts` drops. pdf-lib is imported
 * dynamically here, not at module scope, so a tool that only viewers other pages never pays
 * for it. */
async function readMetadata(file: File): Promise<FoundMetadata> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return {
    title: pdfDoc.getTitle(),
    author: pdfDoc.getAuthor(),
    subject: pdfDoc.getSubject(),
    keywords: pdfDoc.getKeywords(),
    creator: pdfDoc.getCreator(),
    producer: pdfDoc.getProducer(),
  };
}

const FIELD_LABELS: Array<[keyof FoundMetadata, string]> = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
  ['creator', 'Creator'],
  ['producer', 'Producer'],
];

export function RemoveMetadataWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<FoundMetadata | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setResultFile(null);
    setNotice(null);
    setMetadata(null);
    try {
      setMetadata(await readMetadata(next));
    } catch {
      setMetadata({});
    }
  }

  const busy = progress !== null;
  const canRun = file !== null && !busy;
  const foundFields = FIELD_LABELS.filter(([key]) => metadata?.[key]);

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.remove-metadata');
      const output = await processor(
        { files: [file], options: {} },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      const stats = output.text
        ? (JSON.parse(output.text) as { had_info: boolean; had_xmp: boolean })
        : null;
      if (artifact) {
        setResult({ artifact, hadInfo: stats?.had_info ?? false, hadXmp: stats?.had_xmp ?? false });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The metadata could not be removed.');
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

        {metadata && (
          <div className="border-border bg-surface mt-4 rounded-2xl border p-4">
            <p className="text-sm font-semibold">Metadata found in this file</p>
            {foundFields.length === 0 ? (
              <p className="text-muted mt-2 text-sm">
                No title, author or other info fields were found.
              </p>
            ) : (
              <dl className="mt-2 flex flex-col gap-1.5">
                {foundFields.map(([key, label]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <dt className="text-muted w-20 shrink-0 font-medium">{label}</dt>
                    <dd className="min-w-0 truncate">{metadata[key]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="bg-cream text-ink/80 rounded-xl p-3 text-xs">
          Removes the document&rsquo;s info dictionary (title, author, subject, keywords, creator,
          producer, dates) and any embedded XMP metadata. The pages themselves are untouched.
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
            <Eraser aria-hidden className="size-4" />
          )}
          {busy ? `Cleaning ${percent}%` : 'Remove Metadata'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Cleaned document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.hadInfo || result.hadXmp ? 'Metadata removed' : 'No metadata was present'} ·{' '}
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
            setMetadata(null);
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
