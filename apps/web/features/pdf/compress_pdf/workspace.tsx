'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Maximize2, Shrink, TriangleAlert } from 'lucide-react';
import { ProcessorError } from '@tools/tool_engine';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};

// How long to wait after the slider stops moving before spending a real worker run on it.
const PREVIEW_DEBOUNCE_MS = 500;
// Keeps the target size search fast: each run recompresses every image in the document.
const MAX_SEARCH_RUNS = 4;
const MIN_QUALITY = 0.05;
const MAX_QUALITY = 0.95;
const DEFAULT_QUALITY_PERCENT = 65;

type Mode = 'quality' | 'target';
type SizeUnit = 'KB' | 'MB';

interface Stats {
  original_bytes: number;
  output_bytes: number;
  saved_bytes: number;
  images_recompressed: number;
  images_total: number;
}

interface Result {
  artifact: ProcessorArtifact;
  stats: Stats;
  quality: number;
}

interface TargetSearchResult {
  reachable: boolean;
  result: Result;
}

/**
 * Compress PDF only ever touches embedded photos: it walks the document's raw image objects,
 * keeps the ones that are plain 8-bit DeviceRGB JPEGs (the common case for a scan or photo),
 * and re-encodes just those at a lower quality and, if larger than the target, a lower
 * resolution. Text, vector art and fonts are never rasterised, so a text-heavy PDF may see
 * little or no change — that is expected, not a bug. See `workers/compress_pdf.worker.ts`.
 *
 * There is no cheap way to know the resulting size ahead of time, so this workspace never
 * pretends to show a live estimate. Instead a quality change is debounced and then actually
 * recompressed, and the size shown is always a real result from that run.
 */
export function CompressPdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('quality');

  const [qualityPercent, setQualityPercent] = useState(DEFAULT_QUALITY_PERCENT);
  const [previewResult, setPreviewResult] = useState<Result | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [targetValue, setTargetValue] = useState(2);
  const [targetUnit, setTargetUnit] = useState<SizeUnit>('MB');
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);
  const [targetResult, setTargetResult] = useState<TargetSearchResult | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setPreviewResult(null);
    setTargetResult(null);
    setNotice(null);
  }

  // Runs one real compress at the given quality and reports back the actual output size.
  // Returns null if this run was aborted (a newer one superseded it), never a guess.
  async function runCompressAt(quality: number, signal: AbortSignal): Promise<Result | null> {
    if (!file) return null;
    try {
      const processor = await loadProcessor('pdf.compress-pdf');
      const output = await processor({ files: [file], options: { quality } }, { signal });
      const artifact = output.artifacts[0];
      const stats = output.text ? (JSON.parse(output.text) as Stats) : null;
      if (!artifact || !stats) return null;
      return { artifact, stats, quality };
    } catch (error) {
      if (error instanceof ProcessorError && error.code === 'aborted') return null;
      throw error;
    }
  }

  // Debounced auto preview for the quality slider: waits for the user to stop dragging, then
  // cancels any in-flight run and starts a fresh one at the settled value.
  useEffect(() => {
    if (!file || mode !== 'quality') return;
    const handle = setTimeout(() => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setPreviewLoading(true);
      setNotice(null);
      runCompressAt(qualityPercent / 100, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result) setPreviewResult(result);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setNotice(error instanceof Error ? error.message : 'The document could not be compressed.');
        })
        .finally(() => {
          if (abort.current === controller) {
            setPreviewLoading(false);
            abort.current = null;
          }
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runCompressAt closes over file/mode already covered above
  }, [file, mode, qualityPercent]);

  async function runTargetSearch() {
    if (!file || searching) return;
    const targetBytes = targetValue * (targetUnit === 'MB' ? 1024 * 1024 : 1024);
    if (!(targetBytes > 0)) {
      setNotice('Enter a target size greater than zero.');
      return;
    }

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSearching(true);
    setNotice(null);
    setTargetResult(null);

    let low = MIN_QUALITY;
    let high = MAX_QUALITY;
    let best: Result | null = null;
    let lowest: Result | null = null;

    try {
      for (let run = 0; run < MAX_SEARCH_RUNS; run += 1) {
        setSearchProgress(`Run ${run + 1} of ${MAX_SEARCH_RUNS}`);
        const mid = (low + high) / 2;
        const result = await runCompressAt(mid, controller.signal);
        if (!result) return;
        if (!lowest || mid < lowest.quality) lowest = result;

        if (result.stats.output_bytes <= targetBytes) {
          if (!best || mid > best.quality) best = result;
          low = mid;
        } else {
          high = mid;
        }
      }

      if (best) {
        setTargetResult({ reachable: true, result: best });
      } else if (lowest) {
        setTargetResult({ reachable: false, result: lowest });
      } else {
        setNotice('The target size could not be reached.');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setNotice(error instanceof Error ? error.message : 'The document could not be compressed.');
      }
    } finally {
      if (abort.current === controller) abort.current = null;
      setSearching(false);
      setSearchProgress(null);
    }
  }

  const activeResult = mode === 'quality' ? previewResult : (targetResult?.result ?? null);
  const activeResultFile = activeResult
    ? new File([activeResult.artifact.blob], activeResult.artifact.file_name, {
        type: activeResult.artifact.mime_type,
      })
    : null;

  const savedPercent =
    activeResult && activeResult.stats.original_bytes > 0
      ? Math.round((activeResult.stats.saved_bytes / activeResult.stats.original_bytes) * 100)
      : 0;

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
          Recompresses the photos inside the PDF. Pages that are only text or line art will not
          shrink much, since there is no image data left to reduce.
        </p>

        <div className="border-border grid grid-cols-2 gap-1 rounded-full border p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('quality')}
            className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
              mode === 'quality' ? 'bg-brand text-white' : 'text-muted'
            }`}
          >
            By quality
          </button>
          <button
            type="button"
            onClick={() => setMode('target')}
            className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
              mode === 'target' ? 'bg-brand text-white' : 'text-muted'
            }`}
          >
            By target size
          </button>
        </div>

        {mode === 'quality' && (
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              <span className="font-semibold">Quality ({qualityPercent}%)</span>
              <input
                type="range"
                min={0}
                max={100}
                value={qualityPercent}
                onChange={(event) => setQualityPercent(Number(event.target.value))}
                className="accent-brand mt-1.5 w-full"
              />
            </label>
            <p className="text-muted text-xs">
              A lower quality gives a smaller file but softer photos. The result updates a moment
              after you stop moving the slider.
            </p>

            <div className="border-border bg-cream flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
              <span className="text-muted">Result at this quality</span>
              {previewLoading ? (
                <span className="text-muted flex items-center gap-1.5">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  Compressing
                </span>
              ) : previewResult ? (
                <span className="font-semibold">{formatBytes(previewResult.stats.output_bytes)}</span>
              ) : (
                <span className="text-muted">Not run yet</span>
              )}
            </div>
          </div>
        )}

        {mode === 'target' && (
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              <span className="font-semibold">Target size</span>
              <div className="mt-1.5 flex gap-2">
                <NumberField
                  value={targetValue}
                  onChange={setTargetValue}
                  min={0.1}
                  allowDecimal
                  className="border-border bg-background h-11 w-full rounded-full border px-4 outline-none"
                  aria-label="Target size value"
                />
                <select
                  value={targetUnit}
                  onChange={(event) => setTargetUnit(event.target.value as SizeUnit)}
                  className="border-border bg-background h-11 rounded-full border px-3 outline-none"
                >
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
            </label>
            <p className="text-muted text-xs">
              This searches for the highest quality that still fits under your target size, using
              a few trial runs.
            </p>

            <Button onClick={runTargetSearch} disabled={searching} variant="secondary" className="w-full">
              {searching ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Shrink aria-hidden className="size-4" />
              )}
              {searching ? (searchProgress ?? 'Searching') : 'Find quality'}
            </Button>

            {targetResult && (
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  targetResult.reachable ? 'border-brand bg-cream' : 'border-danger bg-cream'
                }`}
              >
                {targetResult.reachable ? (
                  <p>
                    Found <span className="font-semibold">{Math.round(targetResult.result.quality * 100)}%</span>{' '}
                    quality, giving{' '}
                    <span className="font-semibold">
                      {formatBytes(targetResult.result.stats.output_bytes)}
                    </span>
                    .
                  </p>
                ) : (
                  <p>
                    The target size could not be reached. The smallest result found is{' '}
                    <span className="font-semibold">
                      {formatBytes(targetResult.result.stats.output_bytes)}
                    </span>{' '}
                    at {Math.round(targetResult.result.quality * 100)}% quality. This document may
                    already have little compressible image data.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-xs">
            <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
            {notice}
          </p>
        )}

        {activeResult && activeResultFile && (
          <section
            aria-label="Compressed document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">
                {activeResult.artifact.file_name}
              </span>
              <span className="text-muted block text-xs">
                {formatBytes(activeResult.stats.original_bytes)} →{' '}
                {formatBytes(activeResult.stats.output_bytes)}
                {savedPercent > 0 ? ` · ${savedPercent}% smaller` : ' · no reduction'}
              </span>
              {activeResult.stats.images_total > 0 && (
                <span className="text-muted block text-xs">
                  {activeResult.stats.images_recompressed} of {activeResult.stats.images_total}{' '}
                  images recompressed
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setViewingResult(true)}>
                <Maximize2 aria-hidden className="size-4" />
                View
              </Button>
              <Button
                className="flex-1"
                onClick={() => downloadBlob(activeResult.artifact.blob, activeResult.artifact.file_name)}
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
            abort.current?.abort();
            setFile(null);
            setPreviewResult(null);
            setTargetResult(null);
            setNotice(null);
          }}
        >
          Choose a different file
        </Button>
      </aside>

      {viewingSource && (
        <PageDetailModal file={file} pageIndex={0} onClose={() => setViewingSource(false)} />
      )}
      {viewingResult && activeResultFile && (
        <PageDetailModal
          file={activeResultFile}
          pageIndex={0}
          onClose={() => setViewingResult(false)}
        />
      )}
    </div>
  );
}
