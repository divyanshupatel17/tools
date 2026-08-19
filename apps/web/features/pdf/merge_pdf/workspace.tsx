'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Download,
  Files,
  FileText,
  GripVertical,
  Info,
  Loader2,
  Maximize2,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { formatBytes, safeFileName, validateFiles, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_FILES = 30;
const MAX_BYTES = 200 * 1024 * 1024;

const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: MAX_FILES,
  max_bytes: MAX_BYTES,
};

interface Item {
  id: string;
  file: File;
  pages: number | null;
  thumbnail: string | null;
  status: 'reading' | 'ready' | 'error';
}

interface Result {
  artifact: ProcessorArtifact;
  pages: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

export function MergePdfWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [outputName, setOutputName] = useState('merged');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<Item | null>(null);

  const hintId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const thumbnails = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  /**
   * The list is mirrored in a ref. Deriving new items inside a setState updater made
   * the ids depend on when React chose to run it, and a re-invoked updater left the
   * preview loop chasing ids that were never committed, so those cards span forever.
   */
  const itemsRef = useRef<Item[]>([]);
  const commit = useCallback((next: Item[] | ((current: Item[]) => Item[])) => {
    const value = typeof next === 'function' ? next(itemsRef.current) : next;
    itemsRef.current = value;
    setItems(value);
  }, []);

  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of thumbnails.current) URL.revokeObjectURL(url);
      thumbnails.current.clear();
    },
    [],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      setResult(null);

      const check = validateFiles(files, { ...RULE, max_files: undefined });
      if (!check.ok) {
        setNotice(check.errors[0] ?? 'Those files could not be added.');
        return;
      }
      setNotice(null);

      const room = MAX_FILES - itemsRef.current.length;
      if (room <= 0) {
        setNotice(`You can merge at most ${MAX_FILES} PDFs at a time.`);
        return;
      }
      if (files.length > room) {
        setNotice(`Only ${room} more file${room === 1 ? '' : 's'} fit; the limit is ${MAX_FILES}.`);
      }

      const accepted: Item[] = files.slice(0, room).map((file) => {
        sequence.current += 1;
        return {
          id: `pdf-${sequence.current}`,
          file,
          pages: null,
          thumbnail: null,
          status: 'reading' as const,
        };
      });

      commit((current) => [...current, ...accepted]);

      // Read one at a time so a 30-file drop cannot stall the main thread.
      void (async () => {
        for (const item of accepted) {
          try {
            const preview = await readPdfPreview(item.file);
            if (preview.thumbnail) thumbnails.current.add(preview.thumbnail);
            commit((current) =>
              current.map((entry) =>
                entry.id === item.id ? { ...entry, ...preview, status: 'ready' as const } : entry,
              ),
            );
          } catch {
            commit((current) =>
              current.map((entry) =>
                entry.id === item.id ? { ...entry, status: 'error' as const } : entry,
              ),
            );
          }
        }
      })();
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      setResult(null);
      commit((current) => {
        const target = current.find((item) => item.id === id);
        if (target?.thumbnail) {
          URL.revokeObjectURL(target.thumbnail);
          thumbnails.current.delete(target.thumbnail);
        }
        return current.filter((item) => item.id !== id);
      });
    },
    [commit],
  );

  const clearAll = useCallback(() => {
    setResult(null);
    setNotice(null);
    for (const url of thumbnails.current) URL.revokeObjectURL(url);
    thumbnails.current.clear();
    commit([]);
  }, [commit]);

  const sortBy = useCallback(
    (direction: 'asc' | 'desc') => {
      setResult(null);
      commit((current) =>
        [...current].sort(
          (a, b) => collator.compare(a.file.name, b.file.name) * (direction === 'asc' ? 1 : -1),
        ),
      );
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

  const readable = items.filter((item) => item.status !== 'error');
  const totalPages = readable.reduce((sum, item) => sum + (item.pages ?? 0), 0);
  const totalBytes = readable.reduce((sum, item) => sum + item.file.size, 0);
  const stillReading = items.some((item) => item.status === 'reading');
  const busy = progress !== null;
  const canMerge = readable.length >= 2 && !stillReading && !busy;

  /**
   * Pointer dragging rather than the HTML5 API: no translucent clone follows the
   * cursor, the real card lifts and moves, and touch works without a fallback.
   */
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

      state.node.style.transform = `translate(${event.clientX - state.x}px, ${
        event.clientY - state.y
      }px)`;

      const cards = [...list.children].filter((child): child is HTMLElement =>
        child.hasAttribute('data-card'),
      );
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
        // Re-anchor to the pointer so the lifted card stays under it after the shuffle.
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

    // Touch drags start from the handle only, so the page can still be scrolled
    // by swiping across a grid that fills the screen.
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

  async function merge() {
    if (!canMerge) return;
    setNotice(null);
    setResult(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.merge-pdf');
      const output = await processor(
        { files: readable.map((item) => item.file), options: { file_name: outputName } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) setResult({ artifact, pages: Number(output.text ?? 0) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The merge failed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} multiple accept="application/pdf,.pdf" onFiles={addFiles} />
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
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) addFiles(Array.from(event.dataTransfer.files));
        }}
        className="border-border bg-surface rounded-2xl border p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Files aria-hidden className="text-muted size-4" />
            Files
            <span className="text-muted font-normal">· drag to reorder</span>
          </span>
          <p className="text-muted text-sm">
            <span className="text-foreground font-semibold">{items.length}</span> of {MAX_FILES}{' '}
            files
            {totalPages > 0 && (
              <>
                {' · '}
                <span className="text-foreground font-semibold">{totalPages}</span> pages
              </>
            )}
            {' · '}
            {formatBytes(totalBytes)}
          </p>
        </div>

        <ol
          ref={listRef}
          className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5"
          aria-describedby={hintId}
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              data-card
              onPointerDown={(event) => startDrag(event, item.id)}
              className={`border-border bg-surface relative flex touch-pan-y flex-col rounded-xl border p-1.5 select-none ${
                draggingId === item.id
                  ? 'z-20 scale-105 cursor-grabbing shadow-lg'
                  : 'z-0 cursor-grab transition-transform'
              }`}
            >
              <span className="bg-cream relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg">
                {item.status === 'reading' && (
                  <Loader2 aria-hidden className="text-muted size-4 animate-spin" />
                )}
                {item.status === 'error' && (
                  <TriangleAlert aria-hidden className="text-danger size-5" />
                )}
                {item.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="size-full object-contain"
                    draggable={false}
                  />
                )}
                <span className="bg-brand text-ink absolute top-1 left-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold">
                  {index + 1}
                </span>
                {item.status === 'ready' && (
                  <button
                    type="button"
                    data-no-drag
                    disabled={busy}
                    onClick={() => setViewItem(item)}
                    aria-label={`View ${safeFileName(item.file.name)}`}
                    title="View this document"
                    className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
                  >
                    <Maximize2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </span>

              <span
                className="mt-1.5 truncate text-[11px] font-semibold"
                title={safeFileName(item.file.name)}
              >
                {safeFileName(item.file.name)}
              </span>
              <span className="text-muted text-[10.5px]">
                {item.status === 'error'
                  ? 'Unreadable'
                  : `${item.pages ?? '·'} pp · ${formatBytes(item.file.size)}`}
              </span>

              <span className="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  data-drag-handle
                  onKeyDown={(event) => onHandleKeyDown(event, index)}
                  disabled={busy}
                  aria-label={`Reorder ${safeFileName(item.file.name)}, position ${index + 1} of ${items.length}`}
                  aria-describedby={hintId}
                  className="text-muted hover:text-foreground flex size-7 cursor-grab touch-none items-center justify-center rounded-lg disabled:opacity-40"
                >
                  <GripVertical aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  data-no-drag
                  onClick={() => remove(item.id)}
                  disabled={busy}
                  aria-label={`Remove ${safeFileName(item.file.name)}`}
                  className="text-muted hover:text-danger flex size-7 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </span>
            </li>
          ))}

          <li className="flex">
            <button
              type="button"
              onClick={() => addInputRef.current?.click()}
              disabled={busy || items.length >= MAX_FILES}
              className="border-border hover:border-brand text-muted hover:text-foreground flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Plus aria-hidden className="size-5" />
              Add more
            </button>
            <input
              ref={addInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </li>
        </ol>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <h2 className="text-sm font-semibold">Merge options</h2>

        <p
          id={hintId}
          className="bg-cream text-ink/80 flex items-start gap-2 rounded-xl p-3 text-xs"
        >
          <Info aria-hidden className="text-brand-strong mt-px size-4 shrink-0" />
          Drag any card to change the order. On a phone, drag from the handle. You can also focus a
          handle and use the arrow keys.
        </p>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => sortBy('asc')}
            disabled={busy}
          >
            <ArrowDownAZ aria-hidden className="size-4" />A to Z
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => sortBy('desc')}
            disabled={busy}
          >
            <ArrowUpAZ aria-hidden className="size-4" />Z to A
          </Button>
        </div>

        <label className="text-sm">
          <span className="font-semibold">File name</span>
          <span className="border-border bg-background mt-1.5 flex h-11 items-center rounded-full border px-4">
            <input
              name="output-name"
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              disabled={busy}
              className="w-full min-w-0 bg-transparent outline-none"
            />
            <span className="text-muted shrink-0">.pdf</span>
          </span>
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
              aria-label="Merge progress"
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

        <Button onClick={merge} disabled={!canMerge} className="h-12 w-full text-base">
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <FileText aria-hidden className="size-4" />
          )}
          {busy ? `Merging ${percent}%` : 'Merge PDF'}
        </Button>

        {result && (
          <section
            aria-label="Merged document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.pages} pages · {formatBytes(result.artifact.blob.size)}
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

        <Button size="sm" variant="ghost" onClick={clearAll} disabled={busy}>
          Clear all
        </Button>
      </aside>

      {viewItem && <PageDetailModal file={viewItem.file} pageIndex={0} onClose={() => setViewItem(null)} />}
    </div>
  );
}
