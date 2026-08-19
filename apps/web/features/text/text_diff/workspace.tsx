'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  Check,
  Clipboard,
  Copy,
  Download,
  Info,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Notice, StatGrid, StatTile } from '@/components/text/control_panel';
import { NumberedTextarea } from '@/components/text/numbered_textarea';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  computeDiff,
  type DiffOptions,
  type DiffResult,
  type DiffSideBySideRow,
  type DiffUnifiedLine,
} from '@/lib/text/text_diff';
import { cn } from '@/lib/utils/cn';

const PLACEHOLDER_LEFT = 'Paste or type the original text here…';
const PLACEHOLDER_RIGHT = 'Paste or type the modified text here…';
type ViewMode = 'side_by_side' | 'unified' | 'summary';

function OptionRadioRow({
  label,
  description,
  checked,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="radio"
        name="diff-view-mode"
        checked={checked}
        onChange={onSelect}
        className="accent-brand mt-0.5 size-4"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-muted block text-xs">{description}</span>
      </span>
    </label>
  );
}

function LegendDot({ colorClassName, label }: { colorClassName: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', colorClassName)} />
      {label}
    </span>
  );
}

function countLinesAndCharacters(value: string) {
  return { lines: value === '' ? 0 : value.split('\n').length, characters: value.length };
}

export function TextDiffWorkspace() {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('side_by_side');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const leftFileInput = useRef<HTMLInputElement | null>(null);
  const rightFileInput = useRef<HTMLInputElement | null>(null);

  const options: DiffOptions = { ignore_case: ignoreCase, ignore_whitespace: ignoreWhitespace };
  const result: DiffResult = useMemo(
    () => computeDiff(original, modified, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original, modified, ignoreCase, ignoreWhitespace],
  );

  const leftCounts = countLinesAndCharacters(original);
  const rightCounts = countLinesAndCharacters(modified);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  async function uploadTo(side: 'left' | 'right', file: File) {
    setNotice(null);
    try {
      const text = await importTextFile(file);
      if (side === 'left') setOriginal(text);
      else setModified(text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }

  async function pasteTo(side: 'left' | 'right') {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      if (side === 'left') setOriginal(text);
      else setModified(text);
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  function swapSides() {
    setOriginal(modified);
    setModified(original);
  }

  function unifiedDiffText(): string {
    return result.unified
      .map((line) => `${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}${line.text}`)
      .join('\n');
  }

  async function copyResult() {
    await navigator.clipboard.writeText(unifiedDiffText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadResult() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.text-diff');
      const output = await processor(
        {
          files: [],
          text: original,
          options: { ...options, modified_text: modified },
        },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const summaryLine = (
    <p className="flex flex-wrap items-center gap-3 text-xs font-medium">
      <span className="text-success">{result.summary.added} added</span>
      <span className="text-danger">{result.summary.removed} removed</span>
      <span className="text-warning">{result.summary.modified} changed</span>
    </p>
  );

  const viewTabs = (
    <div className="border-border flex rounded-full border p-0.5 text-xs">
      {(
        [
          ['side_by_side', 'Side by Side'],
          ['unified', 'Unified View'],
          ['summary', 'Summary'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setViewMode(value)}
          aria-pressed={viewMode === value}
          className={cn(
            'rounded-full px-2.5 py-1 font-medium transition-colors',
            viewMode === value ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  function sideBySideCell(row: DiffSideBySideRow, side: 'left' | 'right') {
    const cell = side === 'left' ? row.left : row.right;
    const isChanged =
      (side === 'left' && (row.type === 'removed' || row.type === 'modified')) ||
      (side === 'right' && (row.type === 'added' || row.type === 'modified'));
    const bg = row.type === 'modified' ? 'bg-warning/15' : isChanged ? (side === 'left' ? 'bg-danger/10' : 'bg-success/10') : '';
    const marker = row.type === 'modified' ? '~' : side === 'left' && row.type === 'removed' ? '-' : side === 'right' && row.type === 'added' ? '+' : '';
    return (
      <div className={cn('flex items-start gap-2 px-2 py-1 font-mono text-sm leading-6', bg)}>
        <span className="text-muted w-6 shrink-0 text-right text-xs">{cell?.number ?? ''}</span>
        <span
          className={cn(
            'w-3 shrink-0 text-center',
            row.type === 'modified' ? 'text-warning' : side === 'left' ? 'text-danger' : 'text-success',
          )}
        >
          {marker}
        </span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{cell?.text ?? ''}</span>
      </div>
    );
  }

  function unifiedLine(line: DiffUnifiedLine, index: number) {
    const bg = line.type === 'added' ? 'bg-success/10' : line.type === 'removed' ? 'bg-danger/10' : '';
    const marker = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
    const markerColor = line.type === 'added' ? 'text-success' : line.type === 'removed' ? 'text-danger' : 'text-muted';
    return (
      <div key={index} className={cn('flex items-start gap-2 px-2 py-1 font-mono text-sm leading-6', bg)}>
        <span className="text-muted w-6 shrink-0 text-right text-xs">{line.left_number ?? ''}</span>
        <span className="text-muted w-6 shrink-0 text-right text-xs">{line.right_number ?? ''}</span>
        <span className={cn('w-3 shrink-0 text-center', markerColor)}>{marker}</span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{line.text}</span>
      </div>
    );
  }

  const diffPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {viewTabs}
        {summaryLine}
      </div>
      {result.truncated && (
        <div className="mb-2">
          <Notice variant="info">
            Only the first 1,500 lines of each block are compared for performance.
          </Notice>
        </div>
      )}

      {viewMode === 'summary' ? (
        <StatGrid columns={2}>
          <StatTile icon={Check} label="Unchanged Lines" value={String(result.summary.unchanged)} />
          <StatTile icon={ArrowLeftRight} label="Changed Lines" value={String(result.summary.modified)} />
          <StatTile icon={Upload} label="Added Lines" value={String(result.summary.added)} />
          <StatTile icon={Trash2} label="Removed Lines" value={String(result.summary.removed)} />
        </StatGrid>
      ) : viewMode === 'side_by_side' ? (
        <div className="border-border min-h-[35vh] flex-1 overflow-y-auto rounded-2xl border">
          {result.side_by_side.length === 0 ? (
            <p className="text-muted p-4 text-sm">Add text to both blocks to see the difference.</p>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="divide-border divide-y">
                {result.side_by_side.map((row, index) => (
                  <div key={index}>{sideBySideCell(row, 'left')}</div>
                ))}
              </div>
              <div className="divide-border divide-y">
                {result.side_by_side.map((row, index) => (
                  <div key={index}>{sideBySideCell(row, 'right')}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border-border bg-background min-h-[35vh] flex-1 overflow-y-auto rounded-2xl border">
          {result.unified.length === 0 ? (
            <p className="text-muted p-4 text-sm">Add text to both blocks to see the difference.</p>
          ) : (
            <div className="divide-border divide-y">{result.unified.map(unifiedLine)}</div>
          )}
        </div>
      )}
      {notice && <p className="text-danger mt-2 text-xs">{notice}</p>}
    </div>
  );

  const legend = (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Diff Highlight</p>
      <LegendDot colorClassName="bg-success" label="Added" />
      <LegendDot colorClassName="bg-danger" label="Removed" />
      <LegendDot colorClassName="bg-warning" label="Modified" />
    </div>
  );

  const optionsPanel = (
    <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4">
      <div>
        <p className="text-sm font-semibold">Comparison Options</p>
        <p className="text-muted text-xs">Choose how you want to compare.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold">View Mode</p>
        <OptionRadioRow
          label="Side by Side"
          description="Show differences in two columns."
          checked={viewMode === 'side_by_side'}
          onSelect={() => setViewMode('side_by_side')}
        />
        <OptionRadioRow
          label="Unified View"
          description="Show changes in a single view."
          checked={viewMode === 'unified'}
          onSelect={() => setViewMode('unified')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Ignore Options</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ignoreCase}
            onChange={(event) => setIgnoreCase(event.target.checked)}
            className="accent-brand size-4"
          />
          Ignore case
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(event) => setIgnoreWhitespace(event.target.checked)}
            className="accent-brand size-4"
          />
          Ignore whitespace changes
        </label>
      </div>

      {legend}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copyResult}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button className="flex-1" onClick={downloadResult}>
          <Download aria-hidden className="size-4" />
          Download
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Compare Text</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={swapSides}
              aria-label="Swap left and right text"
              className="text-muted hover:text-foreground"
            >
              <ArrowLeftRight aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand diff view"
              className="text-muted hover:text-foreground"
            >
              <Maximize2 aria-hidden className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => leftFileInput.current?.click()}>
                <Upload aria-hidden className="size-4" />
                Upload
              </Button>
              <Button variant="secondary" size="sm" onClick={() => pasteTo('left')}>
                <Clipboard aria-hidden className="size-4" />
                Paste
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOriginal('')} disabled={original === ''}>
                <Trash2 aria-hidden className="size-4" />
                Clear
              </Button>
              <input
                ref={leftFileInput}
                type="file"
                accept={TEXT_IMPORT_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadTo('left', file);
                }}
              />
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Text Block 1 (Original)</p>
              <p className="text-muted text-xs">
                {leftCounts.lines} lines · {leftCounts.characters} characters
              </p>
            </div>
            <NumberedTextarea
              value={original}
              onChange={setOriginal}
              placeholder={PLACEHOLDER_LEFT}
              minHeightClassName="min-h-[30vh]"
            />
          </div>
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => rightFileInput.current?.click()}>
                <Upload aria-hidden className="size-4" />
                Upload
              </Button>
              <Button variant="secondary" size="sm" onClick={() => pasteTo('right')}>
                <Clipboard aria-hidden className="size-4" />
                Paste
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setModified('')} disabled={modified === ''}>
                <Trash2 aria-hidden className="size-4" />
                Clear
              </Button>
              <input
                ref={rightFileInput}
                type="file"
                accept={TEXT_IMPORT_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadTo('right', file);
                }}
              />
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Text Block 2 (Modified)</p>
              <p className="text-muted text-xs">
                {rightCounts.lines} lines · {rightCounts.characters} characters
              </p>
            </div>
            <NumberedTextarea
              value={modified}
              onChange={setModified}
              placeholder={PLACEHOLDER_RIGHT}
              minHeightClassName="min-h-[30vh]"
            />
          </div>
        </div>

        {diffPanel}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        {optionsPanel}
        <div className="border-border bg-cream/40 flex flex-col gap-2 rounded-2xl border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info aria-hidden className="text-brand size-4" />
            About Text Diff
          </p>
          <p className="text-muted text-xs">
            This tool compares two blocks of text and shows the differences.
          </p>
          <p className="text-success flex items-center gap-1.5 text-xs">
            <span aria-hidden className="bg-success size-1.5 rounded-full" />
            Green: Added text
          </p>
          <p className="text-danger flex items-center gap-1.5 text-xs">
            <span aria-hidden className="bg-danger size-1.5 rounded-full" />
            Red: Removed text
          </p>
          <p className="text-warning flex items-center gap-1.5 text-xs">
            <span aria-hidden className="bg-warning size-1.5 rounded-full" />
            Yellow: Modified text
          </p>
        </div>
      </aside>

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded diff view"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Difference</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded diff view"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              {diffPanel}
              <div className="overflow-y-auto">{optionsPanel}</div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
