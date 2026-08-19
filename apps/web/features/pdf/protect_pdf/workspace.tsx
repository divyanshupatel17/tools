'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Lock, Maximize2, TriangleAlert } from 'lucide-react';
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

/** Encrypts the PDF with AES-256 (see `features/pdf/protect_pdf/processor.ts`). The password
 * never leaves this tab — it exists only in memory for the seconds this takes to run. */
export function ProtectPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [viewingSource, setViewingSource] = useState(false);

  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setNotice(null);
  }

  const busy = progress !== null;
  const canRun = file !== null && password.length > 0 && password === confirmPassword && !busy;

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.protect-pdf');
      const output = await processor(
        { files: [file], options: { password } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This PDF could not be protected.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

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
          Uses AES 256 bit encryption. Anyone with this password can open the file and change its
          permissions; there is no separate owner password.
        </p>

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
            autoComplete="new-password"
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <label className="text-sm">
          <span className="font-semibold">Confirm password</span>
          <input
            type={reveal ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setResult(null);
            }}
            disabled={busy}
            autoComplete="new-password"
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
          {passwordsMismatch && (
            <span className="text-danger mt-1 block text-xs">Passwords don&rsquo;t match.</span>
          )}
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
            <Lock aria-hidden className="size-4" />
          )}
          {busy ? `Protecting ${percent}%` : 'Protect PDF'}
        </Button>

        {result && (
          <section
            aria-label="Protected document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {formatBytes(result.artifact.blob.size)} · password required to open
              </span>
            </span>
            <Button
              className="w-full"
              onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
            >
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </section>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setFile(null);
            setPassword('');
            setConfirmPassword('');
            setResult(null);
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
    </div>
  );
}
