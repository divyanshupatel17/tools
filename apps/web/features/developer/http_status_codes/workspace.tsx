'use client';

import { useState } from 'react';
import { BookOpen, Info, Lightbulb, Search, Trash2 } from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { CLASS_LABELS, findStatusCode, statusClassOf, STATUS_CODES, type StatusClass } from './status_codes';

const EXAMPLE_CODES = [200, 404, 500];

const CLASS_TEXT: Record<StatusClass, string> = {
  '1xx': 'text-success',
  '2xx': 'text-success',
  '3xx': 'text-warning',
  '4xx': 'text-warning',
  '5xx': 'text-danger',
};

const CLASS_BG: Record<StatusClass, string> = {
  '1xx': 'bg-success/10',
  '2xx': 'bg-success/10',
  '3xx': 'bg-warning/10',
  '4xx': 'bg-warning/10',
  '5xx': 'bg-danger/10',
};

const CLASS_BORDER: Record<StatusClass, string> = {
  '1xx': 'border-success',
  '2xx': 'border-success',
  '3xx': 'border-warning',
  '4xx': 'border-warning',
  '5xx': 'border-danger',
};

const CLASS_ORDER: StatusClass[] = ['1xx', '2xx', '3xx', '4xx', '5xx'];

export function HttpStatusCodesWorkspace() {
  const [input, setInput] = useState('404');
  const [activeCode, setActiveCode] = useState<number | null>(404);
  const [notice, setNotice] = useState<string | null>(null);

  const entry = activeCode !== null ? findStatusCode(activeCode) : undefined;

  function lookup(raw: string) {
    const code = Number.parseInt(raw.trim(), 10);
    if (!Number.isInteger(code) || raw.trim() === '') {
      setNotice('Enter a numeric HTTP status code, such as 404.');
      setActiveCode(null);
      return;
    }
    if (!findStatusCode(code)) {
      setNotice(`${code} is not a registered HTTP status code.`);
      setActiveCode(null);
      return;
    }
    setNotice(null);
    setActiveCode(code);
  }

  function pickCode(code: number) {
    setInput(String(code));
    setNotice(null);
    setActiveCode(code);
  }

  function handleClear() {
    setInput('');
    setActiveCode(null);
    setNotice(null);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="http-status-code-input" className="text-sm font-semibold">
          Enter HTTP Status Code
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="http-status-code-input"
            name="status-code"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') lookup(input);
            }}
            inputMode="numeric"
            placeholder="e.g. 404"
            className="border-border bg-background text-foreground min-w-[160px] flex-1 rounded-full border px-4 py-2 text-sm outline-none"
          />
          <Button variant="primary" size="sm" onClick={() => lookup(input)} disabled={input.trim() === ''}>
            <Search aria-hidden className="size-4" />
            Lookup
          </Button>
          <Button variant="secondary" size="sm" onClick={handleClear} disabled={input === '' && activeCode === null}>
            <Trash2 aria-hidden className="size-4" />
            Clear
          </Button>
        </div>
        <p className="text-muted text-xs">
          Example:{' '}
          {EXAMPLE_CODES.map((code, index) => (
            <span key={code}>
              <button
                type="button"
                onClick={() => pickCode(code)}
                className={`font-mono font-medium hover:underline ${CLASS_TEXT[statusClassOf(code)]}`}
              >
                {code}
              </button>
              {index < EXAMPLE_CODES.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      </div>

      {notice && <Notice>{notice}</Notice>}

      {entry && (
        <div className={`border-border bg-background flex flex-col gap-4 rounded-2xl border border-l-4 p-4 ${CLASS_BORDER[entry.statusClass]}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              <div className="flex flex-col">
                <p className="text-muted text-xs font-medium">Status Code</p>
                <p className={`font-mono text-4xl font-bold ${CLASS_TEXT[entry.statusClass]}`}>{entry.code}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-muted text-xs font-medium">Reason Phrase</p>
                <p className="text-lg font-semibold">{entry.name}</p>
                <p className="text-muted text-sm">{entry.description}</p>
                {entry.note && <p className="text-warning text-xs font-medium">{entry.note}</p>}
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${CLASS_TEXT[entry.statusClass]} ${CLASS_BG[entry.statusClass]}`}>
              {CLASS_LABELS[entry.statusClass]} ({entry.statusClass})
            </span>
          </div>

          <div className="border-border grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${CLASS_BG[entry.statusClass]}`}>
                <Info aria-hidden className={`size-4 ${CLASS_TEXT[entry.statusClass]}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">Category</p>
                <p className="text-muted text-xs">
                  {entry.statusClass} {CLASS_LABELS[entry.statusClass]}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="bg-warning/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                <Lightbulb aria-hidden className="text-warning size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Common Use</p>
                <p className="text-muted text-xs">{entry.commonUse}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="bg-brand/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                <BookOpen aria-hidden className="text-brand-strong size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">RFC Reference</p>
                <p className="text-muted text-xs">
                  Defined in{' '}
                  <a href={entry.rfcUrl} target="_blank" rel="noreferrer" className="text-brand-strong hover:underline">
                    {entry.rfc}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-border bg-background flex flex-col gap-3 rounded-2xl border p-4">
        <p className="text-sm font-semibold">Common Status Codes</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {CLASS_ORDER.map((statusClass) => (
            <div key={statusClass} className="flex flex-col gap-1.5">
              <p className={`text-xs font-semibold ${CLASS_TEXT[statusClass]}`}>
                {statusClass} {CLASS_LABELS[statusClass]}
              </p>
              {STATUS_CODES.filter((code) => code.statusClass === statusClass).map((code) => (
                <button
                  key={code.code}
                  type="button"
                  onClick={() => pickCode(code.code)}
                  className="hover:bg-surface-muted flex items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm"
                >
                  <span className="text-muted w-9 shrink-0 font-mono text-xs">{code.code}</span>
                  <span className="truncate">{code.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
