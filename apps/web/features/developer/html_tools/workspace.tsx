'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignJustify,
  Check,
  Clipboard,
  Code,
  Code2,
  Download,
  Copy,
  Eraser,
  Eye,
  Lock,
  Maximize2,
  Trash2,
  Unlock,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { runHtmlOperation, type HtmlOperation, type HtmlOpResult } from './html_ops';

const AUTOSAVE_KEY = 'developer-tool:html-tools';

type Tab = HtmlOperation | 'preview';

const OPERATION_META: Record<
  HtmlOperation,
  { label: string; icon: typeof Lock; inputBadge: string; outputBadge: string; placeholder: string; empty: string }
> = {
  encode: {
    label: 'Encode',
    icon: Lock,
    inputBadge: 'HTML',
    outputBadge: 'HTML Encoded',
    placeholder: 'Enter HTML to encode…',
    empty: 'The encoded HTML will appear here…',
  },
  decode: {
    label: 'Decode',
    icon: Unlock,
    inputBadge: 'Encoded',
    outputBadge: 'HTML',
    placeholder: 'Paste HTML entities to decode…',
    empty: 'The decoded HTML will appear here…',
  },
  escape: {
    label: 'Escape',
    icon: Code2,
    inputBadge: 'HTML',
    outputBadge: 'Escaped',
    placeholder: 'Enter HTML to escape…',
    empty: 'The escaped HTML will appear here…',
  },
  unescape: {
    label: 'Unescape',
    icon: Code,
    inputBadge: 'Escaped',
    outputBadge: 'HTML',
    placeholder: 'Paste escaped HTML to unescape…',
    empty: 'The unescaped HTML will appear here…',
  },
  minify: {
    label: 'Minify',
    icon: AlignJustify,
    inputBadge: 'HTML',
    outputBadge: 'Minified',
    placeholder: 'Paste HTML to minify…',
    empty: 'The minified HTML will appear here…',
  },
  beautify: {
    label: 'Beautify',
    icon: Wand2,
    inputBadge: 'HTML',
    outputBadge: 'Beautified',
    placeholder: 'Paste HTML to beautify…',
    empty: 'The beautified HTML will appear here…',
  },
  strip: {
    label: 'Strip HTML',
    icon: Eraser,
    inputBadge: 'HTML',
    outputBadge: 'Plain text',
    placeholder: 'Paste HTML to strip…',
    empty: 'The plain text will appear here…',
  },
};

const TAB_ORDER: Tab[] = ['encode', 'decode', 'escape', 'unescape', 'minify', 'beautify', 'strip', 'preview'];

const DEFAULT_HTML = `<h1 id="title">Hello, world!</h1>\n<button id="btn">Click me</button>`;
const DEFAULT_CSS = `body {\n  font-family: sans-serif;\n  text-align: center;\n  padding: 2rem;\n}\n\n#title {\n  color: #ff7a00;\n}\n\nbutton {\n  padding: 0.5rem 1rem;\n  border-radius: 999px;\n  border: none;\n  background: #ff7a00;\n  color: white;\n  cursor: pointer;\n}`;
const DEFAULT_JS = `document.getElementById('btn').addEventListener('click', () => {\n  document.getElementById('title').textContent = 'You clicked me!';\n});`;

interface PreviewFiles {
  html: string;
  css: string;
  js: string;
}

const PREVIEW_TAB_LABEL: Record<keyof PreviewFiles, string> = { html: 'HTML', css: 'CSS', js: 'JS' };

function buildPreviewDocument(files: PreviewFiles): string {
  return `<!doctype html>\n<html>\n<head><style>\n${files.css}\n</style></head>\n<body>\n${files.html}\n<script>\n${files.js}\n</` + `script>\n</body>\n</html>\n`;
}

function escapeForDisplay(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function HtmlToolsWorkspace() {
  const [tab, setTab] = useState<Tab>('encode');
  const [source, setSource] = useState('');
  const [result, setResult] = useState<HtmlOpResult>({ ok: true, text: '' });
  const [previewFiles, setPreviewFiles] = useState<PreviewFiles>({
    html: DEFAULT_HTML,
    css: DEFAULT_CSS,
    js: DEFAULT_JS,
  });
  const [previewTab, setPreviewTab] = useState<keyof PreviewFiles>('html');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const restored = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { source?: string; tab?: Tab; previewFiles?: PreviewFiles };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.source) setSource(parsed.source);
        if (parsed.tab) setTab(parsed.tab);
        if (parsed.previewFiles) setPreviewFiles(parsed.previewFiles);
      } catch {
        // Ignore a corrupted draft rather than blocking the tool from loading.
      }
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ source, tab, previewFiles }));
  }, [source, tab, previewFiles]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const isPreview = tab === 'preview';
  const operation = isPreview ? null : (tab as HtmlOperation);
  const isEmpty = source.trim() === '';

  useEffect(() => {
    if (isPreview) return;
    const id = ++requestId.current;
    if (isEmpty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult({ ok: true, text: '' });
      return;
    }
    void runHtmlOperation(operation as HtmlOperation, source).then((next) => {
      if (requestId.current !== id) return;
      setResult(next);
    });
  }, [operation, source, isEmpty, isPreview]);

  const previewSrcDoc = useMemo(() => buildPreviewDocument(previewFiles), [previewFiles]);

  async function handleUpload(file: File) {
    setNotice(null);
    try {
      const text = await importTextFile(file);
      if (isPreview) {
        setPreviewFiles((prev) => ({ ...prev, [previewTab]: text }));
      } else {
        setSource(text);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }

  async function handlePaste() {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      if (isPreview) {
        setPreviewFiles((prev) => ({ ...prev, [previewTab]: text }));
      } else {
        setSource(text);
      }
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  function handleClear() {
    setNotice(null);
    if (isPreview) {
      setPreviewFiles((prev) => ({ ...prev, [previewTab]: '' }));
    } else {
      setSource('');
    }
  }

  const outputText = isPreview ? previewSrcDoc : result.ok ? result.text : '';
  const canAct = isPreview ? previewFiles.html !== '' || previewFiles.css !== '' || previewFiles.js !== '' : !isEmpty && result.ok && outputText !== '';
  const clearDisabled = isPreview ? previewFiles[previewTab] === '' : source === '';

  async function copyOutput() {
    if (outputText === '') return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadOutput() {
    setNotice(null);
    if (isPreview) {
      downloadBlob(new Blob([previewSrcDoc], { type: 'text/html' }), 'preview.html');
      return;
    }
    try {
      const processor = await loadProcessor('developer.html-tools');
      const output = await processor(
        { files: [], text: source, options: { operation } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be created.');
    }
  }

  const panelHeight = expanded ? 'h-full min-h-0 flex-1' : 'h-[45vh]';

  const converterPanels = operation && (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Input</p>
            {!isEmpty && (
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {OPERATION_META[operation].inputBadge}
              </span>
            )}
          </div>
          <p className="text-muted text-xs">{source.length} characters</p>
        </div>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={OPERATION_META[operation].placeholder}
          spellCheck={false}
          className={`border-border bg-background ${panelHeight} resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none whitespace-pre-wrap break-words`}
        />
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Output</p>
            {!isEmpty && result.ok && (
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {OPERATION_META[operation].outputBadge}
              </span>
            )}
          </div>
          <p className="text-muted text-xs">{outputText.length} characters</p>
        </div>
        <pre
          className={`border-border bg-background ${panelHeight} resize-y overflow-auto rounded-2xl border p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words`}
        >
          {isEmpty ? (
            <span className="text-muted">{OPERATION_META[operation].empty}</span>
          ) : !result.ok ? (
            <span className="text-danger">{result.message}</span>
          ) : (
            <code dangerouslySetInnerHTML={{ __html: escapeForDisplay(outputText) || '&#8203;' }} />
          )}
        </pre>
      </div>
    </div>
  );

  const previewPanels = (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center gap-1 rounded-full border border-border bg-background p-0.5 w-fit">
          {(Object.keys(PREVIEW_TAB_LABEL) as (keyof PreviewFiles)[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreviewTab(key)}
              aria-pressed={previewTab === key}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                previewTab === key ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
              }`}
            >
              {PREVIEW_TAB_LABEL[key]}
            </button>
          ))}
        </div>
        <textarea
          value={previewFiles[previewTab]}
          onChange={(event) =>
            setPreviewFiles((prev) => ({ ...prev, [previewTab]: event.target.value }))
          }
          placeholder={`Write ${PREVIEW_TAB_LABEL[previewTab]} here…`}
          spellCheck={false}
          className={`border-border bg-background ${panelHeight} resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none whitespace-pre-wrap break-words`}
        />
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-semibold">Live preview</p>
          <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
            Auto refreshing
          </span>
        </div>
        <iframe
          title="HTML preview"
          srcDoc={previewSrcDoc}
          sandbox="allow-scripts"
          className={`border-border bg-white ${panelHeight} w-full rounded-2xl border`}
        />
      </div>
    </div>
  );

  const panelsGrid = isPreview ? previewPanels : converterPanels;

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div>
        <h2 className="text-lg font-semibold">HTML Tools</h2>
        <p className="text-muted text-sm">Encode, decode, escape, strip and preview HTML in one place.</p>
      </div>

      <div className="border-border bg-background flex flex-wrap items-center gap-1 rounded-full border p-0.5">
        {TAB_ORDER.map((value) => {
          const Icon = value === 'preview' ? Eye : OPERATION_META[value].icon;
          const label = value === 'preview' ? 'Preview' : OPERATION_META[value].label;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                tab === value ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
              }`}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden className="size-4" />
          Upload File
        </Button>
        <Button variant="secondary" size="sm" onClick={handlePaste}>
          <Clipboard aria-hidden className="size-4" />
          Paste
        </Button>
        <Button variant="secondary" size="sm" onClick={handleClear} disabled={clearDisabled}>
          <Trash2 aria-hidden className="size-4" />
          Clear
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={`${TEXT_IMPORT_ACCEPT},text/html,.html,.htm,.css,.js`}
          className="sr-only"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleUpload(file);
          }}
        />

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => void copyOutput()}
            disabled={!canAct}
            aria-label="Copy output"
            className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => void downloadOutput()}
            disabled={!canAct}
            aria-label="Download output"
            className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Download aria-hidden className="size-4" />
          </button>
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

      {!expanded && panelsGrid}

      {notice && <Notice>{notice}</Notice>}

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded HTML tools editor"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">HTML Tools</p>
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
