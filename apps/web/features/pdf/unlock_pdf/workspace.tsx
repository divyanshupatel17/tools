'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, LockOpen, Maximize2, TriangleAlert } from 'lucide-react';
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
}

/**
 * Removes a password from a PDF whose password you already know — see
 * `features/pdf/unlock_pdf/processor.ts`. This does not attempt to guess or crack a password;
 * if you don't know it, this tool cannot help. There is no preview of the locked source file:
 * it is still encrypted, so nothing here can render it before the password is checked.
 */
export function UnlockPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
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
  const canRun = file !== null && password.length > 0 && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.unlock-pdf');
      const output = await processor(
        { files: [file], options: { password } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This PDF could not be unlocked.');
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
            <p className="text-muted text-sm">
              Password protected. A preview isn&rsquo;t available until it&rsquo;s unlocked.
            </p>
          </div>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <ul className="bg-cream text-ink/80 list-disc space-y-1 rounded-xl p-3 pl-6 text-xs">
          <li>Only works if you already know the password. It does not guess or crack passwords.</li>
          <li>Supports AES 256 files. Older RC4 or AES 128 files aren&rsquo;t supported yet.</li>
        </ul>

        <label className="text-sm">
          <span className="font-semibold">Password</span>
          <input
            type={reveal ? 'text' : 'password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setResult(null);
            }}
            disabled={busy}
            autoComplete="current-password"
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(event) => setReveal(event.target.checked)}
            className="accent-brand size-4"
          />
          <span>Show password</span>
        </label>

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
            <LockOpen aria-hidden className="size-4" />
          )}
          {busy ? `Unlocking ${percent}%` : 'Unlock PDF'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Unlocked document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {formatBytes(result.artifact.blob.size)} · no password needed, ever again
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
            setPassword('');
            setResult(null);
            setResultFile(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {viewingResult && resultFile && (
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewingResult(false)} />
      )}
    </div>
  );
}
