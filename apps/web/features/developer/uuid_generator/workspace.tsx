'use client';

import { useState } from 'react';
import { Check, Copy, Download, Minus, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { generateUuids, NAMESPACE_PRESETS, type UuidVersion } from './uuid';

const MIN_COUNT = 1;
const MAX_COUNT = 10000;

const VERSION_LABELS: Record<UuidVersion, string> = {
  v1: 'Version 1 (Timestamp)',
  v4: 'Version 4 (Random)',
  v3: 'Version 3 (MD5 Namespace)',
  v5: 'Version 5 (SHA1 Namespace)',
};

const NAME_BASED_VERSIONS = new Set<UuidVersion>(['v3', 'v5']);

type NamespacePreset = keyof typeof NAMESPACE_PRESETS | 'custom';

export function UuidGeneratorWorkspace() {
  const [version, setVersion] = useState<UuidVersion>('v4');
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(true);
  const [hyphen, setHyphen] = useState(true);
  const [braces, setBraces] = useState(false);
  const [namespacePreset, setNamespacePreset] = useState<NamespacePreset>('DNS');
  const [customNamespace, setCustomNamespace] = useState('');
  const [name, setName] = useState('');
  const [uuids, setUuids] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);

  const isNameBased = NAME_BASED_VERSIONS.has(version);
  const namespace = namespacePreset === 'custom' ? customNamespace : NAMESPACE_PRESETS[namespacePreset];
  const namespaceValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(namespace);

  async function generate() {
    setNotice(null);
    if (isNameBased && (!namespaceValid || name.trim() === '')) {
      setNotice('Enter a valid namespace UUID and a name to generate this version.');
      return;
    }
    setBusy(true);
    try {
      const result = await generateUuids({
        version,
        count: isNameBased ? 1 : count,
        format: { uppercase, hyphen, braces },
        namespace,
        name,
      });
      setUuids(result);
    } catch {
      setNotice('Could not generate UUIDs with these options.');
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    if (uuids.length === 0) return;
    await navigator.clipboard.writeText(uuids.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  async function copyRow(index: number) {
    const value = uuids[index];
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedRow(index);
    setTimeout(() => setCopiedRow((current) => (current === index ? null : current)), 2000);
  }

  function downloadResults() {
    if (uuids.length === 0) return;
    downloadBlob(new Blob([uuids.join('\n')], { type: 'text/plain' }), 'uuids.txt');
  }

  function clearAll() {
    setUuids([]);
    setNotice(null);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          {!isNameBased && (
            <div className="flex flex-col gap-1.5">
              <p className="text-muted text-xs font-medium">How many UUIDs?</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCount((current) => Math.max(MIN_COUNT, current - 1))}
                  disabled={count <= MIN_COUNT}
                  aria-label="Decrease count"
                  className="border-border bg-background text-foreground hover:bg-surface-muted flex size-9 items-center justify-center rounded-full border disabled:pointer-events-none disabled:opacity-40"
                >
                  <Minus aria-hidden className="size-4" />
                </button>
                <NumberField
                  value={count}
                  onChange={(value) => setCount(value)}
                  min={MIN_COUNT}
                  max={MAX_COUNT}
                  aria-label="Number of UUIDs"
                  className="border-border bg-background h-9 w-20 rounded-full border text-center text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setCount((current) => Math.min(MAX_COUNT, current + 1))}
                  disabled={count >= MAX_COUNT}
                  aria-label="Increase count"
                  className="border-border bg-background text-foreground hover:bg-surface-muted flex size-9 items-center justify-center rounded-full border disabled:pointer-events-none disabled:opacity-40"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">UUID Version</p>
            <select
              id="uuid-version"
              name="uuid-version"
              value={version}
              onChange={(event) => setVersion(event.target.value as UuidVersion)}
              className="border-border bg-background text-foreground h-9 rounded-full border px-3 text-sm outline-none"
              aria-label="UUID version"
            >
              {(Object.keys(VERSION_LABELS) as UuidVersion[]).map((value) => (
                <option key={value} value={value}>
                  {VERSION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">Options</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-foreground flex items-center gap-1.5 text-sm">
                <input
                  id="uuid-uppercase"
                  name="uuid-uppercase"
                  type="checkbox"
                  checked={uppercase}
                  onChange={(event) => setUppercase(event.target.checked)}
                  className="accent-brand size-4"
                />
                Uppercase (A-F)
              </label>
              <label className="text-foreground flex items-center gap-1.5 text-sm">
                <input
                  id="uuid-hyphen"
                  name="uuid-hyphen"
                  type="checkbox"
                  checked={hyphen}
                  onChange={(event) => setHyphen(event.target.checked)}
                  className="accent-brand size-4"
                />
                Hyphen (-)
              </label>
              <label className="text-foreground flex items-center gap-1.5 text-sm">
                <input
                  id="uuid-braces"
                  name="uuid-braces"
                  type="checkbox"
                  checked={braces}
                  onChange={(event) => setBraces(event.target.checked)}
                  className="accent-brand size-4"
                />
                Braces {'{ }'}
              </label>
            </div>
          </div>
        </div>

        <Button variant="primary" size="sm" onClick={() => void generate()} disabled={busy}>
          <Sparkles aria-hidden className="size-4" />
          {busy ? 'Generating…' : 'Generate UUIDs'}
        </Button>
      </div>

      {isNameBased && (
        <div className="border-border bg-background flex flex-wrap items-end gap-3 rounded-2xl border p-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">Namespace</p>
            <select
              id="uuid-namespace-preset"
              name="uuid-namespace-preset"
              value={namespacePreset}
              onChange={(event) => setNamespacePreset(event.target.value as NamespacePreset)}
              className="border-border bg-surface text-foreground h-9 rounded-full border px-3 text-sm outline-none"
              aria-label="Namespace preset"
            >
              <option value="DNS">DNS</option>
              <option value="URL">URL</option>
              <option value="OID">OID</option>
              <option value="X500">X500</option>
              <option value="custom">Custom UUID</option>
            </select>
          </div>
          {namespacePreset === 'custom' && (
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <p className="text-muted text-xs font-medium">Namespace UUID</p>
              <input
                id="uuid-custom-namespace"
                name="uuid-custom-namespace"
                value={customNamespace}
                onChange={(event) => setCustomNamespace(event.target.value)}
                placeholder="e.g. 6ba7b810-9dad-11d1-80b4-00c04fd430c8"
                spellCheck={false}
                className="border-border bg-surface h-9 rounded-full border px-3 font-mono text-sm outline-none"
              />
            </div>
          )}
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">Name</p>
            <input
              id="uuid-name"
              name="uuid-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. example.com"
              className="border-border bg-surface h-9 rounded-full border px-3 text-sm outline-none"
            />
          </div>
        </div>
      )}

      {notice && <Notice>{notice}</Notice>}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Generated UUIDs</p>
            {uuids.length > 0 && (
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {uuids.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copyAll()} disabled={uuids.length === 0}>
              {copiedAll ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              Copy All
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadResults} disabled={uuids.length === 0}>
              <Download aria-hidden className="size-4" />
              Download (.txt)
            </Button>
            <Button variant="secondary" size="sm" onClick={clearAll} disabled={uuids.length === 0}>
              <Trash2 aria-hidden className="size-4" />
              Clear All
            </Button>
          </div>
        </div>

        {uuids.length === 0 ? (
          <p className="text-muted border-border bg-background rounded-2xl border border-dashed px-4 py-8 text-center text-sm">
            No UUIDs generated yet. Choose your options and click Generate UUIDs.
          </p>
        ) : (
          <div className="border-border bg-background divide-border max-h-[28rem] divide-y overflow-y-auto rounded-2xl border">
            {uuids.map((value, index) => (
              <div key={`${value}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                <p className="text-muted w-14 shrink-0 text-sm">{index + 1}</p>
                <p className="flex-1 truncate font-mono text-sm">{value}</p>
                <button
                  type="button"
                  onClick={() => void copyRow(index)}
                  aria-label={`Copy UUID ${index + 1}`}
                  className="text-muted hover:text-foreground shrink-0"
                >
                  {copiedRow === index ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
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
