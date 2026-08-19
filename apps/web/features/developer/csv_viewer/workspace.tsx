'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Download,
  Eye,
  Maximize2,
  Repeat,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { csvToJson, csvToXml, parseCsv, sortRows, stringifyCsv, type SortDirection } from './csv';

const AUTOSAVE_KEY = 'developer-tool:csv-viewer';
const PLACEHOLDER = 'Paste or type CSV here…';

type Mode = 'viewer' | 'convert';
type OutputFormat = 'json' | 'csv' | 'xml';

const OUTPUT_LABEL: Record<OutputFormat, string> = { json: 'JSON', csv: 'CSV', xml: 'XML' };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function CsvViewerWorkspace() {
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<Mode>('viewer');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('json');
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [xmlOutput, setXmlOutput] = useState('');

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
  const parsed = useMemo(() => parseCsv(source), [source]);

  const sortedRows = useMemo(() => {
    if (!parsed.ok) return [];
    if (sortColumn === null) return parsed.table.rows;
    return sortRows(parsed.table.rows, sortColumn, sortDirection);
  }, [parsed, sortColumn, sortDirection]);

  const outputText = useMemo(() => {
    if (!parsed.ok) return '';
    if (outputFormat === 'json') return csvToJson({ headers: parsed.table.headers, rows: sortedRows });
    if (outputFormat === 'csv') return stringifyCsv({ headers: parsed.table.headers, rows: sortedRows });
    return xmlOutput;
    // xmlOutput is populated asynchronously below since the XML builder loads lazily.
  }, [parsed, sortedRows, outputFormat, xmlOutput]);

  useEffect(() => {
    if (outputFormat !== 'xml' || !parsed.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setXmlOutput('');
      return;
    }
    let cancelled = false;
    void csvToXml({ headers: parsed.table.headers, rows: sortedRows }).then((xml) => {
      if (!cancelled) setXmlOutput(xml);
    });
    return () => {
      cancelled = true;
    };
  }, [outputFormat, parsed, sortedRows]);

  function toggleSort(columnIndex: number) {
    if (sortColumn !== columnIndex) {
      setSortColumn(columnIndex);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') {
      setSortDirection('desc');
      return;
    }
    setSortColumn(null);
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

  async function copyOutput() {
    if (!parsed.ok || outputText === '') return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadOutput() {
    if (!parsed.ok) return;
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.csv-viewer');
      const output = await processor(
        { files: [], text: source, options: { to: outputFormat } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be created.');
    }
  }

  const panelHeight = expanded ? 'h-full min-h-0 flex-1' : 'h-[45vh]';
  const canAct = !isEmpty && parsed.ok && outputText !== '';

  const tablePanel = (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">CSV Input</p>
        {parsed.ok && (
          <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
            {parsed.table.rows.length} rows &middot; {parsed.table.headers.length} columns
          </span>
        )}
      </div>
      <div
        className={`border-border bg-background ${panelHeight} overflow-auto rounded-2xl border`}
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className="h-32 w-full max-w-md resize-y rounded-xl border border-dashed border-border bg-transparent p-3 font-mono text-sm outline-none"
            />
          </div>
        ) : !parsed.ok ? (
          <div className="p-4">
            <Notice>{parsed.message}</Notice>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-muted sticky top-0">
              <tr>
                {parsed.table.headers.map((header, index) => (
                  <th key={index} className="border-border border-b p-0">
                    <button
                      type="button"
                      onClick={() => toggleSort(index)}
                      className="hover:bg-surface-muted/60 flex w-full items-center gap-1 px-3 py-2 text-left font-semibold"
                    >
                      <span className="truncate">{header || `Column ${index + 1}`}</span>
                      {sortColumn === index ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp aria-hidden className="size-3.5 shrink-0" />
                        ) : (
                          <ChevronDown aria-hidden className="size-3.5 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown aria-hidden className="text-muted size-3.5 shrink-0" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-surface-muted/40 even:bg-surface-muted/20">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-border/60 truncate border-b px-3 py-1.5">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const outputPanel = (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="border-border bg-background flex items-center gap-1 rounded-full border p-0.5">
          {(Object.keys(OUTPUT_LABEL) as OutputFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => setOutputFormat(format)}
              aria-pressed={outputFormat === format}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                outputFormat === format ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
              }`}
            >
              {OUTPUT_LABEL[format]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyOutput()}
            disabled={!canAct}
            aria-label={`Copy ${OUTPUT_LABEL[outputFormat]} output`}
            className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => void downloadOutput()}
            disabled={!canAct}
            aria-label={`Download ${OUTPUT_LABEL[outputFormat]} output`}
            className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Download aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <pre
        className={`border-border bg-background ${panelHeight} resize-y overflow-auto rounded-2xl border p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words`}
      >
        {isEmpty ? (
          <span className="text-muted">The converted result will appear here.</span>
        ) : !parsed.ok ? (
          <span className="text-danger">{parsed.message}</span>
        ) : outputText === '' ? (
          <span className="text-muted">Converting…</span>
        ) : (
          <code dangerouslySetInnerHTML={{ __html: escapeHtml(outputText) || '&#8203;' }} />
        )}
      </pre>
    </div>
  );

  const panelsGrid =
    mode === 'viewer' ? (
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4">{tablePanel}</div>
    ) : (
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {tablePanel}
        {outputPanel}
      </div>
    );

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden className="size-4" />
          Upload CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={handlePaste}>
          <Clipboard aria-hidden className="size-4" />
          Paste CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSource('')} disabled={source === ''}>
          <Trash2 aria-hidden className="size-4" />
          Clear
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={`${TEXT_IMPORT_ACCEPT},text/csv,.csv`}
          className="sr-only"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleUpload(file);
          }}
        />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="border-border bg-background flex items-center gap-1 rounded-full border p-0.5">
            <button
              type="button"
              onClick={() => setMode('viewer')}
              aria-pressed={mode === 'viewer'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'viewer' ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
              }`}
            >
              <Eye aria-hidden className="size-3.5" />
              Viewer
            </button>
            <button
              type="button"
              onClick={() => setMode('convert')}
              aria-pressed={mode === 'convert'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'convert' ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
              }`}
            >
              <Repeat aria-hidden className="size-3.5" />
              Convert
            </button>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand viewer"
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
            aria-label="Expanded CSV viewer"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">CSV Viewer &amp; Converter</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded viewer"
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
