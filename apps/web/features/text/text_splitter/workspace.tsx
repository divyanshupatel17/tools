'use client';

import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  Check,
  Combine,
  Copy,
  Download,
  GripVertical,
  SplitSquareHorizontal,
} from 'lucide-react';
import { RadioOptionCard } from '@/components/text/control_panel';
import { TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  joinLines,
  splitText,
  SPLIT_DELIMITERS,
  type SplitDelimiterId,
  type SplitJoinOptions,
  type TextSplitterOperation,
} from '@/lib/text/text_splitter';

const PLACEHOLDER_SPLIT = 'Paste or type your text here…';
const PLACEHOLDER_JOIN = 'Paste one item per line here…';

interface SplitItem {
  id: string;
  text: string;
}

function toSplitItems(values: readonly string[]): SplitItem[] {
  return values.map((text, index) => ({ id: `${index}-${Math.random().toString(36).slice(2, 8)}`, text }));
}

export function TextSplitterWorkspace() {
  const [text, setText] = useState('');
  const [operation, setOperation] = useState<TextSplitterOperation>('split');
  const [splitDelimiter, setSplitDelimiter] = useState<SplitDelimiterId>('newline');
  const [customSplitDelimiter, setCustomSplitDelimiter] = useState('');
  const [joinDelimiter, setJoinDelimiter] = useState('');
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  const options: SplitJoinOptions = {
    split_delimiter: splitDelimiter,
    custom_split_delimiter: customSplitDelimiter,
    join_delimiter: joinDelimiter,
    remove_empty: removeEmpty,
    trim_whitespace: trimWhitespace,
  };

  const derivedItems = useMemo(
    () => toSplitItems(splitText(text, options)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, splitDelimiter, customSplitDelimiter, removeEmpty, trimWhitespace],
  );

  // Reordering only makes sense for the current split; a fresh derivation (new text or split
  // settings) should start from that fresh order again, not silently keep an old arrangement.
  // Comparing during render and adjusting state directly, same pattern as number_field.tsx.
  const [manualOrder, setManualOrder] = useState<SplitItem[] | null>(null);
  const [derivedSnapshot, setDerivedSnapshot] = useState(derivedItems);
  if (derivedItems !== derivedSnapshot) {
    setDerivedSnapshot(derivedItems);
    setManualOrder(null);
  }
  const items = manualOrder ?? derivedItems;

  const joinedResult = useMemo(
    () => joinLines(text, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, joinDelimiter, removeEmpty, trimWhitespace],
  );

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setManualOrder(next);
  }

  function handleDrop(index: number) {
    if (dragIndex.current !== null) reorder(dragIndex.current, index);
    dragIndex.current = null;
  }

  function handleGripKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      reorder(index, index - 1);
    } else if (event.key === 'ArrowDown' && index < items.length - 1) {
      event.preventDefault();
      reorder(index, index + 1);
    }
  }

  const resultText = operation === 'split' ? items.map((item) => item.text).join('\n') : joinedResult;
  const resultCharacters =
    operation === 'split'
      ? items.reduce((sum, item) => sum + item.text.length, 0)
      : joinedResult.length;

  async function copyResult() {
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadResult() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.text-splitter');
      const output = await processor(
        {
          files: [],
          text,
          options: {
            ...options,
            operation,
            items: operation === 'split' ? items.map((item) => item.text) : undefined,
          },
        },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const outputBadge = (
    <span className="border-border bg-cream/40 text-muted rounded-full border px-2.5 py-1 text-xs">
      {operation === 'split' ? 'List (Split)' : 'Text (Join)'}
    </span>
  );

  const outputBody = (
    <>
      {operation === 'split' ? (
        <div className="border-border min-h-[45vh] min-w-0 overflow-y-auto rounded-2xl border">
          {items.length === 0 ? (
            <p className="text-muted p-4 text-sm">Your split items will appear here.</p>
          ) : (
            <ul className="divide-border divide-y">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => {
                    dragIndex.current = index;
                  }}
                  onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <span className="text-muted w-6 shrink-0 text-right text-xs">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{item.text}</span>
                  <button
                    type="button"
                    onKeyDown={(event) => handleGripKeyDown(event, index)}
                    aria-label={`Reorder item ${index + 1}`}
                    className="text-muted hover:text-foreground shrink-0 cursor-grab rounded p-1 active:cursor-grabbing"
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Textarea
          value={joinedResult}
          readOnly
          placeholder="The joined result will appear here."
          className="font-mono min-h-[45vh]"
        />
      )}

      <p className="text-muted mt-2 text-xs">
        {operation === 'split'
          ? `${items.length} items · ${resultCharacters} characters`
          : `${resultCharacters} characters`}
      </p>
      {notice && <p className="text-danger mt-1 text-xs">{notice}</p>}
    </>
  );

  const outputPanel = (
    <>
      <div className="mb-2 flex justify-end">{outputBadge}</div>
      {outputBody}
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={setText}
          placeholder={operation === 'split' ? PLACEHOLDER_SPLIT : PLACEHOLDER_JOIN}
          autosaveKey="text-splitter"
          inputLabel="Input Text"
          expandedOutput={outputPanel}
          expandedOutputLabel="Output"
        />

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Text</p>
              <p className="text-muted text-xs">
                {text === '' ? 0 : text.split('\n').length} lines · {text.length} characters
              </p>
            </div>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={operation === 'split' ? PLACEHOLDER_SPLIT : PLACEHOLDER_JOIN}
              className="font-mono min-h-[45vh]"
            />
            <p className="text-muted mt-2 text-xs">
              {text === '' ? 0 : text.split('\n').length} lines · {text.length} characters
            </p>
          </div>

          <div className="hidden items-center justify-center sm:flex">
            <span className="border-border bg-background text-muted flex size-8 items-center justify-center rounded-full border">
              <ArrowRight aria-hidden className="size-4" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Output</p>
              {outputBadge}
            </div>
            {outputBody}
          </div>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4 lg:sticky lg:top-20">
        <div>
          <p className="text-sm font-semibold">Operation</p>
          <p className="text-muted text-xs">Choose what you want to do.</p>
        </div>
        <div className="flex flex-col gap-2">
          <RadioOptionCard
            icon={SplitSquareHorizontal}
            label="Split"
            description="Split text into multiple parts."
            selected={operation === 'split'}
            onSelect={() => setOperation('split')}
          />
          <RadioOptionCard
            icon={Combine}
            label="Join"
            description="Join a list of items into one line."
            selected={operation === 'join'}
            onSelect={() => setOperation('join')}
          />
        </div>

        <label className="text-sm">
          <span className="font-semibold">Delimiter (for Split)</span>
          <span className="text-muted mt-0.5 block text-xs">Choose how to split the text.</span>
          <select
            value={splitDelimiter}
            onChange={(event) => setSplitDelimiter(event.target.value as SplitDelimiterId)}
            disabled={operation !== 'split'}
            className="border-border bg-background mt-1.5 h-10 w-full rounded-lg border px-3 text-sm outline-none disabled:opacity-50"
          >
            {SPLIT_DELIMITERS.map((delimiter) => (
              <option key={delimiter.id} value={delimiter.id}>
                {delimiter.label}
              </option>
            ))}
          </select>
          {splitDelimiter === 'custom' && (
            <input
              type="text"
              value={customSplitDelimiter}
              onChange={(event) => setCustomSplitDelimiter(event.target.value)}
              placeholder="Custom delimiter (e.g. | or ;)"
              disabled={operation !== 'split'}
              className="border-border bg-background mt-2 h-9 w-full rounded-lg border px-3 text-sm outline-none disabled:opacity-50"
            />
          )}
        </label>

        <label className="text-sm">
          <span className="font-semibold">Delimiter (for Join)</span>
          <span className="text-muted mt-0.5 block text-xs">Choose how to join the items.</span>
          <input
            type="text"
            value={joinDelimiter}
            onChange={(event) => setJoinDelimiter(event.target.value)}
            placeholder="Enter delimiter (e.g., or | or -)"
            disabled={operation !== 'join'}
            className="border-border bg-background mt-1.5 h-10 w-full rounded-lg border px-3 text-sm outline-none disabled:opacity-50"
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Advanced Options</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeEmpty}
              onChange={(event) => setRemoveEmpty(event.target.checked)}
              className="accent-brand size-4"
            />
            Remove empty lines
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trimWhitespace}
              onChange={(event) => setTrimWhitespace(event.target.checked)}
              className="accent-brand size-4"
            />
            Trim whitespace
          </label>
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
