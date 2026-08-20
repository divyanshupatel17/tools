'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, FileCode2, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, validateFiles, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import type { TypesetPageSize } from '@/lib/pdf/pdf_typeset';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_FILES = 20;
const MAX_BYTES = 25 * 1024 * 1024;

const RULE: FileRule = {
  mime_types: ['application/x-ipynb+json', 'application/json'],
  extensions: ['ipynb'],
  max_files: MAX_FILES,
  max_bytes: MAX_BYTES,
};

const MARGINS: Array<[number, string]> = [
  [0, 'None'],
  [36, 'Normal'],
  [72, 'Wide'],
];

interface Item {
  id: string;
  file: File;
  cellCount: number | null;
}

interface Result {
  artifact: ProcessorArtifact;
  count: number;
}

function countCells(file: File): Promise<number | null> {
  return file
    .text()
    .then((text) => {
      const parsed = JSON.parse(text) as { cells?: unknown[] };
      return Array.isArray(parsed.cells) ? parsed.cells.length : null;
    })
    .catch(() => null);
}

export function IpynbToPdfWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<TypesetPageSize>('a4');
  const [margin, setMargin] = useState(36);
  const [fontSize, setFontSize] = useState(11);
  const [outputName, setOutputName] = useState('notebooks');
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [itemResults, setItemResults] = useState<Record<string, File>>({});
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const addInputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => abort.current?.abort(), []);

  const addFiles = useCallback((files: File[]) => {
    setResult(null);
    setResultFile(null);
    setItemResults({});

    const check = validateFiles(files, { ...RULE, max_files: undefined });
    if (!check.ok) {
      setNotice(check.errors[0] ?? 'Those files could not be added.');
      return;
    }
    setNotice(null);

    setItems((current) => {
      const room = MAX_FILES - current.length;
      if (room <= 0) {
        setNotice(`You can convert at most ${MAX_FILES} notebooks at a time.`);
        return current;
      }
      if (files.length > room) {
        setNotice(`Only ${room} more notebook${room === 1 ? '' : 's'} fit; the limit is ${MAX_FILES}.`);
      }

      const accepted = files.slice(0, room).map((file) => {
        sequence.current += 1;
        const item: Item = { id: `nb-${sequence.current}`, file, cellCount: null };
        void countCells(file).then((count) => {
          setItems((latest) => latest.map((entry) => (entry.id === item.id ? { ...entry, cellCount: count } : entry)));
        });
        return item;
      });

      return [...current, ...accepted];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setResult(null);
    setResultFile(null);
    setItemResults({});
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setResult(null);
    setResultFile(null);
    setItemResults({});
    setNotice(null);
    setItems([]);
  }, []);

  const busy = progress !== null;
  const canRun = items.length > 0 && !busy;

  async function run() {
    if (!canRun) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setItemResults({});
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;
    const runItems = items;

    try {
      const processor = await loadProcessor('pdf.ipynb-to-pdf');
      const output = await processor(
        {
          files: runItems.map((item) => item.file),
          options: {
            page_size: pageSize,
            margin,
            font_size: fontSize,
            file_name: outputName,
          },
        },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, count: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }

      // Single notebook: the one artifact is already its PDF. Multiple notebooks: the zip is
      // artifacts[0] and each notebook's own PDF follows in the same order as `runItems`.
      const perNotebook = runItems.length === 1 ? output.artifacts.slice(0, 1) : output.artifacts.slice(1);
      const next: Record<string, File> = {};
      perNotebook.forEach((part, index) => {
        const item = runItems[index];
        if (item) next[item.id] = new File([part.blob], part.file_name, { type: part.mime_type });
      });
      setItemResults(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be completed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const viewingItem = viewingItemId ? items.find((item) => item.id === viewingItemId) : undefined;
  const viewingFile = viewingItem ? itemResults[viewingItem.id] : undefined;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} multiple accept=".ipynb,application/x-ipynb+json,application/json" onFiles={addFiles} />
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
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`border-border bg-surface rounded-2xl border p-4 ${dragging ? 'ring-brand ring-2 ring-offset-2' : ''}`}
      >
        <p className="text-muted mb-3 text-sm">
          <span className="text-foreground font-semibold">{items.length}</span> of {MAX_FILES} notebooks
          {' · '}
          {formatBytes(totalBytes)}
        </p>

        <ol className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-border bg-background flex items-center gap-3 rounded-xl border p-3"
            >
              <span className="bg-cream text-brand-strong flex size-10 shrink-0 items-center justify-center rounded-lg">
                <FileCode2 aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold" title={safeFileName(item.file.name)}>
                  {safeFileName(item.file.name)}
                </span>
                <span className="text-muted block text-xs">
                  {formatBytes(item.file.size)}
                  {item.cellCount !== null && ` · ${item.cellCount} cell${item.cellCount === 1 ? '' : 's'}`}
                </span>
              </span>
              {itemResults[item.id] && (
                <button
                  type="button"
                  onClick={() => setViewingItemId(item.id)}
                  aria-label={`View ${safeFileName(item.file.name)}`}
                  className="text-muted hover:text-foreground flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg"
                >
                  <Eye aria-hidden className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busy}
                aria-label={`Remove ${safeFileName(item.file.name)}`}
                className="text-muted hover:text-danger flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg disabled:opacity-40"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          disabled={busy || items.length >= MAX_FILES}
          className={`hover:border-brand text-muted hover:text-foreground mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-3 text-xs font-medium transition-colors disabled:opacity-40 ${
            dragging ? 'border-brand text-foreground' : 'border-border'
          }`}
        >
          <Plus aria-hidden className="size-4" />
          Add more notebooks, or drop them here
        </button>
        <input
          ref={addInputRef}
          type="file"
          multiple
          accept=".ipynb,application/x-ipynb+json,application/json"
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <label className="text-sm">
          <span className="font-semibold">Page size</span>
          <select
            name="page-size"
            value={pageSize}
            onChange={(event) => setPageSize(event.target.value as TypesetPageSize)}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Margin</span>
          <select
            name="margin"
            value={margin}
            onChange={(event) => setMargin(Number(event.target.value))}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          >
            {MARGINS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-semibold">Font size</span>
          <NumberField
            value={fontSize}
            onChange={setFontSize}
            min={8}
            max={24}
            disabled={busy}
            className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
          />
        </label>

        <label className="text-sm">
          <span className="font-semibold">{items.length > 1 ? 'Archive name' : 'File name'}</span>
          <span className="border-border bg-background mt-1.5 flex h-11 items-center rounded-full border px-4">
            <input
              name="output-name"
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              disabled={busy}
              className="w-full min-w-0 bg-transparent outline-none"
            />
            <span className="text-muted shrink-0">{items.length > 1 ? '.zip' : '.pdf'}</span>
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
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileCode2 aria-hidden className="size-4" />}
          {busy ? `Converting ${percent}%` : 'Convert to PDF'}
        </Button>

        {result && resultFile && (
          <section aria-label="Converted notebooks" className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.count} notebook{result.count === 1 ? '' : 's'} · {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}>
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            </div>
          </section>
        )}

        <Button size="sm" variant="ghost" onClick={clearAll} disabled={busy}>
          Clear all
        </Button>
      </aside>

      {viewingItem && viewingFile && (
        <PageDetailModal file={viewingFile} pageIndex={0} onClose={() => setViewingItemId(null)} />
      )}
    </div>
  );
}
