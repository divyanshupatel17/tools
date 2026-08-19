'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Download, Info } from 'lucide-react';
import { NumberedTextarea } from '@/components/text/numbered_textarea';
import { TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  editLines,
  LINE_NUMBER_FORMATS,
  type FilterMode,
  type LineEditorOptions,
  type LineNumberFormat,
} from '@/lib/text/line_editor';

const PLACEHOLDER = 'Paste or type your text here, one item per line…';

interface LineStats {
  lines: number;
  words: number;
  characters: number;
}

function countLines(text: string): LineStats {
  const trimmed = text.trim();
  return {
    lines: text === '' ? 0 : text.split('\n').length,
    words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    characters: text.length,
  };
}

function LineStatsFooter({ stats }: { stats: LineStats }) {
  return (
    <p className="text-muted mt-2 text-xs">
      {stats.lines.toLocaleString()} lines · {stats.words.toLocaleString()} words ·{' '}
      {stats.characters.toLocaleString()} characters
    </p>
  );
}

const FILTER_MODES: ReadonlyArray<{ id: FilterMode; label: string; placeholder?: string }> = [
  { id: 'all', label: 'Keep all lines' },
  { id: 'keep_contains', label: 'Keep lines that contain', placeholder: 'Enter text to search' },
  {
    id: 'remove_contains',
    label: 'Remove lines that contain',
    placeholder: 'Enter text to search',
  },
  { id: 'keep_regex', label: 'Keep lines that match regex', placeholder: 'Enter regex pattern' },
];

export function LineEditorWorkspace() {
  const [text, setText] = useState('');
  const [addPrefix, setAddPrefix] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [addSuffix, setAddSuffix] = useState(false);
  const [suffix, setSuffix] = useState('');
  const [addLineNumbers, setAddLineNumbers] = useState(false);
  const [startFrom, setStartFrom] = useState(1);
  const [numberFormat, setNumberFormat] = useState<LineNumberFormat>('plain');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterText, setFilterText] = useState('');
  const [filterRegex, setFilterRegex] = useState('');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const options: LineEditorOptions = useMemo(
    () => ({
      add_prefix: addPrefix,
      prefix,
      add_suffix: addSuffix,
      suffix,
      add_line_numbers: addLineNumbers,
      start_from: startFrom,
      number_format: numberFormat,
      filter_mode: filterMode,
      filter_text: filterText,
      filter_regex: filterRegex,
    }),
    [
      addPrefix,
      prefix,
      addSuffix,
      suffix,
      addLineNumbers,
      startFrom,
      numberFormat,
      filterMode,
      filterText,
      filterRegex,
    ],
  );

  // Pure by design: computing this must never call setState mid render, so a bad regex is
  // reported as a value (`liveError`), not as a side effect.
  const { result, error: liveError } = useMemo(() => {
    try {
      return { result: editLines(text, options), error: null as string | null };
    } catch (error) {
      return {
        result: text,
        error: error instanceof Error ? error.message : 'That regular expression is not valid.',
      };
    }
  }, [text, options]);

  const displayNotice = notice ?? liveError;
  const inputStats = countLines(text);
  const resultStats = countLines(result);

  async function copyResult() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadResult() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.line-editor');
      const output = await processor(
        { files: [], text, options: { ...options } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const resultOutput = (
    <>
      <NumberedTextarea value={result} readOnly placeholder="Your output will appear here." />
      <LineStatsFooter stats={resultStats} />
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={setText}
          placeholder={PLACEHOLDER}
          autosaveKey="line-editor"
          inputLabel="Input Text"
          expandedOutput={resultOutput}
          expandedOutputLabel="Output"
        />

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Text</p>
              <p className="text-muted text-xs">{inputStats.lines.toLocaleString()} lines</p>
            </div>
            <NumberedTextarea value={text} onChange={setText} placeholder={PLACEHOLDER} />
            <LineStatsFooter stats={inputStats} />
          </div>

          <div className="hidden items-center justify-center sm:flex">
            <span className="border-border bg-background text-muted flex size-8 items-center justify-center rounded-full border">
              <ArrowRight aria-hidden className="size-4" />
            </span>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Output</p>
              <p className="text-muted text-xs">{resultStats.lines.toLocaleString()} lines</p>
            </div>
            <NumberedTextarea value={result} readOnly placeholder="Your output will appear here." />
            <LineStatsFooter stats={resultStats} />
            {displayNotice && <p className="text-danger mt-1 text-xs">{displayNotice}</p>}
          </div>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4 lg:sticky lg:top-20">
        <div>
          <p className="text-sm font-semibold">Line Editor Options</p>
          <p className="text-muted text-xs">Choose how you want to edit your lines.</p>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">Add Options</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addPrefix}
              onChange={(event) => setAddPrefix(event.target.checked)}
              className="accent-brand size-4"
            />
            <span className="font-medium">Add Prefix to each line</span>
          </label>
          <input
            type="text"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            placeholder="Enter prefix (e.g. > )"
            disabled={!addPrefix}
            className="border-border bg-background w-full rounded-lg border px-3 py-1.5 text-xs outline-none disabled:opacity-50"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addSuffix}
              onChange={(event) => setAddSuffix(event.target.checked)}
              className="accent-brand size-4"
            />
            <span className="font-medium">Add Suffix to each line</span>
          </label>
          <input
            type="text"
            value={suffix}
            onChange={(event) => setSuffix(event.target.value)}
            placeholder="Enter suffix (e.g. ;)"
            disabled={!addSuffix}
            className="border-border bg-background w-full rounded-lg border px-3 py-1.5 text-xs outline-none disabled:opacity-50"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addLineNumbers}
              onChange={(event) => setAddLineNumbers(event.target.checked)}
              className="accent-brand size-4"
            />
            <span className="font-medium">Add Line Numbers</span>
          </label>
          {addLineNumbers && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="text-muted">Start from</span>
                <NumberField
                  value={startFrom}
                  onChange={setStartFrom}
                  min={0}
                  max={100000}
                  className="border-border bg-background mt-1 h-8 w-full rounded-lg border px-2.5 text-xs outline-none"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted">Format</span>
                <select
                  value={numberFormat}
                  onChange={(event) => setNumberFormat(event.target.value as LineNumberFormat)}
                  className="border-border bg-background mt-1 h-8 w-full rounded-lg border px-2 text-xs outline-none"
                >
                  {LINE_NUMBER_FORMATS.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">Filter Lines</p>
          {FILTER_MODES.map((mode) => (
            <label key={mode.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="line-editor-filter"
                checked={filterMode === mode.id}
                onChange={() => setFilterMode(mode.id)}
                className="accent-brand mt-0.5 size-4"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium">
                  {mode.label}
                  {mode.id === 'keep_regex' && (
                    <Info aria-hidden className="text-muted size-3.5" />
                  )}
                </span>
                {mode.id !== 'all' && (
                  <input
                    type="text"
                    value={mode.id === 'keep_regex' ? filterRegex : filterText}
                    onChange={(event) =>
                      mode.id === 'keep_regex'
                        ? setFilterRegex(event.target.value)
                        : setFilterText(event.target.value)
                    }
                    placeholder={mode.placeholder}
                    disabled={filterMode !== mode.id}
                    className="border-border bg-background mt-1.5 w-full rounded-lg border px-3 py-1.5 text-xs outline-none disabled:opacity-50"
                  />
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copyResult}>
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button className="flex-1" onClick={downloadResult}>
            <Download aria-hidden className="size-4" />
            Download
          </Button>
        </div>
      </aside>
    </div>
  );
}
