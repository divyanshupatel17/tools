'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent, type UIEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Clipboard,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Printer,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import 'katex/dist/katex.min.css';
import { Notice } from '@/components/text/control_panel';
import { NumberedTextarea } from '@/components/text/numbered_textarea';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import {
  loadMarkdownEngine,
  renderMermaidDiagrams,
  type MarkdownRenderResult,
} from '@/lib/text/markdown/engine';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { formatMarkdown, type MarkdownFormatOptions } from '@/lib/text/markdown/format';
import { toggleTaskLine } from '@/lib/text/markdown/tasks';
import { loadProcessor } from '@/lib/processing/processor_registry';

const AUTOSAVE_KEY = 'text-tool:markdown-formatter';
const PLACEHOLDER = `# Start typing Markdown…

- [ ] Try a task list
- [x] It is interactive

> [!TIP]
> Supports GitHub style alerts, tables, footnotes, emoji :rocket: and math like $E=mc^2$.`;

const DEFAULT_FORMAT_OPTIONS: MarkdownFormatOptions = {
  auto_format: true,
  normalize_line_endings: true,
  remove_trailing_spaces: false,
  fix_indentation: false,
};

const FORMAT_OPTION_LABELS: Record<keyof MarkdownFormatOptions, string> = {
  auto_format: 'Auto format (tidy markdown)',
  normalize_line_endings: 'Normalize line endings',
  remove_trailing_spaces: 'Remove trailing spaces',
  fix_indentation: 'Fix indentation',
};

/** Injects the sanitized HTML, wires the interactive task checkboxes back to the source text,
 * and renders any Mermaid diagrams into their placeholders once Mermaid itself has loaded. */
function MarkdownPreview({
  result,
  onToggleTask,
}: {
  result: MarkdownRenderResult;
  onToggleTask: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current && result.mermaid_blocks.length > 0) {
      void renderMermaidDiagrams(containerRef.current, result.mermaid_blocks);
    }
  }, [result]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type === 'checkbox' &&
      target.dataset.taskIndex !== undefined
    ) {
      onToggleTask(Number(target.dataset.taskIndex));
    }
  }

  if (result.html.trim() === '') {
    return <p className="text-muted p-4 text-sm">Your rendered Markdown will appear here.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="md-preview p-4"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

export function MarkdownFormatterWorkspace() {
  const [source, setSource] = useState('');
  const [formatOptions, setFormatOptions] = useState<MarkdownFormatOptions>(DEFAULT_FORMAT_OPTIONS);
  const [syncScroll, setSyncScroll] = useState(true);
  const [engine, setEngine] = useState<Awaited<ReturnType<typeof loadMarkdownEngine>> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const restored = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadMarkdownEngine().then((loaded) => {
      if (!cancelled) setEngine(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    // Restoring a saved draft from localStorage on mount, not a value derived from props or
    // state — there is no dependency this effect could instead synchronize with.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft && source === '') setSource(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (source === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
      return;
    }
    window.localStorage.setItem(AUTOSAVE_KEY, source);
  }, [source]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const renderResult: MarkdownRenderResult | null = useMemo(
    () => (engine ? engine.render(source) : null),
    [engine, source],
  );

  const formattedForExport = useMemo(
    () => formatMarkdown(source, formatOptions),
    [source, formatOptions],
  );

  const trimmed = source.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  const characters = source.length;
  const lines = source === '' ? 0 : source.split('\n').length;
  const readMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / 200));
  const saved = source !== '';

  function toggleFormatOption(key: keyof MarkdownFormatOptions) {
    setFormatOptions((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleToggleTask(index: number) {
    const lineNumber = renderResult?.task_lines[index];
    if (lineNumber === undefined) return;
    setSource((current) => toggleTaskLine(current, lineNumber));
  }

  function applyScrollRatio(from: HTMLElement, to: HTMLElement) {
    const fromRange = from.scrollHeight - from.clientHeight;
    const ratio = fromRange > 0 ? from.scrollTop / fromRange : 0;
    const toRange = to.scrollHeight - to.clientHeight;
    syncingRef.current = true;
    to.scrollTop = ratio * toRange;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  function handleInputScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (!syncScroll || syncingRef.current || !previewRef.current) return;
    applyScrollRatio(event.currentTarget, previewRef.current);
  }

  function handlePreviewScroll() {
    if (!syncScroll || syncingRef.current || !previewRef.current || !textareaRef.current) return;
    applyScrollRatio(previewRef.current, textareaRef.current);
  }

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
    await navigator.clipboard.writeText(formattedForExport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadFormatted() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.markdown-formatter');
      const output = await processor(
        { files: [], text: source, options: { ...formatOptions } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  function exportPdf() {
    window.print();
  }

  const inputPreviewGrid = (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:col-span-2 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Markdown Input</p>
          <p className="text-muted text-xs">
            {lines} lines · {characters} characters
          </p>
        </div>
        <NumberedTextarea
          ref={textareaRef}
          value={source}
          onChange={setSource}
          onScroll={handleInputScroll}
          placeholder={PLACEHOLDER}
          minHeightClassName="min-h-[50vh]"
          className="flex-1"
        />
      </div>

      <div className="flex min-h-0 flex-col">
        <p className="mb-2 text-sm font-semibold">Preview</p>
        <div
          ref={previewRef}
          id="md-print-target"
          onScroll={handlePreviewScroll}
          className="border-border bg-background min-h-[50vh] flex-1 overflow-y-auto rounded-2xl border"
        >
          {!engine ? (
            <p className="text-muted flex items-center gap-2 p-4 text-sm">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Loading preview engine…
            </p>
          ) : renderResult ? (
            <MarkdownPreview result={renderResult} onToggleTask={handleToggleTask} />
          ) : null}
        </div>
      </div>
    </div>
  );

  const optionsPanel = (
    <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4">
      <div>
        <p className="text-sm font-semibold">Formatting Options</p>
        <p className="text-muted text-xs">Choose how to format your markdown.</p>
      </div>

      <div className="flex flex-col gap-2">
        {(Object.keys(FORMAT_OPTION_LABELS) as Array<keyof MarkdownFormatOptions>).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formatOptions[key]}
              onChange={() => toggleFormatOption(key)}
              className="accent-brand size-4"
            />
            {FORMAT_OPTION_LABELS[key]}
          </label>
        ))}
      </div>

      {notice && <Notice>{notice}</Notice>}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copyFormatted}>
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={downloadFormatted}>
            <Download aria-hidden className="size-4" />
            Download
          </Button>
        </div>
        <Button className="w-full" onClick={exportPdf}>
          <Printer aria-hidden className="size-4" />
          Export PDF
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden className="size-4" />
              Upload File
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePaste}>
              <Clipboard aria-hidden className="size-4" />
              Paste
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSource('')}
              disabled={source === ''}
            >
              <Trash2 aria-hidden className="size-4" />
              Clear
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={TEXT_IMPORT_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleUpload(file);
              }}
            />
            <label className="border-border bg-background text-muted flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={syncScroll}
                onChange={(event) => setSyncScroll(event.target.checked)}
                className="accent-brand size-3.5"
              />
              Sync scroll
            </label>
          </div>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-success flex items-center gap-1 text-xs font-medium">
                <Check aria-hidden className="size-3.5" />
                Auto-saved
              </span>
            )}
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

        {!expanded && inputPreviewGrid}

        {!expanded && (
          <p className="text-muted flex flex-wrap items-center gap-3 text-xs">
            <span>{characters.toLocaleString()} characters</span>
            <span>{words.toLocaleString()} words</span>
            <span>{readMinutes} min read</span>
          </p>
        )}
      </div>

      <aside className="lg:sticky lg:top-20">{optionsPanel}</aside>

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded markdown editor"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Markdown Formatter &amp; Preview</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded editor"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4">{inputPreviewGrid}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
