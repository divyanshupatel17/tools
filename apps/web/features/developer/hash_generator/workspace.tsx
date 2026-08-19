'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Check, Clipboard, Copy, Download, File, FileText, Hash, Trash2, Upload } from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { hashAll, HASH_ALGORITHMS, type HashAlgorithm, type HashRow } from './hash_ops';

const AUTOSAVE_KEY = 'developer-tool:hash-generator';
const PLACEHOLDER = 'Enter text to generate hash…';

type SourceTab = 'text' | 'file';

export function HashGeneratorWorkspace() {
  const [tab, setTab] = useState<SourceTab>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [algorithms, setAlgorithms] = useState<Set<HashAlgorithm>>(new Set(HASH_ALGORITHMS));
  const [results, setResults] = useState<HashRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRow, setCopiedRow] = useState<HashAlgorithm | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [liveMode, setLiveMode] = useState(true);

  const restored = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setText(draft);
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (text === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
    } else {
      window.localStorage.setItem(AUTOSAVE_KEY, text);
    }
  }, [text]);

  const hasInput = tab === 'text' ? text !== '' : file !== null;
  const selectedAlgorithms = HASH_ALGORITHMS.filter((algorithm) => algorithms.has(algorithm));

  function toggleAlgorithm(algorithm: HashAlgorithm, checked: boolean) {
    setAlgorithms((current) => {
      const next = new Set(current);
      if (checked) next.add(algorithm);
      else next.delete(algorithm);
      return next;
    });
  }

  function switchTab(next: SourceTab) {
    setTab(next);
    setResults(null);
    setNotice(null);
  }

  function handleUpload(nextFile: globalThis.File) {
    setNotice(null);
    setFile(nextFile);
    setResults(null);
  }

  async function handlePaste() {
    setNotice(null);
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
      setResults(null);
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  function handleClear() {
    setText('');
    setFile(null);
    setResults(null);
    setNotice(null);
  }

  async function generateHash() {
    setNotice(null);
    if (selectedAlgorithms.length === 0) {
      setNotice('Select at least one algorithm.');
      return;
    }
    setBusy(true);
    try {
      const bytes = file
        ? new Uint8Array(await file.arrayBuffer())
        : new TextEncoder().encode(text);
      if (bytes.length === 0) {
        setNotice('There is nothing to hash yet.');
        setResults(null);
        return;
      }
      const rows = await hashAll(selectedAlgorithms, bytes);
      setResults(rows);
    } catch {
      setNotice('That input could not be hashed.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!liveMode) return;
    if (!hasInput) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    if (algorithms.size === 0) return;

    let cancelled = false;
    const runAlgorithms = HASH_ALGORITHMS.filter((algorithm) => algorithms.has(algorithm));
    const timer = setTimeout(
      () => {
        void (async () => {
          setBusy(true);
          try {
            const bytes = file
              ? new Uint8Array(await file.arrayBuffer())
              : new TextEncoder().encode(text);
            if (bytes.length === 0) {
              if (!cancelled) setResults(null);
              return;
            }
            const rows = await hashAll(runAlgorithms, bytes);
            if (!cancelled) {
              setResults(rows);
              setNotice(null);
            }
          } catch {
            if (!cancelled) setNotice('That input could not be hashed.');
          } finally {
            if (!cancelled) setBusy(false);
          }
        })();
      },
      tab === 'text' ? 200 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [liveMode, text, file, algorithms, tab, hasInput]);

  async function copyRow(algorithm: HashAlgorithm, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedRow(algorithm);
    setTimeout(() => setCopiedRow((current) => (current === algorithm ? null : current)), 2000);
  }

  async function copyAll() {
    if (!results) return;
    const output = results.map((row) => `${row.algorithm}: ${row.value}`).join('\n');
    await navigator.clipboard.writeText(output);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  async function downloadResults() {
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.hash-generator');
      const output = await processor(
        {
          files: file ? [file] : [],
          text,
          options: { algorithms: selectedAlgorithms },
        },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That result could not be downloaded.');
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) handleUpload(dropped);
  }

  const inputCharCount = text.length;
  const inputByteCount = new TextEncoder().encode(text).length;

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="border-border flex items-center gap-1 border-b">
          <button
            type="button"
            onClick={() => switchTab('text')}
            aria-pressed={tab === 'text'}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'text'
                ? 'border-brand text-foreground'
                : 'text-muted hover:text-foreground border-transparent'
            }`}
          >
            <FileText aria-hidden className="size-4" />
            Text
          </button>
          <button
            type="button"
            onClick={() => switchTab('file')}
            aria-pressed={tab === 'file'}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'file'
                ? 'border-brand text-foreground'
                : 'text-muted hover:text-foreground border-transparent'
            }`}
          >
            <File aria-hidden className="size-4" />
            File
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="border-border bg-background text-muted flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={liveMode}
              onChange={(event) => setLiveMode(event.target.checked)}
              className="accent-brand size-3.5"
            />
            Live
          </label>
          <Button variant="primary" size="sm" onClick={() => void generateHash()} disabled={!hasInput || busy}>
            <Hash aria-hidden className="size-4" />
            {busy ? 'Generating…' : 'Generate Hash'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex min-h-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Input</p>
            <div className="flex items-center gap-3">
              {tab === 'text' ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => void handlePaste()}>
                    <Clipboard aria-hidden className="size-4" />
                    Paste
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleClear} disabled={!hasInput}>
                    <Trash2 aria-hidden className="size-4" />
                    Clear
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={handleClear} disabled={!hasInput}>
                  <Trash2 aria-hidden className="size-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {tab === 'text' ? (
            <>
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setResults(null);
                }}
                placeholder={PLACEHOLDER}
                spellCheck={false}
                className="border-border bg-background h-40 min-h-[10rem] resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none"
              />
              <p className="text-muted mt-1 text-xs">
                {inputCharCount} characters | {inputByteCount} bytes
              </p>
            </>
          ) : (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-border bg-background flex h-40 min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed p-4 text-center transition-colors ${
                dragOver ? 'border-brand bg-brand/5' : ''
              }`}
            >
              {file ? (
                <>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-muted text-xs">{file.size.toLocaleString()} bytes</p>
                </>
              ) : (
                <>
                  <Upload aria-hidden className="text-muted size-6" />
                  <p className="text-sm font-medium">Click or drop a file to hash</p>
                  <p className="text-muted text-xs">The file never leaves your browser.</p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const nextFile = event.target.files?.[0];
              event.target.value = '';
              if (nextFile) handleUpload(nextFile);
            }}
          />
        </div>

        <div className="flex min-h-0 flex-col lg:w-48">
          <p className="mb-2 text-sm font-semibold">Options</p>
          <div className="border-border bg-background flex flex-col gap-2 rounded-2xl border p-3">
            {HASH_ALGORITHMS.map((algorithm) => (
              <label key={algorithm} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={algorithms.has(algorithm)}
                  onChange={(event) => toggleAlgorithm(algorithm, event.target.checked)}
                  className="accent-brand size-4"
                />
                {algorithm}
              </label>
            ))}
          </div>
        </div>
      </div>

      {notice && <Notice>{notice}</Notice>}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Hash Results</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copyAll()} disabled={!results}>
              {copiedAll ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              Copy All
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void downloadResults()} disabled={!results}>
              <Download aria-hidden className="size-4" />
              Download Results
            </Button>
          </div>
        </div>

        {!results ? (
          <div className="border-border bg-background text-muted rounded-2xl border p-6 text-center text-sm">
            Generated hashes will appear here.
          </div>
        ) : (
          <div className="border-border divide-border overflow-hidden divide-y rounded-2xl border">
            {results.map((row) => (
              <div key={row.algorithm} className="flex items-center gap-3 px-4 py-2.5">
                <p className="w-20 shrink-0 text-sm font-semibold">{row.algorithm}</p>
                <p className="min-w-0 flex-1 truncate font-mono text-sm">{row.value}</p>
                <button
                  type="button"
                  onClick={() => void copyRow(row.algorithm, row.value)}
                  aria-label={`Copy ${row.algorithm}`}
                  className="text-muted hover:text-foreground shrink-0"
                >
                  {copiedRow === row.algorithm ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : (
                    <Copy aria-hidden className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
