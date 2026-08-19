'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Download, Info, LayoutGrid, Loader2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { PageGrid, type PageGridItem } from '@/components/pdf/page_grid';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPages } from '@/lib/pdf/pdf_pages';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = { mime_types: ['application/pdf'], extensions: ['pdf'], max_files: 1, max_bytes: MAX_BYTES };

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

export function OrganizePdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageGridItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [zoomPage, setZoomPage] = useState<number | null>(null);

  const hintId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const abort = useRef<AbortController | null>(null);
  const thumbnails = useRef(new Set<string>());

  const pagesRef = useRef<PageGridItem[]>([]);
  const commit = useCallback((next: PageGridItem[] | ((current: PageGridItem[]) => PageGridItem[])) => {
    const value = typeof next === 'function' ? next(pagesRef.current) : next;
    pagesRef.current = value;
    setPages(value);
  }, []);

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
    commit([]);
    setPageCount(0);

    const controller = new AbortController();
    abort.current = controller;
    try {
      const total = await readPdfPages(
        next,
        (page) => {
          if (page.thumbnail) thumbnails.current.add(page.thumbnail);
          commit((current) => [
            ...current,
            { id: `page-${page.index}`, pageIndex: page.index, thumbnail: page.thumbnail, rotation: 0, selected: false },
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

  const rotate = useCallback(
    (id: string) => {
      setResult(null);
      commit((current) =>
        current.map((page) =>
          page.id === id ? { ...page, rotation: ((page.rotation + 90) % 360) as PageGridItem['rotation'] } : page,
        ),
      );
    },
    [commit],
  );

  const removeOne = useCallback(
    (id: string) => {
      setResult(null);
      commit((current) => current.filter((page) => page.id !== id));
    },
    [commit],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      setResult(null);
      commit((current) => move(current, from, to));
    },
    [commit],
  );

  const busy = progress !== null;
  const canRun = pages.length > 0 && !busy;

  const drag = useRef<{ id: string; x: number; y: number; node: HTMLElement } | null>(null);

  const endDrag = useCallback(() => {
    if (drag.current) drag.current.node.style.transform = '';
    drag.current = null;
    setDraggingId(null);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = drag.current;
      const list = listRef.current;
      if (!state || !list) return;

      state.node.style.transform = `translate(${event.clientX - state.x}px, ${event.clientY - state.y}px)`;

      const cards = [...list.children].filter((child): child is HTMLElement => child.hasAttribute('data-card'));
      const from = cards.indexOf(state.node);
      const over = cards.findIndex((card) => {
        if (card === state.node) return false;
        const box = card.getBoundingClientRect();
        return (
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom
        );
      });

      if (from !== -1 && over !== -1) {
        reorder(from, over);
        state.x = event.clientX;
        state.y = event.clientY;
        state.node.style.transform = '';
      }
    },
    [reorder],
  );

  useEffect(() => {
    if (!draggingId) return;
    const up = () => endDrag();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [draggingId, onPointerMove, endDrag]);

  function startDrag(event: React.PointerEvent<HTMLLIElement>, id: string) {
    if (busy || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-no-drag]')) return;
    if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return;

    const node = event.currentTarget;
    event.preventDefault();
    drag.current = { id, x: event.clientX, y: event.clientY, node };
    setDraggingId(id);
  }

  function onHandleKeyDown(event: React.KeyboardEvent, index: number) {
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!back && !forward) return;
    event.preventDefault();
    reorder(index, index + (back ? -1 : 1));
  }

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.organize-pdf');
      const order = pages.map((page) => ({ index: page.pageIndex, rotation: page.rotation }));
      const output = await processor(
        { files: [file], options: { order } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact, pages: Number(output.text ?? 0) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be completed.');
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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <p className="text-muted mb-3 text-sm" aria-describedby={hintId}>
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount > 0 ? `${pages.length} of ${pageCount} pages` : 'Reading…'}
        </p>
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <PageGrid
            items={pages}
            rotatable
            removable
            draggable
            zoomable
            busy={busy}
            draggingId={draggingId}
            onRotate={rotate}
            onRemove={removeOne}
            onZoom={setZoomPage}
            onPointerDown={startDrag}
            onHandleKeyDown={onHandleKeyDown}
            listRef={listRef}
            hintId={hintId}
          />
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p id={hintId} className="bg-cream text-ink/80 flex items-start gap-2 rounded-xl p-3 text-xs">
          <Info aria-hidden className="text-brand-strong mt-px size-4 shrink-0" />
          Click a page to view it. Drag the handle to reorder pages, and use the rotate or
          delete icons to change one. Changes only take effect once you export.
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
              <div className="bg-brand h-full rounded-full transition-[width] duration-200" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-muted mt-1.5 text-xs">
              {progress?.label ?? 'Working'} · {percent}%
            </p>
          </div>
        )}

        <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <LayoutGrid aria-hidden className="size-4" />}
          {busy ? `Rebuilding ${percent}%` : 'Export PDF'}
        </Button>

        {result && (
          <section aria-label="Organized document" className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} pages · {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <Button className="w-full" onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </section>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            for (const url of thumbnails.current) URL.revokeObjectURL(url);
            thumbnails.current.clear();
            setFile(null);
            commit([]);
            setResult(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {zoomPage !== null && file && (
        <PageDetailModal
          file={file}
          pageIndex={zoomPage}
          rotations={Object.fromEntries(pages.map((page) => [page.pageIndex, page.rotation]))}
          onClose={() => setZoomPage(null)}
        />
      )}
    </div>
  );
}
