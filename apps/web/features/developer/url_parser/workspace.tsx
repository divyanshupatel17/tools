'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Folder,
  Globe,
  Hash,
  Info,
  Link2,
  List,
  Lock,
  Network,
  Repeat,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { parseUrl, SAMPLE_URLS, type ParsedUrl } from './parse_url';

const AUTOSAVE_KEY = 'developer-tool:url-parser';

interface Row {
  key: keyof ParsedUrl | 'searchParamsCount';
  label: string;
  icon: typeof Link2;
  value: (url: ParsedUrl) => string;
}

const ROWS: Row[] = [
  { key: 'protocol', label: 'Protocol', icon: Link2, value: (u) => u.protocol },
  { key: 'username', label: 'Username', icon: User, value: (u) => u.username },
  { key: 'password', label: 'Password', icon: Lock, value: (u) => u.password },
  { key: 'host', label: 'Host', icon: Globe, value: (u) => u.host },
  { key: 'port', label: 'Port', icon: Network, value: (u) => u.port },
  { key: 'pathname', label: 'Pathname', icon: Folder, value: (u) => u.pathname },
  { key: 'search', label: 'Query', icon: Search, value: (u) => u.search },
  {
    key: 'searchParamsCount',
    label: 'Query Parameters',
    icon: List,
    value: (u) => u.searchParams.map(([k, v]) => `${k}=${v}`).join(', '),
  },
  { key: 'hash', label: 'Hash', icon: Hash, value: (u) => u.hash },
  { key: 'origin', label: 'Origin', icon: Info, value: (u) => u.origin },
];

export function UrlParserWorkspace() {
  const [input, setInput] = useState('');
  const [parsedUrl, setParsedUrl] = useState<ParsedUrl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);

  useEffect(() => {
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setInput(draft);
  }, []);

  useEffect(() => {
    if (input === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
    } else {
      window.localStorage.setItem(AUTOSAVE_KEY, input);
    }
  }, [input]);

  function handleParse() {
    const result = parseUrl(input);
    if (!result.ok) {
      setError(result.message);
      setParsedUrl(null);
      return;
    }
    setError(null);
    setParsedUrl(result.url);
  }

  function handleClear() {
    setInput('');
    setParsedUrl(null);
    setError(null);
  }

  function pickSample(url: string) {
    setInput(url);
    setSamplesOpen(false);
    const result = parseUrl(url);
    if (result.ok) {
      setError(null);
      setParsedUrl(result.url);
    }
  }

  async function copyRow(key: string, value: string) {
    if (value === '') return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  }

  async function copyAll() {
    if (!parsedUrl) return;
    const output = JSON.stringify(
      { ...parsedUrl, searchParams: Object.fromEntries(parsedUrl.searchParams) },
      null,
      2,
    );
    await navigator.clipboard.writeText(output);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  const breakdown = useMemo(() => {
    if (!parsedUrl) return null;
    const { protocol, username, password, hostname, port, pathname, search, hash } = parsedUrl;
    return (
      <span className="font-mono text-sm leading-6 break-all">
        <span className="text-success">{protocol}://</span>
        {username && (
          <span className="text-warning">
            {username}
            {password ? `:${password}` : ''}@
          </span>
        )}
        <span className="text-brand-strong font-semibold">{hostname}</span>
        {port && <span className="text-muted">:{port}</span>}
        <span className="text-foreground">{pathname}</span>
        {search && <span className="text-danger">{search}</span>}
        {hash && <span className="text-muted">{hash}</span>}
      </span>
    );
  }, [parsedUrl]);

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleParse();
          }}
          placeholder="Enter URL to parse…"
          spellCheck={false}
          className="border-border bg-background text-foreground min-w-[240px] flex-1 rounded-full border px-4 py-2 text-sm outline-none"
        />
        <Button variant="primary" size="sm" onClick={handleParse} disabled={input.trim() === ''}>
          <Repeat aria-hidden className="size-4" />
          Parse URL
        </Button>
        <Button variant="secondary" size="sm" onClick={handleClear} disabled={input === '' && !parsedUrl}>
          <Trash2 aria-hidden className="size-4" />
          Clear
        </Button>

        <div className="relative">
          <Button variant="secondary" size="sm" onClick={() => setSamplesOpen((open) => !open)}>
            <List aria-hidden className="size-4" />
            Sample URLs
            <ChevronDown aria-hidden className="size-3.5" />
          </Button>
          {samplesOpen && (
            <div className="border-border bg-surface absolute top-full left-0 z-10 mt-1 w-80 rounded-xl border p-1 shadow-lg">
              {SAMPLE_URLS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => pickSample(sample)}
                  className="hover:bg-surface-muted block w-full truncate rounded-lg px-3 py-2 text-left font-mono text-xs"
                >
                  {sample}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button variant="secondary" size="sm" onClick={() => void copyAll()} disabled={!parsedUrl} className="ml-auto">
          {copiedAll ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          Copy All
        </Button>
      </div>
      <p className="text-muted -mt-2 text-xs">Examples: https://example.com/path?name=value#section</p>

      {error && <Notice>{error}</Notice>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col">
          <p className="mb-2 text-sm font-semibold">Parsed Components</p>
          <div className="border-border bg-background divide-border flex-1 divide-y rounded-2xl border">
            {ROWS.map((row) => {
              const value = parsedUrl ? row.value(parsedUrl) : '';
              const Icon = row.icon;
              return (
                <div key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="text-muted flex w-40 shrink-0 items-center gap-2 text-sm">
                    <Icon aria-hidden className="size-4" />
                    {row.label}
                  </div>
                  <p className="min-w-0 flex-1 truncate font-mono text-sm">
                    {value === '' ? <span className="text-muted">—</span> : value}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyRow(row.key, value)}
                    disabled={value === ''}
                    aria-label={`Copy ${row.label}`}
                    className="text-muted hover:text-foreground shrink-0 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {copiedKey === row.key ? (
                      <Check aria-hidden className="size-3.5" />
                    ) : (
                      <Copy aria-hidden className="size-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <p className="mb-2 text-sm font-semibold">URL Breakdown</p>
          <div className="border-border bg-background flex flex-1 flex-col gap-4 rounded-2xl border p-4">
            {!parsedUrl ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="border-border bg-surface flex w-56 flex-col gap-1.5 rounded-xl border p-2">
                  <div className="flex items-center gap-1">
                    <span className="bg-muted/40 size-2 rounded-full" />
                    <span className="bg-muted/40 size-2 rounded-full" />
                    <span className="bg-muted/40 size-2 rounded-full" />
                  </div>
                  <div className="border-border bg-background flex items-center gap-1.5 rounded-full border px-2 py-1">
                    <Search aria-hidden className="text-muted size-3" />
                    <span className="bg-muted/30 h-1.5 flex-1 rounded-full" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Enter a URL and click &quot;Parse URL&quot;</p>
                  <p className="text-muted text-xs">The URL components will be displayed here.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-border bg-surface rounded-xl border p-3">{breakdown}</div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Query Parameters</p>
                  {parsedUrl.searchParams.length === 0 ? (
                    <p className="text-muted text-xs">This URL has no query parameters.</p>
                  ) : (
                    <div className="border-border divide-border overflow-hidden divide-y rounded-xl border">
                      {parsedUrl.searchParams.map(([key, value], index) => (
                        <div key={`${key}-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="text-brand-strong font-mono font-medium">{key}</span>
                          <span className="text-muted">=</span>
                          <span className="min-w-0 flex-1 truncate font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
