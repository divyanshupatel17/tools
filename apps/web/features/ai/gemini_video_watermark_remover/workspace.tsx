'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Eye, Loader2, Sparkles } from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { BeforeAfterModal } from '@/components/tool_workspace/before_after_modal';
import { Button } from '@/components/ui/button';
import { ControlPanel, Notice, ProgressBar } from '@/components/video/control_panel';
import { SyncedVideoPair } from '@/components/video/synced_video_pair';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { zipFiles } from '@/lib/browser/zip';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { generateFilmstrip } from '@/lib/video/thumbnails';
import { formatDuration, readVideoMeta, VIDEO_ACCEPT, videoRule } from '@/lib/video/video_formats';
import type { GeminiVideoWatermarkRemoverOutput } from './processor';

const MAX_BYTES = 300 * 1024 * 1024;
const MAX_FILES = 20;
const RULE = videoRule({ max_files: MAX_FILES, max_bytes: MAX_BYTES });

interface SourceMeta {
  duration: number;
  width: number;
  height: number;
}

interface Entry {
  id: string;
  file: File;
  sourceUrl: string;
  meta: SourceMeta | null;
  thumbnail: string | null;
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

export function GeminiVideoWatermarkRemoverWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const resultsRef = useRef<Result[] | null>(null);

  useEffect(() => {
    entriesRef.current = entries;
    resultsRef.current = results;
  });

  useEffect(
    () => () => {
      abort.current?.abort();
      entriesRef.current.forEach((entry) => URL.revokeObjectURL(entry.sourceUrl));
      resultsRef.current?.forEach((result) => URL.revokeObjectURL(result.url));
    },
    [],
  );

  function clearResults() {
    results?.forEach((result) => URL.revokeObjectURL(result.url));
    setResults(null);
  }

  function resetAll() {
    abort.current?.abort();
    entries.forEach((entry) => URL.revokeObjectURL(entry.sourceUrl));
    clearResults();
    setEntries([]);
    setNotice(null);
    setProgress(null);
  }

  async function addFiles(files: File[]) {
    clearResults();
    setNotice(null);

    const room = MAX_FILES - entries.length;
    const accepted = files.slice(0, Math.max(0, room));
    if (accepted.length < files.length) {
      setNotice(`Only ${MAX_FILES} videos can be processed at a time, so the rest were skipped.`);
    }
    if (accepted.length === 0) return;

    const loaded: Entry[] = accepted.map((file) => ({
      id: makeId(),
      file,
      sourceUrl: URL.createObjectURL(file),
      meta: null,
      thumbnail: null,
    }));
    setEntries((prev) => [...prev, ...loaded]);

    for (const entry of loaded) {
      try {
        const meta = await readVideoMeta(entry.file);
        setEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, meta } : item)));
        const [thumbnail] = await generateFilmstrip(entry.file, meta.duration, 1, 96);
        if (thumbnail) {
          setEntries((prev) =>
            prev.map((item) => (item.id === entry.id ? { ...item, thumbnail } : item)),
          );
        }
      } catch {
        // A file that fails to read its metadata still gets processed; only the preview is missing.
      }
    }
  }

  function removeEntry(id: string) {
    setEntries((prev) => {
      const target = prev.find((entry) => entry.id === id);
      if (target) URL.revokeObjectURL(target.sourceUrl);
      return prev.filter((entry) => entry.id !== id);
    });
    clearResults();
  }

  const busy = progress !== null;
  const canRun = entries.length > 0 && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResults();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('ai.gemini-video-watermark-remover');
      const output = await processor(
        { files: entries.map((entry) => entry.file), options: {} },
        { signal: controller.signal, on_progress: setProgress },
      );
      const found = (output as GeminiVideoWatermarkRemoverOutput).found ?? [];
      setResults(
        output.artifacts.map((artifact, index) => ({
          fileName: artifact.file_name,
          blob: artifact.blob,
          url: URL.createObjectURL(artifact.blob),
          found: found[index] ?? false,
        })),
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(error instanceof Error ? error.message : 'These videos could not be processed.');
      }
    } finally {
      abort.current = null;
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

  const single = entries.length === 1 ? entries[0]! : null;
  const singleResult = single ? results?.[0] : undefined;
  const anyNotFound = results?.some((result) => !result.found) ?? false;

  const beforeCaption = single
    ? `${safeFileName(single.file.name)} · ${formatBytes(single.file.size)}${
        single.meta
          ? ` · ${formatDuration(single.meta.duration)} · ${single.meta.width}×${single.meta.height}`
          : ''
      }`
    : undefined;

  const afterCaption = singleResult
    ? `${singleResult.fileName} · ${formatBytes(singleResult.blob.size)}`
    : undefined;

  const showResultColumn = busy || results !== null;

  const singleStage = single ? (
    showResultColumn ? (
      <SyncedVideoPair
        before={{ src: single.sourceUrl, caption: beforeCaption, placeholder: null }}
        after={{
          src: singleResult?.url ?? null,
          caption: afterCaption,
          placeholder: (
            <p className="text-muted px-6 text-center text-sm">
              {busy ? `Removing watermark ${percent}%` : 'Preparing the result'}
            </p>
          ),
        }}
      />
    ) : (
      <div className="border-border bg-surface mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-sm">
        <video src={single.sourceUrl} controls className="aspect-video w-full bg-black" />
        {beforeCaption && (
          <p className="text-muted border-border/60 border-t px-3 py-2 text-xs">{beforeCaption}</p>
        )}
      </div>
    )
  ) : null;

  const rowStage = (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => {
        const result = results?.[index];
        const processing = busy && !result;
        return (
          <div
            key={entry.id}
            className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-3 shadow-sm"
          >
            <div className="bg-ink/5 flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              {entry.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <Loader2 aria-hidden className="text-muted size-4 animate-spin" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.file.name}</p>
              <p className="text-muted text-xs">
                {formatBytes(entry.file.size)}
                {entry.meta
                  ? ` · ${formatDuration(entry.meta.duration)} · ${entry.meta.width}×${entry.meta.height}`
                  : ''}
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
            ) : processing ? (
              <Loader2 aria-hidden className="text-muted size-5 shrink-0 animate-spin" />
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeEntry(entry.id)}
                disabled={busy}
              >
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

  return (
    <>
      <VideoWorkspaceLayout
        stage={
          entries.length === 0 ? (
            <div className="border-border bg-surface mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-sm">
              <div className="flex aspect-video items-center justify-center p-4">
                <FileUpload rule={RULE} multiple accept={VIDEO_ACCEPT} onFiles={addFiles} />
              </div>
            </div>
          ) : single ? (
            singleStage
          ) : (
            rowStage
          )
        }
        panel={
          entries.length > 0 && (
            <ControlPanel>
              <FileUpload
                rule={RULE}
                multiple
                accept={VIDEO_ACCEPT}
                onFiles={addFiles}
                disabled={busy}
              />

              {notice && <Notice variant="info">{notice}</Notice>}
              {results && anyNotFound && (
                <Notice variant="info">
                  No Gemini sparkle mark was found in one or more videos, so those exports are
                  unchanged.
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
                  Download
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
          )
        }
      />
      {previewEntry && (
        <BeforeAfterModal
          title={previewEntry.file.name}
          beforeLabel="Before"
          afterLabel="After"
          before={
            <video
              src={previewEntry.sourceUrl}
              controls
              className="max-h-[70vh] max-w-full rounded shadow-sm"
            />
          }
          after={
            previewResult ? (
              <video
                src={previewResult.url}
                controls
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
