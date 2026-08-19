'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown01,
  ArrowDownAZ,
  ArrowDownZA,
  ArrowRight,
  Check,
  Copy,
  CopyMinus,
  Download,
  ListOrdered,
  Shuffle,
} from 'lucide-react';
import { ControlPanel, RadioOptionCard } from '@/components/text/control_panel';
import { TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { countLineStats, SORT_OPTIONS, sortLines, type SortMode } from '@/lib/text/text_sorter';

const PLACEHOLDER = 'Paste or type your text here, one item per line…';

const ICONS: Record<SortMode, typeof ArrowDownAZ> = {
  az: ArrowDownAZ,
  za: ArrowDownZA,
  numeric: ArrowDown01,
  natural: ListOrdered,
  shuffle: Shuffle,
  dedupe: CopyMinus,
};

export function TextSorterWorkspace() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<SortMode>('az');
  const [shuffleTick, setShuffleTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Shuffle is random by nature; shuffleTick isn't read inside the callback, only bumped by
  // selectMode() below to force a fresh shuffle on demand — otherwise the input and mode alone
  // would memoize to the same shuffled order forever.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => sortLines(text, mode), [text, mode, shuffleTick]);

  const inputStats = countLineStats(text);
  const resultStats = countLineStats(result);

  function selectMode(next: SortMode) {
    setMode(next);
    if (next === 'shuffle') setShuffleTick((tick) => tick + 1);
  }

  async function copyAll() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadAll() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.text-sorter');
      const output = await processor(
        { files: [], text, options: { mode } },
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
      <Textarea
        value={result}
        readOnly
        placeholder="The arranged text will appear here."
        className="font-mono min-h-0 flex-1 resize-none"
      />
      <p className="text-muted mt-2 text-xs">
        {resultStats.lines.toLocaleString()} lines · {resultStats.words.toLocaleString()} words ·{' '}
        {resultStats.uniqueLines.toLocaleString()} unique
      </p>
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={setText}
          placeholder={PLACEHOLDER}
          autosaveKey="text-sorter"
          inputLabel="Input Text"
          expandedOutput={resultOutput}
          expandedOutputLabel="Result"
        />

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Text</p>
              <p className="text-muted text-xs">{inputStats.lines.toLocaleString()} lines</p>
            </div>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={PLACEHOLDER}
              className="font-mono min-h-[40vh]"
            />
            <p className="text-muted mt-2 text-xs">
              {inputStats.lines.toLocaleString()} lines · {inputStats.words.toLocaleString()} words
              · {inputStats.uniqueLines.toLocaleString()} unique
            </p>
          </div>

          <div className="hidden items-center justify-center sm:flex">
            <span className="border-border bg-background text-muted flex size-8 items-center justify-center rounded-full border">
              <ArrowRight aria-hidden className="size-4" />
            </span>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Result</p>
              <p className="text-muted text-xs">{resultStats.lines.toLocaleString()} lines</p>
            </div>
            <Textarea
              value={result}
              readOnly
              placeholder="The arranged text will appear here."
              className="font-mono min-h-[40vh]"
            />
            <p className="text-muted mt-2 text-xs">
              {resultStats.lines.toLocaleString()} lines · {resultStats.words.toLocaleString()}{' '}
              words · {resultStats.uniqueLines.toLocaleString()} unique
            </p>
            {notice && <p className="text-danger mt-1 text-xs">{notice}</p>}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="border-border bg-surface rounded-2xl border p-4">
          <ControlPanel>
            <div>
              <p className="text-sm font-semibold">Sort & Shuffle Options</p>
              <p className="text-muted text-xs">Choose how you want to arrange your text.</p>
            </div>
            <div className="flex flex-col gap-2">
              {SORT_OPTIONS.map((option) => (
                <RadioOptionCard
                  key={option.id}
                  icon={ICONS[option.id]}
                  label={option.label}
                  description={option.description}
                  selected={mode === option.id}
                  onSelect={() => selectMode(option.id)}
                />
              ))}
            </div>
          </ControlPanel>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 text-sm font-semibold">Result</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={copyAll}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="flex-1" onClick={downloadAll}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
