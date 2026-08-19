'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  Check,
  Clipboard,
  Copy,
  Download,
  Equal,
  Maximize2,
  Minus,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { computeDiff, type DiffLineType, type DiffOptions, type DiffResult } from '@/lib/text/text_diff';
import { LANGUAGES, languageById } from '@/features/developer/code_formatter/languages';
import { detectLanguageId } from '@/features/developer/code_formatter/detect_language';
import { cn } from '@/lib/utils/cn';

const PLACEHOLDER_LEFT = 'Paste or type the original code here…';
const PLACEHOLDER_RIGHT = 'Paste or type the modified code here…';
type ViewMode = 'side_by_side' | 'unified' | 'split';

interface HljsModule {
  getLanguage: (id: string) => unknown;
  highlight: (code: string, options: { language: string; ignoreIllegals: boolean }) => { value: string };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decorationClass(type: DiffLineType | undefined, side: 'left' | 'right'): string {
  if (type === 'modified') return 'bg-warning/15';
  if (type === 'removed' && side === 'left') return 'bg-danger/10';
  if (type === 'added' && side === 'right') return 'bg-success/10';
  return '';
}

function decorationMarker(type: DiffLineType | undefined, side: 'left' | 'right'): { marker: string; colorClassName: string } {
  if (type === 'modified') return { marker: '~', colorClassName: 'text-warning' };
  if (type === 'removed' && side === 'left') return { marker: '-', colorClassName: 'text-danger' };
  if (type === 'added' && side === 'right') return { marker: '+', colorClassName: 'text-success' };
  return { marker: '', colorClassName: 'text-muted' };
}

/**
 * An editable code panel with syntax highlighting (the same gutter plus highlighted-pre plus
 * transparent caret-only textarea technique `code_formatter`'s workspace uses) plus a per-line
 * diff decoration layer of absolutely positioned, fixed-height background strips behind the
 * text. Decorations are kept separate from the highlighted markup rather than wrapped around it,
 * since highlight.js's output for the whole file can legitimately split a single token (a block
 * comment, a template string) across several `\n`s — slicing that HTML per line to inject a
 * background would risk cutting an open tag in half.
 */
function EditableDiffPanel({
  value,
  onChange,
  hljs,
  hljsLanguage,
  lineTypes,
  side,
  placeholder,
  fillHeight,
}: {
  value: string;
  onChange: (value: string) => void;
  hljs: HljsModule | null;
  hljsLanguage: string;
  lineTypes: (DiffLineType | undefined)[];
  side: 'left' | 'right';
  placeholder: string;
  fillHeight?: boolean;
}) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const decorationsRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lines = value === '' ? [''] : value.split('\n');

  const highlightedHtml = useMemo(() => {
    if (!hljs || hljsLanguage === 'plaintext') return escapeHtml(value);
    try {
      const known = hljs.getLanguage(hljsLanguage);
      return known ? hljs.highlight(value, { language: hljsLanguage, ignoreIllegals: true }).value : escapeHtml(value);
    } catch {
      return escapeHtml(value);
    }
  }, [value, hljs, hljsLanguage]);

  function syncScrollPositions(source: HTMLElement) {
    if (gutterRef.current) gutterRef.current.scrollTop = source.scrollTop;
    if (preRef.current) {
      preRef.current.scrollTop = source.scrollTop;
      preRef.current.scrollLeft = source.scrollLeft;
    }
    if (decorationsRef.current) decorationsRef.current.scrollTop = source.scrollTop;
  }

  return (
    <div
      className={cn(
        'code-panel border-border bg-background flex resize-y overflow-hidden rounded-2xl border',
        fillHeight ? 'h-full min-h-0 flex-1' : 'h-[40vh]',
      )}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className="bg-surface-muted/40 border-border shrink-0 overflow-hidden border-r py-4 text-right text-xs leading-6 select-none"
      >
        {lines.map((_, index) => {
          const { marker, colorClassName } = decorationMarker(lineTypes[index], side);
          return (
            <div key={index} className="flex items-center justify-end gap-1.5 pr-2 pl-3">
              <span className={cn('w-2.5 shrink-0 font-mono', colorClassName)}>{marker}</span>
              <span className="text-muted w-6 shrink-0 font-mono">{index + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="relative min-w-0 flex-1">
        {/* Rendered as one normal-flow div per line — like the gutter beside it — rather than
            absolutely positioned strips. Absolutely positioned children are removed from flow
            and contribute nothing to this container's scrollHeight, which left `scrollTop`
            assignment in `syncScrollPositions` a no-op: the decorations stayed pinned to the
            viewport while the code scrolled underneath, drifting out of sync with every line.
            Normal flow rows give the container real scrollable height, so the same scrollTop
            sync that already works for the gutter and the highlighted `<pre>` works here too. */}
        <div
          ref={decorationsRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden py-4"
        >
          {lines.map((_, index) => (
            <div key={index} className={cn('h-6', decorationClass(lineTypes[index], side))} />
          ))}
        </div>
        <pre
          ref={preRef}
          aria-hidden
          className="hljs pointer-events-none absolute inset-0 m-0 overflow-auto bg-transparent p-4 font-mono text-sm leading-6 whitespace-pre"
        >
          <code
            className={`hljs${hljsLanguage !== 'plaintext' ? ` language-${hljsLanguage}` : ''}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml || '​' }}
          />
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
          onScroll={(event) => syncScrollPositions(event.currentTarget)}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          className="absolute inset-0 min-w-0 resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 whitespace-pre text-transparent caret-foreground outline-none selection:bg-brand/30"
        />
      </div>
    </div>
  );
}

function CodeLine({
  number,
  marker,
  markerColorClassName,
  bgClassName,
  hljs,
  language,
  text,
}: {
  number: number | null;
  marker: string;
  markerColorClassName: string;
  bgClassName: string;
  hljs: HljsModule | null;
  language: string;
  text: string;
}) {
  const html = useMemo(() => {
    if (!hljs || language === 'plaintext') return escapeHtml(text) || '&nbsp;';
    try {
      const known = hljs.getLanguage(language);
      const out = known ? hljs.highlight(text, { language, ignoreIllegals: true }).value : escapeHtml(text);
      return out || '&nbsp;';
    } catch {
      return escapeHtml(text) || '&nbsp;';
    }
  }, [hljs, language, text]);

  return (
    <div className={cn('flex items-start gap-2 px-2 py-0.5 font-mono text-sm leading-6', bgClassName)}>
      <span className="text-muted w-8 shrink-0 text-right text-xs select-none">{number ?? ''}</span>
      <span className={cn('w-3 shrink-0 text-center select-none', markerColorClassName)}>{marker}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function CodeDiffWorkspace() {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [languageId, setLanguageId] = useState('auto');
  const [viewMode, setViewMode] = useState<ViewMode>('side_by_side');
  const [showAdditions, setShowAdditions] = useState(true);
  const [showDeletions, setShowDeletions] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreEmptyLines, setIgnoreEmptyLines] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hljs, setHljs] = useState<HljsModule | null>(null);

  const leftFileInput = useRef<HTMLInputElement | null>(null);
  const rightFileInput = useRef<HTMLInputElement | null>(null);

  const isAuto = languageId === 'auto';
  const detectedId = useMemo(
    () => (isAuto ? detectLanguageId(original || modified) : languageId),
    [isAuto, languageId, original, modified],
  );
  const language = languageById(detectedId);

  useEffect(() => {
    let cancelled = false;
    void import('highlight.js/lib/common').then((module) => {
      if (!cancelled) setHljs(module.default as unknown as HljsModule);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const options: DiffOptions = {
    ignore_case: ignoreCase,
    ignore_whitespace: ignoreWhitespace,
    ignore_empty_lines: ignoreEmptyLines,
  };
  const result: DiffResult = useMemo(
    () => computeDiff(original, modified, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original, modified, ignoreCase, ignoreWhitespace, ignoreEmptyLines],
  );

  const leftLineTypes = useMemo(() => {
    const types: (DiffLineType | undefined)[] = [];
    for (const row of result.side_by_side) {
      if (row.left) types[row.left.number - 1] = row.type;
    }
    return types;
  }, [result]);
  const rightLineTypes = useMemo(() => {
    const types: (DiffLineType | undefined)[] = [];
    for (const row of result.side_by_side) {
      if (row.right) types[row.right.number - 1] = row.type;
    }
    return types;
  }, [result]);

  const leftLines = original === '' ? 0 : original.split('\n').length;
  const leftChars = original.length;
  const rightLines = modified === '' ? 0 : modified.split('\n').length;
  const rightChars = modified.length;

  const totalLines = result.summary.added + result.summary.removed + result.summary.modified + result.summary.unchanged;
  const addedPercent = totalLines > 0 ? (result.summary.added / totalLines) * 100 : 0;
  const removedPercent = totalLines > 0 ? (result.summary.removed / totalLines) * 100 : 0;
  const modifiedPercent = totalLines > 0 ? (result.summary.modified / totalLines) * 100 : 0;
  const unchangedPercent = totalLines > 0 ? (result.summary.unchanged / totalLines) * 100 : 0;

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

  async function copyDiff() {
    await navigator.clipboard.writeText(unifiedDiffText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadDiff() {
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.code-diff');
      const output = await processor(
        { files: [], text: original, options: { ...options, modified_text: modified } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  function splitView() {
    const rows = result.side_by_side;
    return (
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="divide-border divide-y">
          {rows.map((row, index) => (
            <CodeLine
              key={index}
              number={row.left?.number ?? null}
              marker={row.type === 'modified' ? '~' : row.type === 'removed' ? '-' : ''}
              markerColorClassName={row.type === 'modified' ? 'text-warning' : 'text-danger'}
              bgClassName={row.type === 'modified' ? 'bg-warning/15' : row.type === 'removed' ? 'bg-danger/10' : ''}
              hljs={hljs}
              language={language.hljs}
              text={row.left?.text ?? ''}
            />
          ))}
        </div>
        <div className="divide-border divide-y">
          {rows.map((row, index) => (
            <CodeLine
              key={index}
              number={row.right?.number ?? null}
              marker={row.type === 'modified' ? '~' : row.type === 'added' ? '+' : ''}
              markerColorClassName={row.type === 'modified' ? 'text-warning' : 'text-success'}
              bgClassName={row.type === 'modified' ? 'bg-warning/15' : row.type === 'added' ? 'bg-success/10' : ''}
              hljs={hljs}
              language={language.hljs}
              text={row.right?.text ?? ''}
            />
          ))}
        </div>
      </div>
    );
  }

  function unifiedView() {
    const lines = result.unified.filter((line) =>
      line.type === 'equal' ? showUnchanged : line.type === 'added' ? showAdditions : showDeletions,
    );
    if (lines.length === 0) {
      return <p className="text-muted p-4 text-sm">Add code to both sides to see the difference.</p>;
    }
    return (
      <div className="divide-border divide-y">
        {lines.map((line, index) => (
          <CodeLine
            key={index}
            number={line.left_number ?? line.right_number}
            marker={line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ''}
            markerColorClassName={
              line.type === 'added' ? 'text-success' : line.type === 'removed' ? 'text-danger' : 'text-muted'
            }
            bgClassName={line.type === 'added' ? 'bg-success/10' : line.type === 'removed' ? 'bg-danger/10' : ''}
            hljs={hljs}
            language={language.hljs}
            text={line.text}
          />
        ))}
      </div>
    );
  }

  const sideHeaders = (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="bg-danger size-2 shrink-0 rounded-full" />
        <p className="text-sm font-semibold">Original (Left)</p>
        <p className="text-muted ml-auto text-xs">
          {leftLines} lines · {leftChars} characters
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="bg-success size-2 shrink-0 rounded-full" />
        <p className="text-sm font-semibold">Modified (Right)</p>
        <p className="text-muted ml-auto text-xs">
          {rightLines} lines · {rightChars} characters
        </p>
      </div>
    </div>
  );

  const diffPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {sideHeaders}
      {result.truncated && (
        <Notice variant="info">Only the first 1,500 lines of each side are compared for performance.</Notice>
      )}
      {viewMode === 'side_by_side' ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
          <EditableDiffPanel
            value={original}
            onChange={setOriginal}
            hljs={hljs}
            hljsLanguage={language.hljs}
            lineTypes={leftLineTypes}
            side="left"
            placeholder={PLACEHOLDER_LEFT}
            fillHeight={expanded}
          />
          <EditableDiffPanel
            value={modified}
            onChange={setModified}
            hljs={hljs}
            hljsLanguage={language.hljs}
            lineTypes={rightLineTypes}
            side="right"
            placeholder={PLACEHOLDER_RIGHT}
            fillHeight={expanded}
          />
        </div>
      ) : (
        <div className="border-border bg-background min-h-[40vh] flex-1 overflow-auto rounded-2xl border">
          {viewMode === 'split' ? splitView() : unifiedView()}
        </div>
      )}
    </div>
  );

  const highlightToggles: {
    key: 'additions' | 'deletions' | 'unchanged';
    label: string;
    icon: typeof Plus;
    colorClassName: string;
    checked: boolean;
    onToggle: () => void;
  }[] = [
    { key: 'additions', label: 'Show additions', icon: Plus, colorClassName: 'text-success', checked: showAdditions, onToggle: () => setShowAdditions((v) => !v) },
    { key: 'deletions', label: 'Show deletions', icon: Minus, colorClassName: 'text-danger', checked: showDeletions, onToggle: () => setShowDeletions((v) => !v) },
    { key: 'unchanged', label: 'Show unchanged lines', icon: Equal, colorClassName: 'text-muted', checked: showUnchanged, onToggle: () => setShowUnchanged((v) => !v) },
  ];

  const optionsPanel = (
    <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4">
      <div>
        <p className="text-sm font-semibold">Diff Options</p>
        <p className="text-muted text-xs">Customize how the comparison works.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold">View</p>
        {(
          [
            ['side_by_side', 'Side by side'],
            ['unified', 'Unified'],
            ['split', 'Split'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="code-diff-view-mode"
              checked={viewMode === value}
              onChange={() => setViewMode(value)}
              className="accent-brand size-4"
            />
            {label}
          </label>
        ))}
      </div>

      <div className={cn('flex flex-col gap-2', viewMode === 'side_by_side' && 'opacity-50')}>
        <p className="text-sm font-semibold">Highlight</p>
        {highlightToggles.map((toggle) => (
          <label key={toggle.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">{toggle.label}</span>
            <span className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={toggle.checked}
                disabled={viewMode === 'side_by_side'}
                onChange={toggle.onToggle}
                className="accent-brand size-4"
              />
              <toggle.icon aria-hidden className={cn('size-3.5', toggle.colorClassName)} />
            </span>
          </label>
        ))}
        {viewMode === 'side_by_side' && (
          <p className="text-muted text-xs">Only applies to the Unified and Split views.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Comparison</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(event) => setIgnoreWhitespace(event.target.checked)}
            className="accent-brand size-4"
          />
          Ignore whitespace
        </label>
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
            checked={ignoreEmptyLines}
            onChange={(event) => setIgnoreEmptyLines(event.target.checked)}
            className="accent-brand size-4"
          />
          Ignore empty lines
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">Summary</p>
        <p className="flex items-center justify-between text-xs">
          <span className="text-muted">Total lines</span>
          <span className="font-semibold">{totalLines}</span>
        </p>
        <p className="flex items-center justify-between text-xs">
          <span className="text-success">Added</span>
          <span className="text-success font-semibold">{result.summary.added}</span>
        </p>
        <p className="flex items-center justify-between text-xs">
          <span className="text-danger">Removed</span>
          <span className="text-danger font-semibold">{result.summary.removed}</span>
        </p>
        <p className="flex items-center justify-between text-xs">
          <span className="text-warning">Modified</span>
          <span className="text-warning font-semibold">{result.summary.modified}</span>
        </p>
        <p className="flex items-center justify-between text-xs">
          <span className="text-muted">Unchanged</span>
          <span className="font-semibold">{result.summary.unchanged}</span>
        </p>
      </div>

      {notice && <Notice>{notice}</Notice>}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copyDiff}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? 'Copied' : 'Copy Diff'}
        </Button>
        <Button className="flex-1" onClick={downloadDiff}>
          <Download aria-hidden className="size-4" />
          Download Diff
        </Button>
      </div>
    </div>
  );

  const overviewBar = totalLines > 0 && (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Diff Overview</p>
      <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
        <span className="text-success">{result.summary.added} additions</span>
        <span className="text-danger">{result.summary.removed} deletions</span>
        <span className="text-warning">{result.summary.modified} modified</span>
        <span className="text-muted">{result.summary.unchanged} unchanged</span>
      </div>
      <div className="bg-surface-muted flex h-1.5 w-full overflow-hidden rounded-full">
        <span className="bg-danger h-full" style={{ width: `${removedPercent}%` }} />
        <span className="bg-warning h-full" style={{ width: `${modifiedPercent}%` }} />
        <span className="bg-success h-full" style={{ width: `${addedPercent}%` }} />
        <span className="bg-border h-full" style={{ width: `${unchangedPercent}%` }} />
      </div>
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => leftFileInput.current?.click()}>
          <Upload aria-hidden className="size-4" />
          Upload file
        </Button>
        <Button variant="secondary" size="sm" onClick={() => pasteTo('left')}>
          <Clipboard aria-hidden className="size-4" />
          Paste Left
        </Button>
        <Button variant="secondary" size="sm" onClick={() => pasteTo('right')}>
          <Clipboard aria-hidden className="size-4" />
          Paste Right
        </Button>
        <Button variant="secondary" size="sm" onClick={swapSides}>
          <ArrowLeftRight aria-hidden className="size-4" />
          Swap
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setOriginal('');
            setModified('');
          }}
          disabled={original === '' && modified === ''}
        >
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
        <select
          value={languageId}
          onChange={(event) => setLanguageId(event.target.value)}
          className="border-border bg-background rounded-full border px-3 py-1.5 text-xs font-medium"
          aria-label="Language"
        >
          <option value="auto">Auto detect</option>
          {LANGUAGES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="border-border bg-background text-muted flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(event) => setIgnoreWhitespace(event.target.checked)}
            className="accent-brand size-3.5"
          />
          Ignore whitespace
        </label>
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
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
          {toolbar}
          {diffPanel}
        </div>
        <div className="border-border bg-surface rounded-2xl border p-4">{overviewBar}</div>
      </div>

      <aside className="lg:sticky lg:top-20">{optionsPanel}</aside>

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded code diff view"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Code Diff Checker</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded diff view"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
              {diffPanel}
              <div className="overflow-y-auto">{optionsPanel}</div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
