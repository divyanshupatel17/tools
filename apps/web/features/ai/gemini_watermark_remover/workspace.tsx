'use client';

import { useEffect, useState } from 'react';
import { Download, Eye, Loader2, Sparkles } from 'lucide-react';
import type { FileRule } from '@tools/file_utils';
import { formatBytes } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { ControlPanel, Notice, ProgressBar } from '@/components/image/control_panel';
import { ImageWorkspaceLayout } from '@/components/image/image_workspace_layout';
import { BeforeAfterModal } from '@/components/tool_workspace/before_after_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { zipFiles } from '@/lib/browser/zip';
import { createPreviewUrl, readImageSize } from '@/lib/image/decode';
import { IMAGE_ACCEPT, imageRule } from '@/lib/image/image_formats';
import { loadProcessor } from '@/lib/processing/processor_registry';
import type { GeminiWatermarkRemoverOutput } from './processor';

const MAX_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 20;
const RULE: FileRule = imageRule({ max_files: MAX_FILES, max_bytes: MAX_BYTES });
const SINGLE_DISPLAY_WIDTH = 460;
const ROW_DISPLAY_WIDTH = 96;

interface Entry {
  id: string;
  file: File;
  originalUrl: string | null;
  naturalSize: { width: number; height: number } | null;
}

interface Result {
  fileName: string;
  blob: Blob;
  url: string;
  found: boolean;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function GeminiWatermarkRemoverWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(
    () => () => {
      entries.forEach((entry) => entry.originalUrl && URL.revokeObjectURL(entry.originalUrl));
      results?.forEach((result) => URL.revokeObjectURL(result.url));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function clearResults() {
    results?.forEach((result) => URL.revokeObjectURL(result.url));
    setResults(null);
  }

  function resetAll() {
    entries.forEach((entry) => entry.originalUrl && URL.revokeObjectURL(entry.originalUrl));
    clearResults();
    setEntries([]);
    setNotice(null);
    setLoadError(null);
  }

  async function addFiles(files: File[]) {
    setLoadError(null);
    clearResults();
    setNotice(null);

    const room = MAX_FILES - entries.length;
    const accepted = files.slice(0, Math.max(0, room));
    if (accepted.length < files.length) {
      setNotice(`Only ${MAX_FILES} images can be processed at a time, so the rest were skipped.`);
    }
    if (accepted.length === 0) return;

    const loaded = await Promise.all(
      accepted.map(async (file): Promise<Entry | null> => {
        try {
          const [size, previewUrl] = await Promise.all([
            readImageSize(file),
            createPreviewUrl(file),
          ]);
          return { id: makeId(), file, originalUrl: previewUrl, naturalSize: size };
        } catch {
          return null;
        }
      }),
    );

    const good = loaded.filter((entry): entry is Entry => entry !== null);
    if (good.length < accepted.length)
      setLoadError('Some of those files could not be read as images.');
    setEntries((prev) => [...prev, ...good]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => {
      const target = prev.find((entry) => entry.id === id);
      if (target?.originalUrl) URL.revokeObjectURL(target.originalUrl);
      return prev.filter((entry) => entry.id !== id);
    });
    clearResults();
  }

  const busy = progress !== null;
  const canRun = entries.length > 0 && !busy;

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResults();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();

    try {
      const processor = await loadProcessor('ai.gemini-watermark-remover');
      const output = await processor(
        { files: entries.map((entry) => entry.file), options: {} },
        { signal: controller.signal, on_progress: setProgress },
      );
      const found = (output as GeminiWatermarkRemoverOutput).found ?? [];
      setResults(
        output.artifacts.map((artifact, index) => ({
          fileName: artifact.file_name,
          blob: artifact.blob,
          url: URL.createObjectURL(artifact.blob),
          found: found[index] ?? false,
        })),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'These images could not be processed.');
    } finally {
      setProgress(null);
    }
  }

  async function downloadAll() {
    if (!results || results.length < 2) return;
    const zipEntries = await Promise.all(
      results.map(async (result) => ({
        file_name: result.fileName,
        bytes: new Uint8Array(await result.blob.arrayBuffer()),
      })),
    );
    downloadBlob(await zipFiles(zipEntries), 'watermarks_removed.zip');
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} multiple accept={IMAGE_ACCEPT} onFiles={addFiles} />
        {loadError && <Notice>{loadError}</Notice>}
      </div>
    );
  }

  const single = entries.length === 1 ? entries[0]! : null;
  const singleResult = single ? results?.[0] : undefined;
  const anyNotFound = results?.some((result) => !result.found) ?? false;
  const showResultColumn = busy || results !== null;

  const preview = single ? (
    showResultColumn ? (
      <div className="flex flex-wrap items-start justify-center gap-6">
        <div className="flex flex-col items-center">
          <p className="text-muted mb-2 text-sm font-semibold">Original</p>
          <div
            className="border-border bg-cream overflow-hidden rounded-xl border shadow-sm"
            style={{
              width: SINGLE_DISPLAY_WIDTH,
              aspectRatio: single.naturalSize
                ? `${single.naturalSize.width} / ${single.naturalSize.height}`
                : '4 / 3',
            }}
          >
            {single.originalUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={single.originalUrl} alt="Original" className="size-full object-contain" />
            )}
          </div>
          <p className="text-muted mt-2 text-xs">
            {single.naturalSize
              ? `${single.naturalSize.width} x ${single.naturalSize.height} px`
              : ''}{' '}
            · {formatBytes(single.file.size)}
          </p>
        </div>

        <div className="flex flex-col items-center">
          <p className="text-muted mb-2 text-sm font-semibold">Removed</p>
          <div
            className="border-border bg-cream relative overflow-hidden rounded-xl border shadow-sm"
            style={{
              width: SINGLE_DISPLAY_WIDTH,
              aspectRatio: single.naturalSize
                ? `${single.naturalSize.width} / ${single.naturalSize.height}`
                : '4 / 3',
            }}
          >
            {singleResult ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={singleResult.url}
                alt="Watermark removed"
                className="size-full object-contain"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
              </div>
            )}
          </div>
          <p className="text-muted mt-2 text-xs">
            {single.naturalSize
              ? `${single.naturalSize.width} x ${single.naturalSize.height} px`
              : ''}
            {singleResult ? ` · ${formatBytes(singleResult.blob.size)}` : ''}
          </p>
        </div>
      </div>
    ) : (
      <div className="flex justify-center">
        <div className="flex flex-col items-center">
          <div
            className="border-border bg-cream overflow-hidden rounded-xl border shadow-sm"
            style={{
              width: SINGLE_DISPLAY_WIDTH,
              aspectRatio: single.naturalSize
                ? `${single.naturalSize.width} / ${single.naturalSize.height}`
                : '4 / 3',
            }}
          >
            {single.originalUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={single.originalUrl} alt="Original" className="size-full object-contain" />
            )}
          </div>
          <p className="text-muted mt-2 text-xs">
            {single.naturalSize
              ? `${single.naturalSize.width} x ${single.naturalSize.height} px`
              : ''}{' '}
            · {formatBytes(single.file.size)}
          </p>
        </div>
      </div>
    )
  ) : (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const result = results?.[index];
        return (
          <div
            key={entry.id}
            className="border-border bg-cream flex flex-wrap items-center gap-3 rounded-xl border p-3"
          >
            <div
              className="border-border bg-surface shrink-0 overflow-hidden rounded-lg border"
              style={{ width: ROW_DISPLAY_WIDTH, aspectRatio: '4 / 3' }}
            >
              {entry.originalUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.originalUrl} alt="" className="size-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.file.name}</p>
              <p className="text-muted text-xs">
                {entry.naturalSize
                  ? `${entry.naturalSize.width} x ${entry.naturalSize.height} px`
                  : ''}{' '}
                · {formatBytes(entry.file.size)}
              </p>
              {result && !result.found && (
                <p className="text-muted mt-0.5 text-xs">No watermark found</p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreviewId(entry.id)}
              aria-label="Preview"
            >
              <Eye aria-hidden className="size-4" />
            </Button>
            {result ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => downloadBlob(result.blob, result.fileName)}
              >
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            ) : busy ? (
              <Loader2 aria-hidden className="text-muted size-5 shrink-0 animate-spin" />
            ) : (
              <Button size="sm" variant="ghost" onClick={() => removeEntry(entry.id)}>
                Remove
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );

  const previewEntry = previewId ? entries.find((entry) => entry.id === previewId) : undefined;
  const previewIndex = previewEntry ? entries.indexOf(previewEntry) : -1;
  const previewResult = previewIndex >= 0 ? results?.[previewIndex] : undefined;

  const panel = (
    <ControlPanel>
      <FileUpload rule={RULE} multiple accept={IMAGE_ACCEPT} onFiles={addFiles} disabled={busy} />

      {notice && <Notice variant="info">{notice}</Notice>}
      {loadError && <Notice>{loadError}</Notice>}
      {results && anyNotFound && (
        <Notice variant="info">
          No Gemini sparkle mark was found in one or more images, so those exports are unchanged.
        </Notice>
      )}

      {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

      <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Sparkles aria-hidden className="size-4" />
        )}
        Remove watermark
      </Button>

      {results && single && singleResult && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => downloadBlob(singleResult.blob, singleResult.fileName)}
        >
          <Download aria-hidden className="size-4" />
          Download ({formatBytes(singleResult.blob.size)})
        </Button>
      )}

      {results && results.length > 1 && (
        <Button variant="secondary" className="w-full" onClick={() => void downloadAll()}>
          <Download aria-hidden className="size-4" />
          Download all ({results.length})
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={resetAll} disabled={busy}>
        Choose different files
      </Button>
    </ControlPanel>
  );

  return (
    <>
      <ImageWorkspaceLayout preview={preview} panel={panel} />
      {previewEntry && (
        <BeforeAfterModal
          title={previewEntry.file.name}
          beforeLabel="Original"
          afterLabel="Removed"
          before={
            previewEntry.originalUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewEntry.originalUrl}
                alt="Original"
                className="max-h-[70vh] max-w-full rounded shadow-sm"
              />
            ) : (
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            )
          }
          after={
            previewResult ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewResult.url}
                alt="Watermark removed"
                className="max-h-[70vh] max-w-full rounded shadow-sm"
              />
            ) : (
              <p className="text-muted p-4 text-center text-xs">Not processed yet</p>
            )
          }
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}
