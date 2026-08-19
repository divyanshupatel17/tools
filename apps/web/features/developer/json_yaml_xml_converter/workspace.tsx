'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
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
  convert,
  detectFormat,
  DATA_FORMATS,
  FORMAT_LABEL,
  type ConvertResult,
  type DataFormat,
} from './convert';

const AUTOSAVE_KEY = 'developer-tool:json-yaml-xml-converter';
const PLACEHOLDER = 'Paste or type JSON, YAML or XML here…';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type InputFormat = 'auto' | DataFormat;

export function JsonYamlXmlConverterWorkspace() {
  const [source, setSource] = useState('');
  const [inputFormat, setInputFormat] = useState<InputFormat>('auto');
  const [outputToggles, setOutputToggles] = useState<Record<DataFormat, boolean>>({
    json: true,
    yaml: true,
    xml: true,
  });
  const [results, setResults] = useState<Partial<Record<DataFormat, ConvertResult>>>({});
  const [expanded, setExpanded] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<DataFormat | null>(null);
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
        const parsed = JSON.parse(draft) as { source?: string; inputFormat?: InputFormat };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.source) setSource(parsed.source);
        if (parsed.inputFormat) setInputFormat(parsed.inputFormat);
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
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ source, inputFormat }));
  }, [source, inputFormat]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const isEmpty = source.trim() === '';
  const detected = useMemo(() => detectFormat(source), [source]);
  // Falls back to JSON so the layout always has exactly one input format excluded from the
  // outputs, even before anything has been typed, rather than showing all three as outputs.
  const effectiveFormat = inputFormat === 'auto' ? (detected ?? 'json') : inputFormat;
  const outputFormats = DATA_FORMATS.filter((format) => format !== effectiveFormat);
  const visibleFormats = outputFormats.filter((format) => outputToggles[format]);

  useEffect(() => {
    const id = ++requestId.current;
    if (isEmpty || !effectiveFormat) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults({});
      return;
    }
    void Promise.all(
      visibleFormats.map(async (format) => [format, await convert(source, effectiveFormat, format)] as const),
    ).then((entries) => {
      if (requestId.current !== id) return;
      setResults(Object.fromEntries(entries) as Partial<Record<DataFormat, ConvertResult>>);
    });
    // visibleFormats is derived from outputFormats/outputToggles each render; comparing by value
    // would recompute every keystroke either way, so depend on the primitives that actually change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, effectiveFormat, isEmpty, outputToggles.json, outputToggles.yaml, outputToggles.xml]);

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

  async function copyOutput(format: DataFormat) {
    const result = results[format];
    if (!result || !result.ok) return;
    await navigator.clipboard.writeText(result.text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat((current) => (current === format ? null : current)), 2000);
  }

  async function downloadOutput(format: DataFormat) {
    const result = results[format];
    if (!result || !result.ok || !effectiveFormat) return;
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.json-yaml-xml-converter');
      const output = await processor(
        { files: [], text: source, options: { from: effectiveFormat, to: format } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be created.');
    }
  }

  const wrapClass = 'whitespace-pre-wrap break-words';
  const panelHeight = expanded ? 'h-full min-h-0 flex-1' : 'h-[45vh]';
  const inputLines = source === '' ? 0 : source.split('\n').length;
  const inputChars = source.length;

  const inputPanel = (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Input</p>
          {!isEmpty && effectiveFormat && (
            <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
              {inputFormat === 'auto' ? `Auto detected ${FORMAT_LABEL[effectiveFormat]}` : FORMAT_LABEL[effectiveFormat]}
            </span>
          )}
        </div>
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
  );

  function outputPanel(format: DataFormat) {
    const result = results[format];
    const outputText = result?.ok ? result.text : '';
    const outputLines = outputText === '' ? 0 : outputText.split('\n').length;
    const outputChars = outputText.length;
    const canAct = !isEmpty && Boolean(result?.ok);

    return (
      <div key={format} className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{FORMAT_LABEL[format]}</p>
            {!isEmpty &&
              (result?.ok ? (
                <span className="text-success bg-success/10 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  <Check aria-hidden className="size-3.5" />
                  Valid
                </span>
              ) : result && !result.ok ? (
                <span className="text-danger bg-danger/10 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  <AlertTriangle aria-hidden className="size-3.5" />
                  Invalid
                </span>
              ) : null)}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted text-xs">
              {outputLines} lines · {outputChars} characters
            </p>
            <button
              type="button"
              onClick={() => void copyOutput(format)}
              disabled={!canAct}
              aria-label={`Copy ${FORMAT_LABEL[format]} output`}
              className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              {copiedFormat === format ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void downloadOutput(format)}
              disabled={!canAct}
              aria-label={`Download ${FORMAT_LABEL[format]} output`}
              className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Download aria-hidden className="size-4" />
            </button>
          </div>
        </div>
        <pre
          className={`border-border bg-background ${panelHeight} resize-y overflow-auto rounded-2xl border p-4 font-mono text-sm leading-6 ${wrapClass}`}
        >
          {isEmpty ? (
            <span className="text-muted">The converted result will appear here.</span>
          ) : result?.ok ? (
            <code dangerouslySetInnerHTML={{ __html: escapeHtml(outputText) || '&#8203;' }} />
          ) : result && !result.ok ? (
            <span className="text-danger">{result.message}</span>
          ) : (
            <span className="text-muted">Converting…</span>
          )}
        </pre>
      </div>
    );
  }

  const panelCount = 1 + visibleFormats.length;
  const gridColsClass =
    panelCount >= 3 ? 'lg:grid-cols-3' : panelCount === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1';

  const panelsGrid = (
    <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${gridColsClass}`}>
      {inputPanel}
      {visibleFormats.map((format) => outputPanel(format))}
    </div>
  );

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden className="size-4" />
          Upload
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
          accept={`${TEXT_IMPORT_ACCEPT},application/json,.json,.yaml,.yml,.xml`}
          className="sr-only"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleUpload(file);
          }}
        />

        <label className="text-muted flex items-center gap-1.5 text-xs">
          Input format
          <select
            value={inputFormat}
            onChange={(event) => setInputFormat(event.target.value as InputFormat)}
            className="border-border bg-background text-foreground rounded-full border px-2.5 py-1 text-xs font-medium"
            aria-label="Input format"
          >
            <option value="auto">Auto detect</option>
            {DATA_FORMATS.map((format) => (
              <option key={format} value={format}>
                {FORMAT_LABEL[format]}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-muted text-xs">Show</span>
          {DATA_FORMATS.map((format) => {
            const disabled = format === effectiveFormat;
            return (
              <label
                key={format}
                className={`flex items-center gap-1.5 text-xs ${disabled ? 'opacity-40' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={!disabled && outputToggles[format]}
                  disabled={disabled}
                  onChange={(event) =>
                    setOutputToggles((prev) => ({ ...prev, [format]: event.target.checked }))
                  }
                  className="accent-brand size-3.5"
                />
                {FORMAT_LABEL[format]}
              </label>
            );
          })}
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
            aria-label="Expanded converter"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">JSON, YAML &amp; XML Converter</p>
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
