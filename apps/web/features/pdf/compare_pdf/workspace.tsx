'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Download,
  FileText,
  GitCompare,
  Loader2,
  Maximize2,
  TriangleAlert,
} from 'lucide-react';
import { safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPagesFrom } from '@/lib/pdf/pdf_pages';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { groupDiffIntoChangeCards } from './diff_to_change_cards';
import type { CompareReport } from './processor';

const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: 200 * 1024 * 1024,
};

const PAGE_WIDTH = 420;

type PageSlot = { status: 'pending' } | { status: 'ready'; src: string } | { status: 'error' };
const PENDING: PageSlot = { status: 'pending' };

/**
 * Two documents side by side rather than one document plus a control panel — the layout every
 * other PDF workspace shares does not fit a tool whose whole job is comparing two files. See
 * `features/pdf/compare_pdf/processor.ts` for what "changed" means here (text content, not
 * pixels). Once a report comes back, the two file pickers give way to a pair of scroll synced
 * page viewers plus a change report panel, mirroring a code diff review layout.
 */
export function ComparePdfWorkspace() {
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [report, setReport] = useState<CompareReport | null>(null);

  const [beforePages, setBeforePages] = useState<PageSlot[]>([]);
  const [afterPages, setAfterPages] = useState<PageSlot[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [viewingBefore, setViewingBefore] = useState(false);
  const [viewingAfter, setViewingAfter] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const beforeScrollRef = useRef<HTMLDivElement | null>(null);
  const afterScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => () => abort.current?.abort(), []);

  // Once a report exists, rasterise both documents' pages for the two synced viewers. Object
  // URLs are tracked and revoked on every re-run and on unmount so a repeat comparison never
  // leaks the previous pair of documents.
  useEffect(() => {
    if (!report || !before || !after) return;
    const controller = new AbortController();
    let live = true;
    const beforeUrls = new Set<string>();
    const afterUrls = new Set<string>();

    function grow(current: PageSlot[], index: number): PageSlot[] {
      return current.length > index
        ? [...current]
        : [...current, ...Array(index - current.length + 1).fill(PENDING)];
    }

    readPdfPagesFrom(
      before,
      0,
      (page) => {
        if (!live) return;
        if (page.thumbnail) beforeUrls.add(page.thumbnail);
        setBeforePages((current) => {
          const next = grow(current, page.index);
          next[page.index] = page.thumbnail
            ? { status: 'ready', src: page.thumbnail }
            : { status: 'error' };
          return next;
        });
      },
      controller.signal,
      PAGE_WIDTH,
      (total) => {
        if (!live) return;
        setBeforePages((current) => (current.length >= total ? current : Array(total).fill(PENDING)));
      },
    ).catch(() => {});

    readPdfPagesFrom(
      after,
      0,
      (page) => {
        if (!live) return;
        if (page.thumbnail) afterUrls.add(page.thumbnail);
        setAfterPages((current) => {
          const next = grow(current, page.index);
          next[page.index] = page.thumbnail
            ? { status: 'ready', src: page.thumbnail }
            : { status: 'error' };
          return next;
        });
      },
      controller.signal,
      PAGE_WIDTH,
      (total) => {
        if (!live) return;
        setAfterPages((current) => (current.length >= total ? current : Array(total).fill(PENDING)));
      },
    ).catch(() => {});

    return () => {
      live = false;
      controller.abort();
      for (const url of beforeUrls) URL.revokeObjectURL(url);
      for (const url of afterUrls) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const busy = progress !== null;
  const canRun = before !== null && after !== null && !busy;

  async function run() {
    if (!before || !after || !canRun) return;
    setNotice(null);
    setReport(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.compare-pdf');
      const output = await processor(
        { files: [before, after], options: {} },
        { signal: controller.signal, on_progress: setProgress },
      );
      if (output.text) setReport(JSON.parse(output.text) as CompareReport);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'These documents could not be compared.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  function reset() {
    setBefore(null);
    setAfter(null);
    setReport(null);
    setNotice(null);
    setBeforePages([]);
    setAfterPages([]);
  }

  function handleScroll(source: 'before' | 'after') {
    if (!syncEnabled) return;
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    const sourceEl = source === 'before' ? beforeScrollRef.current : afterScrollRef.current;
    const targetEl = source === 'before' ? afterScrollRef.current : beforeScrollRef.current;
    if (!sourceEl || !targetEl) return;

    const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight;
    const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) return;

    const ratio = sourceEl.scrollTop / sourceMax;
    syncingRef.current = true;
    targetEl.scrollTop = ratio * targetMax;
  }

  function downloadReport() {
    if (!report || !before || !after) return;
    downloadBlob(new Blob([buildReportText(report, before.name, after.name)], { type: 'text/plain' }), 'compare-report.txt');
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (!report) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FileSlot
            label="Document 1"
            file={before}
            rule={RULE}
            onFile={(file) => {
              setBefore(file);
              setReport(null);
            }}
          />
          <FileSlot
            label="Document 2"
            file={after}
            rule={RULE}
            onFile={(file) => {
              setAfter(file);
              setReport(null);
            }}
          />
        </div>

        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
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

        <Button onClick={run} disabled={!canRun} className="h-12 w-full max-w-xs text-base">
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <GitCompare aria-hidden className="size-4" />
          )}
          {busy ? `Comparing ${percent}%` : 'Compare PDFs'}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
      <DocumentColumn
        label="Document 1"
        file={before}
        pages={beforePages}
        scrollRef={beforeScrollRef}
        onScroll={() => handleScroll('before')}
        onView={() => setViewingBefore(true)}
      />
      <DocumentColumn
        label="Document 2"
        file={after}
        pages={afterPages}
        scrollRef={afterScrollRef}
        onScroll={() => handleScroll('after')}
        onView={() => setViewingAfter(true)}
      />

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Change report</p>
            <p className="text-muted text-xs">This compares extracted text, not page appearance.</p>
          </div>
          <button
            type="button"
            onClick={() => setSyncEnabled((value) => !value)}
            aria-pressed={syncEnabled}
            title="Sync scrolling between documents"
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              syncEnabled
                ? 'bg-brand border-brand text-on-brand'
                : 'border-border text-muted hover:text-foreground'
            }`}
          >
            <ArrowLeftRight aria-hidden className="size-3.5" />
            Sync
          </button>
        </div>

        <p className="text-sm font-semibold">
          {report.changedPages} of {report.pageCount} page{report.pageCount === 1 ? '' : 's'} differ
        </p>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {report.changedPages === 0 && (
            <p className="text-muted text-sm">No differences found in the text content.</p>
          )}
          {report.pages
            .filter((page) => page.changed)
            .map((page) => (
              <div key={page.pageIndex} className="flex flex-col gap-2">
                <p className="text-muted text-xs font-semibold">Page {page.pageIndex + 1}</p>
                {groupDiffIntoChangeCards(page.diff).map((card) => (
                  <ChangeCard key={`${page.pageIndex}-${card.id}`} card={card} />
                ))}
              </div>
            ))}
        </div>

        <Button variant="secondary" onClick={downloadReport} className="w-full">
          <Download aria-hidden className="size-4" />
          Download report
        </Button>

        <Button size="sm" variant="ghost" onClick={reset}>
          Compare different files
        </Button>
      </aside>

      {viewingBefore && before && (
        <PageDetailModal file={before} pageIndex={0} onClose={() => setViewingBefore(false)} />
      )}
      {viewingAfter && after && (
        <PageDetailModal file={after} pageIndex={0} onClose={() => setViewingAfter(false)} />
      )}
    </div>
  );
}

function DocumentColumn({
  label,
  file,
  pages,
  scrollRef,
  onScroll,
  onView,
}: {
  label: string;
  file: File | null;
  pages: PageSlot[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onView: () => void;
}) {
  if (!file) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted min-w-0 truncate text-sm">
          <span className="text-foreground font-semibold">{label}</span> ·{' '}
          {safeFileName(file.name)}
        </p>
        <button
          type="button"
          onClick={onView}
          aria-label={`View ${safeFileName(file.name)}`}
          title="View the full document"
          className="bg-surface border-border text-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-full border"
        >
          <Maximize2 aria-hidden className="size-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="border-border bg-cream flex max-h-[75vh] flex-col items-center gap-4 overflow-y-auto rounded-xl border p-3"
      >
        {pages.length === 0 && (
          <div className="flex min-h-[240px] items-center justify-center">
            <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
          </div>
        )}
        {pages.map((slot, index) => (
          <div key={index} className="flex w-full flex-col items-center gap-1.5">
            <span className="text-muted text-xs font-medium">Page {index + 1}</span>
            <div className="flex min-h-[240px] w-full items-center justify-center">
              {slot.status === 'ready' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.src}
                  alt={`Page ${index + 1}`}
                  className="max-w-full rounded shadow-sm"
                />
              )}
              {slot.status === 'error' && (
                <span className="text-muted flex flex-col items-center gap-1.5 text-xs">
                  <TriangleAlert aria-hidden className="size-4" />
                  Page {index + 1} could not be rendered
                </span>
              )}
              {slot.status === 'pending' && (
                <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileSlot({
  label,
  file,
  rule,
  onFile,
}: {
  label: string;
  file: File | null;
  rule: FileRule;
  onFile: (file: File) => void;
}) {
  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 text-sm">
          <FileText aria-hidden className="text-muted size-5 shrink-0" />
          <span className="truncate">{safeFileName(file.name)}</span>
        </div>
      ) : (
        <FileUpload
          rule={rule}
          accept="application/pdf,.pdf"
          onFiles={(files) => files[0] && onFile(files[0])}
        />
      )}
    </div>
  );
}

function ChangeCard({ card }: { card: ReturnType<typeof groupDiffIntoChangeCards>[number] }) {
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      {card.oldLines.length > 0 && (
        <div className="bg-danger/10 p-2.5">
          <span className="bg-danger/20 text-danger mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold">
            −{card.oldLines.length}
          </span>
          {card.oldLines.map((line, index) => (
            <p key={index} className="text-danger font-mono text-xs break-words">
              {line}
            </p>
          ))}
        </div>
      )}
      {card.newLines.length > 0 && (
        <div className="bg-success/10 p-2.5">
          <span className="bg-success/20 text-success mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold">
            +{card.newLines.length}
          </span>
          {card.newLines.map((line, index) => (
            <p key={index} className="text-success font-mono text-xs break-words">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function buildReportText(report: CompareReport, beforeName: string, afterName: string): string {
  const lines: string[] = [
    'Compare PDF report',
    `Document 1: ${safeFileName(beforeName)}`,
    `Document 2: ${safeFileName(afterName)}`,
    `${report.changedPages} of ${report.pageCount} page${report.pageCount === 1 ? '' : 's'} differ`,
    'This compares extracted text, not page appearance.',
    '',
  ];

  const changedPages = report.pages.filter((page) => page.changed);
  if (changedPages.length === 0) {
    lines.push('No differences found.');
    return lines.join('\n');
  }

  for (const page of changedPages) {
    lines.push(`Page ${page.pageIndex + 1}`);
    for (const card of groupDiffIntoChangeCards(page.diff)) {
      for (const line of card.oldLines) lines.push(`  - ${line}`);
      for (const line of card.newLines) lines.push(`  + ${line}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
