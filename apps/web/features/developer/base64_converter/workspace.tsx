'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard, Copy, Download, Lock, Maximize2, Trash2, Unlock, Upload, X } from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { decodeBase64, encodeBytesToBase64, encodeTextToBase64 } from './base64';

const AUTOSAVE_KEY = 'developer-tool:base64-converter';
const PLACEHOLDER_ENCODE = 'Paste or type text to encode…';
const PLACEHOLDER_DECODE = 'Paste or type Base64 to decode…';

type Mode = 'encode' | 'decode';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function Base64ConverterWorkspace() {
  const [source, setSource] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('encode');
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
        const parsed = JSON.parse(draft) as { source?: string; mode?: Mode };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.source) setSource(parsed.source);
        if (parsed.mode) setMode(parsed.mode);
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
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ source, mode }));
  }, [source, mode]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const isEmpty = source === '' && !uploadedFile;
  const [fileBase64, setFileBase64] = useState('');

  useEffect(() => {
    if (!uploadedFile || mode !== 'encode') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFileBase64('');
      return;
    }
    let cancelled = false;
    void uploadedFile.arrayBuffer().then((buffer) => {
      if (cancelled) return;
      setFileBase64(encodeBytesToBase64(new Uint8Array(buffer)));
    });
    return () => {
      cancelled = true;
    };
  }, [uploadedFile, mode]);

  const decoded = useMemo(() => (mode === 'decode' && source !== '' ? decodeBase64(source) : null), [mode, source]);

  const outputText = useMemo(() => {
    if (mode === 'encode') return uploadedFile ? fileBase64 : encodeTextToBase64(source);
    return decoded && decoded.ok ? (decoded.text ?? '') : '';
  }, [mode, source, uploadedFile, fileBase64, decoded]);

  const outputIsBinary = mode === 'decode' && decoded?.ok === true && decoded.text === null;
  const errorMessage = mode === 'decode' && decoded && !decoded.ok ? decoded.message : null;

  function switchMode(next: Mode) {
    setMode(next);
    setSource('');
    setUploadedFile(null);
    setNotice(null);
  }

  async function handleUpload(file: File) {
    setNotice(null);
    if (mode === 'encode') {
      setUploadedFile(file);
      setSource('');
      return;
    }
    setUploadedFile(null);
    try {
      setSource(await file.text());
    } catch {
      setNotice('That file could not be read.');
    }
  }

  async function handlePaste() {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      setUploadedFile(null);
      setSource(text);
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  async function copyOutput() {
    if (outputText === '') return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadOutput() {
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.base64-converter');
      const output = await processor(
        { files: uploadedFile ? [uploadedFile] : [], text: source, options: { mode } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be created.');
    }
  }

  const panelHeight = expanded ? 'h-full min-h-0 flex-1' : 'h-[40vh]';
  const canAct = !isEmpty && !errorMessage && (outputText !== '' || outputIsBinary);
  const inputBadge = mode === 'encode' ? (uploadedFile ? 'File' : 'Text') : 'Base64';
  const outputBadge = mode === 'encode' ? 'Base64' : outputIsBinary ? 'Binary' : 'Text';
  const outputChars = outputText.length;
  const inputChars = uploadedFile ? uploadedFile.size : source.length;

  const panelsGrid = (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Input</p>
            {!isEmpty && (
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {inputBadge}
              </span>
            )}
          </div>
          <p className="text-muted text-xs">{inputChars} characters</p>
        </div>
        {uploadedFile ? (
          <div
            className={`border-border bg-background ${panelHeight} flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center`}
          >
            <p className="text-sm font-medium">{uploadedFile.name}</p>
            <p className="text-muted text-xs">{uploadedFile.size.toLocaleString()} bytes</p>
          </div>
        ) : (
          <textarea
            value={source}
            onChange={(event) => {
              setUploadedFile(null);
              setSource(event.target.value);
            }}
            placeholder={mode === 'encode' ? PLACEHOLDER_ENCODE : PLACEHOLDER_DECODE}
            spellCheck={false}
            className={`border-border bg-background ${panelHeight} resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none whitespace-pre-wrap break-words`}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Output</p>
            {!isEmpty && !errorMessage && (
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {outputBadge}
              </span>
            )}
          </div>
          <p className="text-muted text-xs">{outputChars} characters</p>
        </div>
        <pre
          className={`border-border bg-background ${panelHeight} resize-y overflow-auto rounded-2xl border p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words`}
        >
          {isEmpty ? (
            <span className="text-muted">
              {mode === 'encode' ? 'The Base64 result will appear here.' : 'The decoded result will appear here.'}
            </span>
          ) : errorMessage ? (
            <span className="text-danger">{errorMessage}</span>
          ) : outputIsBinary ? (
            <span className="text-muted">
              This decodes to binary data, not text. Use the download button to save it as a file.
            </span>
          ) : (
            <code dangerouslySetInnerHTML={{ __html: escapeHtml(outputText) || '&#8203;' }} />
          )}
        </pre>
      </div>
    </div>
  );

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
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
          onClick={() => {
            setSource('');
            setUploadedFile(null);
            setNotice(null);
          }}
          disabled={isEmpty}
        >
          <Trash2 aria-hidden className="size-4" />
          Clear
        </Button>
        <input
          ref={fileInputRef}
          type="file"
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
            disabled={!canAct || outputIsBinary}
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

      <div className="flex flex-col items-center gap-2">
        <div className="border-border bg-background flex items-center gap-1 rounded-full border p-0.5">
          <button
            type="button"
            onClick={() => switchMode('encode')}
            aria-pressed={mode === 'encode'}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === 'encode' ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
            }`}
          >
            <Lock aria-hidden className="size-4" />
            Encode
          </button>
          <button
            type="button"
            onClick={() => switchMode('decode')}
            aria-pressed={mode === 'decode'}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === 'decode' ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
            }`}
          >
            <Unlock aria-hidden className="size-4" />
            Decode
          </button>
        </div>
        <p className="text-muted text-xs">
          Detects the input type automatically. Supports text, Base64 or a file.
        </p>
      </div>

      {!expanded && panelsGrid}

      {notice && <Notice>{notice}</Notice>}

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded Base64 editor"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Base64 Encoder &amp; Decoder</p>
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
