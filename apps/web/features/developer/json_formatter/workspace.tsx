'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  DEFAULT_JSON_FORMAT_OPTIONS,
  jsonChildCount,
  jsonNodeType,
  parseJson,
  stringifyJson,
  type JsonFormatOptions,
  type JsonIndent,
  type JsonNodeType,
} from './parse';

const AUTOSAVE_KEY = 'developer-tool:json-formatter';
const PLACEHOLDER = 'Paste or type JSON to format and validate it…';

const TYPE_COLOR: Record<JsonNodeType, string> = {
  object: 'text-brand',
  array: 'text-brand',
  string: 'text-success',
  number: 'text-warning',
  boolean: 'text-warning',
  null: 'text-muted',
};

const TYPE_LABEL: Record<JsonNodeType, string> = {
  object: 'obj',
  array: 'arr',
  string: 'str',
  number: 'num',
  boolean: 'bool',
  null: 'null',
};

function formatPrimitive(value: unknown, type: JsonNodeType): string {
  if (type === 'string') return `"${value as string}"`;
  return String(value);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface TreeRowProps {
  label: string;
  value: unknown;
  depth: number;
  index: number;
}

function TreeRow({ label, value, depth, index }: TreeRowProps) {
  const type = jsonNodeType(value);
  const isContainer = type === 'object' || type === 'array';
  const [open, setOpen] = useState(depth < 2);
  const childCount = jsonChildCount(value);

  const entries = useMemo(() => {
    if (!isContainer) return [];
    if (type === 'array') return (value as unknown[]).map((v, i) => [String(i), v] as const);
    return Object.entries(value as Record<string, unknown>);
  }, [isContainer, type, value]);

  return (
    <div>
      <div
        className="hover:bg-surface-muted/60 flex items-center gap-1.5 rounded px-1 py-0.5 text-sm"
        style={{ paddingLeft: depth * 16 }}
      >
        {isContainer ? (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="text-muted hover:text-foreground shrink-0"
          >
            {open ? (
              <ChevronDown aria-hidden className="size-3.5" />
            ) : (
              <ChevronRight aria-hidden className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="text-muted w-5 shrink-0 text-right font-mono text-xs">{index}</span>
        <span className={`shrink-0 font-mono text-[10px] uppercase ${TYPE_COLOR[type]}`}>
          {TYPE_LABEL[type]}
        </span>
        <span className="shrink-0 font-medium">{label}</span>
        {isContainer ? (
          <span className="text-muted text-xs">
            {type === 'array' ? `[${childCount}]` : `{${childCount}}`}
          </span>
        ) : (
          <span className="truncate font-mono text-xs">{formatPrimitive(value, type)}</span>
        )}
      </div>
      {isContainer && open && (
        <div>
          {entries.map(([key, val], i) => (
            <TreeRow key={key} label={key} value={val} depth={depth + 1} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonFormatterWorkspace() {
  const [source, setSource] = useState('');
  const [indent, setIndent] = useState<JsonIndent>(DEFAULT_JSON_FORMAT_OPTIONS.indent);
  const [sortKeys, setSortKeys] = useState(DEFAULT_JSON_FORMAT_OPTIONS.sortKeys);
  const [wrapLines, setWrapLines] = useState(false);
  const [view, setView] = useState<'tree' | 'raw'>('tree');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const restored = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { source?: string };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.source) setSource(parsed.source);
      } catch {
        // Ignore a corrupted draft rather than blocking the tool from loading.
      }
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (source === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
      return;
    }
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ source }));
  }, [source]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const isEmpty = source.trim() === '';
  const options: JsonFormatOptions = { indent, sortKeys };
  const parsed = useMemo(() => parseJson(source), [source]);
  const formatted = useMemo(
    () => (parsed.valid ? stringifyJson(parsed.value, options) : ''),
    // options fields are read individually so this recomputes on either changing
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, indent, sortKeys],
  );

  const inputLines = source === '' ? 0 : source.split('\n').length;
  const inputChars = source.length;
  const outputLines = formatted === '' ? 0 : formatted.split('\n').length;
  const outputChars = formatted.length;

  async function handleUpload(file: File) {
    setNotice(null);
    try {
      const text = await importTextFile(file);
      setSource(text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }

  async function handlePaste() {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      setSource(text);
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  async function copyFormatted() {
    if (!parsed.valid) return;
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadFormatted() {
    if (!parsed.valid) return;
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.json-formatter');
      const output = await processor(
        { files: [], text: source, options: { ...options } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const wrapClass = wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre';
  const panelHeight = expanded ? 'h-full min-h-0 flex-1' : 'h-[45vh]';

  const statusBadge = isEmpty ? null : parsed.valid ? (
    <span className="text-success bg-success/10 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
      <Check aria-hidden className="size-3.5" />
      Valid JSON
    </span>
  ) : (
    <span className="text-danger bg-danger/10 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
      <AlertTriangle aria-hidden className="size-3.5" />
      Invalid
    </span>
  );

  const panelsGrid = (
    <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3`}>
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Input (Raw JSON)</p>
          <p className="text-muted text-xs">
            {inputLines} lines · {inputChars} characters
          </p>
        </div>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className={`border-border bg-background ${panelHeight} resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none ${wrapClass}`}
        />
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Formatted JSON</p>
          <p className="text-muted text-xs">
            {outputLines} lines · {outputChars} characters
          </p>
        </div>
        <pre
          className={`border-border bg-background ${panelHeight} resize-y overflow-auto rounded-2xl border p-4 font-mono text-sm leading-6 ${wrapClass}`}
        >
          {parsed.valid ? (
            <code dangerouslySetInnerHTML={{ __html: escapeHtml(formatted) || '&#8203;' }} />
          ) : (
            <span className="text-muted">
              {isEmpty ? 'The formatted result will appear here.' : 'Fix the syntax error to see the formatted result.'}
            </span>
          )}
        </pre>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Validation &amp; Tree View</p>
          {statusBadge}
        </div>
        <div
          className={`border-border bg-background ${panelHeight} resize-y overflow-auto rounded-2xl border p-3`}
        >
          {isEmpty ? (
            <p className="text-muted text-sm">Paste or type JSON on the left to see its validation and tree view here.</p>
          ) : !parsed.valid ? (
            <Notice>
              Line {parsed.error.line}, column {parsed.error.column}: {parsed.error.message}
            </Notice>
          ) : view === 'tree' ? (
            <TreeRow label="root" value={parsed.value} depth={0} index={0} />
          ) : (
            <pre className={`font-mono text-xs leading-5 ${wrapClass}`}>
              <code dangerouslySetInnerHTML={{ __html: escapeHtml(formatted) || '&#8203;' }} />
            </pre>
          )}
        </div>
      </div>
    </div>
  );

  const canAct = !isEmpty && parsed.valid;

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden className="size-4" />
          Upload JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={handlePaste}>
          <Clipboard aria-hidden className="size-4" />
          Paste
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSource('')} disabled={source === ''}>
          <Trash2 aria-hidden className="size-4" />
          Clear
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={`${TEXT_IMPORT_ACCEPT},application/json,.json`}
          className="sr-only"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleUpload(file);
          }}
        />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="text-muted flex items-center gap-1.5 text-xs">
            Indentation
            <select
              value={indent}
              onChange={(event) => setIndent(event.target.value as JsonIndent)}
              className="border-border bg-background text-foreground rounded-full border px-2.5 py-1 text-xs font-medium"
              aria-label="Indentation"
            >
              <option value="2">2 Spaces</option>
              <option value="4">4 Spaces</option>
              <option value="tab">Tab</option>
              <option value="minified">Minified</option>
            </select>
          </label>
          <label className="text-muted flex items-center gap-1.5 text-xs">
            View
            <select
              value={view}
              onChange={(event) => setView(event.target.value as 'tree' | 'raw')}
              className="border-border bg-background text-foreground rounded-full border px-2.5 py-1 text-xs font-medium"
              aria-label="Validation view"
            >
              <option value="tree">Tree</option>
              <option value="raw">Raw</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={sortKeys}
              onChange={(event) => setSortKeys(event.target.checked)}
              className="accent-brand size-3.5"
            />
            Sort keys
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={wrapLines}
              onChange={(event) => setWrapLines(event.target.checked)}
              className="accent-brand size-3.5"
            />
            Wrap lines
          </label>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copyFormatted} disabled={!canAct}>
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" onClick={downloadFormatted} disabled={!canAct}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand editor"
              className="text-muted hover:text-foreground"
            >
              <Maximize2 aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {!expanded && panelsGrid}

      {notice && <Notice>{notice}</Notice>}

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded JSON editor"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">JSON Formatter &amp; Validator</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded editor"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4">{panelsGrid}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
