'use client';

import { useState } from 'react';
import { Braces, Check, Copy, File, Search, Trash2, X } from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import {
  CATEGORY_ORDER,
  findByExtension,
  findByMimeType,
  MIME_TYPES,
  type MimeCategory,
  type MimeEntry,
} from './mime_types';

type Mode = 'extension' | 'mime-type';

const CATEGORY_COLOR: Record<MimeCategory, string> = {
  Images: 'var(--accent-image)',
  Documents: 'var(--accent-converters)',
  'Web/Markup': 'var(--accent-developer)',
  'Audio/Video': 'var(--accent-audio)',
  Archives: 'var(--accent-pdf)',
};

const EXAMPLE_EXTENSIONS = ['png', 'jpg', 'pdf', 'json', 'mp4'];
const EXAMPLE_MIME_TYPES = ['image/png', 'application/json', 'text/html', 'video/mp4'];

export function MimeTypeLookupWorkspace() {
  const [mode, setMode] = useState<Mode>('extension');
  const [input, setInput] = useState('png');
  const [entry, setEntry] = useState<MimeEntry | undefined>(() => findByExtension('png'));
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setInput('');
    setEntry(undefined);
    setNotice(null);
  }

  function lookup(raw: string) {
    const query = raw.trim();
    if (query === '') {
      setNotice(mode === 'extension' ? 'Enter a file extension, such as png.' : 'Enter a MIME type, such as image/png.');
      setEntry(undefined);
      return;
    }
    const found = mode === 'extension' ? findByExtension(query) : findByMimeType(query);
    if (!found) {
      setNotice(`${query} was not found in the registry.`);
      setEntry(undefined);
      return;
    }
    setNotice(null);
    setEntry(found);
  }

  function pick(value: string, nextMode: Mode) {
    setMode(nextMode);
    setInput(value);
    setNotice(null);
    setEntry(nextMode === 'extension' ? findByExtension(value) : findByMimeType(value));
  }

  function clear() {
    setInput('');
    setEntry(undefined);
    setNotice(null);
  }

  async function copyMimeType() {
    if (!entry) return;
    await navigator.clipboard.writeText(entry.mimeType);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="border-border flex items-center gap-1 border-b">
        <button
          type="button"
          onClick={() => switchMode('extension')}
          aria-pressed={mode === 'extension'}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            mode === 'extension' ? 'border-brand text-foreground' : 'text-muted border-transparent hover:text-foreground'
          }`}
        >
          <File aria-hidden className="size-4" />
          By File Extension
        </button>
        <button
          type="button"
          onClick={() => switchMode('mime-type')}
          aria-pressed={mode === 'mime-type'}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            mode === 'mime-type' ? 'border-brand text-foreground' : 'text-muted border-transparent hover:text-foreground'
          }`}
        >
          <Braces aria-hidden className="size-4" />
          By MIME Type
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="mime-lookup-input" className="text-sm font-semibold">
          {mode === 'extension' ? 'Enter file extension' : 'Enter MIME type'}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="border-border bg-background flex min-w-[200px] flex-1 items-center gap-2 rounded-full border px-4 py-2">
            <Search aria-hidden className="text-muted size-4 shrink-0" />
            <input
              id="mime-lookup-input"
              name="mime-lookup-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') lookup(input);
              }}
              placeholder={mode === 'extension' ? 'e.g. png' : 'e.g. image/png'}
              spellCheck={false}
              className="text-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {input !== '' && (
              <button type="button" onClick={clear} aria-label="Clear input" className="text-muted hover:text-foreground">
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={() => lookup(input)} disabled={input.trim() === ''}>
            <Search aria-hidden className="size-4" />
            Lookup
          </Button>
          <Button variant="secondary" size="sm" onClick={clear} disabled={input === '' && !entry}>
            <Trash2 aria-hidden className="size-4" />
            Clear
          </Button>
        </div>
        <p className="text-muted text-xs">
          Example:{' '}
          {(mode === 'extension' ? EXAMPLE_EXTENSIONS : EXAMPLE_MIME_TYPES).map((value, index, arr) => (
            <span key={value}>
              <button type="button" onClick={() => pick(value, mode)} className="text-brand-strong font-mono font-medium hover:underline">
                {value}
              </button>
              {index < arr.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      </div>

      {notice && <Notice>{notice}</Notice>}

      {entry && (
        <div className="border-border bg-background flex flex-col gap-4 rounded-2xl border p-4">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-bold"
              style={{ backgroundColor: `color-mix(in srgb, ${CATEGORY_COLOR[entry.category]} 15%, transparent)`, color: CATEGORY_COLOR[entry.category] }}
            >
              {entry.extension.toUpperCase().slice(0, 4)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-muted text-xs font-medium">MIME Type</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-lg font-bold" style={{ color: CATEGORY_COLOR[entry.category] }}>
                  {entry.mimeType}
                </p>
                <button type="button" onClick={() => void copyMimeType()} aria-label="Copy MIME type" className="text-muted hover:text-foreground">
                  {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                </button>
              </div>
              <p className="text-muted mt-1 text-sm">{entry.description}</p>
            </div>
          </div>

          <div className="border-border grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
            <div>
              <p className="text-muted text-xs font-medium">File Extension</p>
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 font-mono text-xs font-medium"
                style={{ backgroundColor: `color-mix(in srgb, ${CATEGORY_COLOR[entry.category]} 12%, transparent)`, color: CATEGORY_COLOR[entry.category] }}
              >
                .{entry.extension}
              </span>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Category</p>
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `color-mix(in srgb, ${CATEGORY_COLOR[entry.category]} 12%, transparent)`, color: CATEGORY_COLOR[entry.category] }}
              >
                {entry.category}
              </span>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Standard</p>
              <p className="text-foreground mt-1 text-sm">{entry.standard}</p>
              <a
                href="https://www.iana.org/assignments/media-types/media-types.txt"
                target="_blank"
                rel="noreferrer"
                className="text-brand-strong mt-0.5 inline-block text-xs hover:underline"
              >
                IANA Media Types Registry
              </a>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Compressed</p>
              <p className="text-foreground mt-1 text-sm">{entry.compressed ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Binary</p>
              <p className="text-foreground mt-1 text-sm">{entry.binary ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Charset</p>
              <p className="text-foreground mt-1 text-sm">{entry.charset ?? 'Not Applicable'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">All Common MIME Types</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORY_ORDER.map((category) => (
            <div key={category} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold" style={{ color: CATEGORY_COLOR[category] }}>
                {category}
              </p>
              <div className="flex flex-col">
                {MIME_TYPES.filter((item) => item.category === category).map((item) => (
                  <button
                    key={`${item.extension}-${item.mimeType}`}
                    type="button"
                    onClick={() => pick(item.extension, 'extension')}
                    className="hover:bg-surface-muted flex flex-col items-start gap-0.5 rounded-lg px-1.5 py-1 text-left"
                  >
                    <span className="text-foreground font-mono text-xs font-medium">.{item.extension}</span>
                    <span className="text-muted truncate text-xs">{item.mimeType}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-muted text-xs">
          Source of truth:{' '}
          <a
            href="https://www.iana.org/assignments/media-types/media-types.txt"
            target="_blank"
            rel="noreferrer"
            className="text-brand-strong hover:underline"
          >
            IANA Media Types Registry
          </a>
        </p>
      </div>
    </div>
  );
}
