'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Fingerprint,
  Hash,
  Info,
  Lock,
  Minus,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { decodeJwt, formatClaimText, formatClaimTimestamp, type DecodedJwt } from './jwt';

const AUTOSAVE_KEY = 'developer-tool:jwt-decoder';

interface OverviewRow {
  key: string;
  label: string;
  icon: typeof Hash;
  value: (jwt: DecodedJwt) => string | null;
}

const OVERVIEW_ROWS: OverviewRow[] = [
  { key: 'alg', label: 'Algorithm', icon: Hash, value: (jwt) => formatClaimText(jwt.header.alg) },
  {
    key: 'iat',
    label: 'Issued At (iat)',
    icon: Hash,
    value: (jwt) => formatClaimTimestamp(jwt.payload.iat),
  },
  {
    key: 'exp',
    label: 'Expires At (exp)',
    icon: Hash,
    value: (jwt) => formatClaimTimestamp(jwt.payload.exp),
  },
  {
    key: 'nbf',
    label: 'Not Before (nbf)',
    icon: Hash,
    value: (jwt) => formatClaimTimestamp(jwt.payload.nbf),
  },
  { key: 'sub', label: 'Subject (sub)', icon: User, value: (jwt) => formatClaimText(jwt.payload.sub) },
  { key: 'jti', label: 'JWT ID (jti)', icon: Fingerprint, value: (jwt) => formatClaimText(jwt.payload.jti) },
];

function CollapsiblePanel({
  title,
  badge,
  badgeClassName,
  boxClassName,
  content,
  copyValue,
}: {
  title: string;
  badge: string;
  badgeClassName: string;
  boxClassName: string;
  content: string;
  copyValue: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!copyValue) return;
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClassName}`}>{badge}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!copyValue}
            aria-label={`Copy ${title}`}
            className="text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="text-muted hover:text-foreground"
          >
            {open ? <Minus aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
          </button>
        </div>
      </div>
      {open && (
        <pre
          className={`overflow-auto rounded-2xl border p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words ${boxClassName}`}
        >
          {content}
        </pre>
      )}
    </div>
  );
}

export function JwtDecoderWorkspace() {
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);
  const [expiryStatus, setExpiryStatus] = useState<'expired' | 'valid' | null>(null);

  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setToken(draft);
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (token === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
    } else {
      window.localStorage.setItem(AUTOSAVE_KEY, token);
    }
  }, [token]);

  function handleDecode() {
    const result = decodeJwt(token);
    if (!result.ok) {
      setNotice(result.message);
      setDecoded(null);
      setExpiryStatus(null);
      return;
    }
    setNotice(null);
    setDecoded(result.jwt);
    const exp = result.jwt.payload.exp;
    setExpiryStatus(
      typeof exp === 'number' && Number.isFinite(exp) ? (exp * 1000 < Date.now() ? 'expired' : 'valid') : null,
    );
  }

  function handleClear() {
    setToken('');
    setDecoded(null);
    setExpiryStatus(null);
    setNotice(null);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold">Enter JWT Token</p>
          <span title="A JWT has three Base64Url parts separated by periods.">
            <Info aria-hidden className="text-muted size-3.5" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleClear} disabled={token === '' && !decoded}>
            <Trash2 aria-hidden className="size-4" />
            Clear
          </Button>
          <Button variant="primary" size="sm" onClick={handleDecode} disabled={token.trim() === ''}>
            <Lock aria-hidden className="size-4" />
            Decode Token
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <textarea
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            setDecoded(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleDecode();
          }}
          placeholder="Paste your JWT token here…"
          spellCheck={false}
          className="border-border bg-background h-32 min-h-[8rem] resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none"
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className="text-muted">
            JWT format:{' '}
            <span className="text-danger font-mono">header</span>
            <span className="text-muted">.</span>
            <span className="font-mono text-[color:var(--accent-developer)]">payload</span>
            <span className="text-muted">.</span>
            <span className="text-success font-mono">signature</span>
          </p>
          <p className="text-muted">{token.length} characters</p>
        </div>
      </div>

      {notice && <Notice>{notice}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold">JWT Structure</p>
            <div className="flex items-center gap-1 overflow-x-auto">
              <div className="border-danger bg-danger/10 flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center">
                <p className="text-danger text-sm font-semibold">Header</p>
                <p className="text-danger/80 text-xs">Base64Url</p>
              </div>
              <span className="text-muted">.</span>
              <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-[color:var(--accent-developer)] bg-[color:var(--accent-developer)]/10 px-3 py-2 text-center">
                <p className="text-sm font-semibold text-[color:var(--accent-developer)]">Payload</p>
                <p className="text-xs text-[color:var(--accent-developer)]/80">Base64Url</p>
              </div>
              <span className="text-muted">.</span>
              <div className="border-success bg-success/10 flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center">
                <p className="text-success text-sm font-semibold">Signature</p>
                <p className="text-success/80 text-xs">Base64Url</p>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-semibold">Token Overview</p>
              {expiryStatus && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    expiryStatus === 'expired' ? 'text-danger bg-danger/10' : 'text-success bg-success/10'
                  }`}
                >
                  {expiryStatus === 'expired' ? 'Expired' : 'Valid'}
                </span>
              )}
            </div>
            <div className="border-border bg-background divide-border divide-y rounded-2xl border">
              {OVERVIEW_ROWS.map((row) => {
                const value = decoded ? row.value(decoded) : null;
                const Icon = row.icon;
                return (
                  <div key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="text-muted flex flex-1 items-center gap-2 text-sm">
                      <Icon aria-hidden className="size-4" />
                      {row.label}
                    </div>
                    <p className="max-w-[55%] truncate text-right font-mono text-sm">
                      {value ?? <span className="text-muted">—</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <CollapsiblePanel
            title="Header"
            badge="JSON"
            badgeClassName="text-danger bg-danger/10"
            boxClassName="border-danger/40 bg-danger/5"
            content={decoded ? JSON.stringify(decoded.header, null, 2) : '{\n  No header decoded yet.\n}'}
            copyValue={decoded ? JSON.stringify(decoded.header, null, 2) : null}
          />
          <CollapsiblePanel
            title="Payload"
            badge="JSON"
            badgeClassName="bg-[color:var(--accent-developer)]/10 text-[color:var(--accent-developer)]"
            boxClassName="border-[color:var(--accent-developer)]/40 bg-[color:var(--accent-developer)]/5"
            content={decoded ? JSON.stringify(decoded.payload, null, 2) : '{\n  No payload decoded yet.\n}'}
            copyValue={decoded ? JSON.stringify(decoded.payload, null, 2) : null}
          />
          <CollapsiblePanel
            title="Signature"
            badge="Text"
            badgeClassName="text-success bg-success/10"
            boxClassName="border-success/40 bg-success/5"
            content={decoded ? decoded.signature : 'No signature decoded yet.'}
            copyValue={decoded ? decoded.signature : null}
          />
        </div>
      </div>
    </div>
  );
}
