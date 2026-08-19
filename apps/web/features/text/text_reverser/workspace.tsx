'use client';

import { useMemo, useState } from 'react';
import {
  AlignJustify,
  AlignLeft,
  ArrowDownAZ,
  ArrowLeftRight,
  Check,
  Copy,
  Download,
  WholeWord,
} from 'lucide-react';
import { ControlPanel, RadioOptionCard } from '@/components/text/control_panel';
import { countWordsAndCharacters, TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { REVERSE_OPTIONS, reverseText, type ReverseMode } from '@/lib/text/text_reverser';

const PLACEHOLDER = 'Paste or type your text here…';
const MAX_LENGTH = 5000;

const ICONS: Record<ReverseMode, typeof AlignLeft> = {
  text: AlignLeft,
  words: WholeWord,
  letters: ArrowDownAZ,
  lines: AlignJustify,
};

export function TextReverserWorkspace() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ReverseMode>('text');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reversed = useMemo(() => reverseText(text, mode), [text, mode]);
  const inputCounts = countWordsAndCharacters(text);
  const reversedCounts = countWordsAndCharacters(reversed);

  async function copyAll() {
    await navigator.clipboard.writeText(reversed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadAll() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.text-reverser');
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

  const reversedOutput = (
    <>
      <Textarea
        value={reversed}
        readOnly
        placeholder="The reversed text will appear here."
        className="font-mono min-h-0 flex-1 resize-none"
      />
      <p className="text-muted mt-2 text-xs">
        {reversedCounts.words.toLocaleString()} words · {reversedCounts.characters.toLocaleString()}{' '}
        characters
      </p>
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={(value) => setText(value.slice(0, MAX_LENGTH))}
          placeholder={PLACEHOLDER}
          autosaveKey="text-reverser"
          inputLabel="Input Text"
          expandedOutput={reversedOutput}
          expandedOutputLabel="Reversed Text"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Text</p>
              <div className="flex items-center gap-2">
                <span className="text-muted text-xs">
                  {text.length} / {MAX_LENGTH}
                </span>
                <button
                  type="button"
                  onClick={() => setText(reversed.slice(0, MAX_LENGTH))}
                  aria-label="Use the reversed text as the new input"
                  title="Use the reversed text as the new input"
                  className="text-muted hover:text-foreground rounded-full p-1"
                >
                  <ArrowLeftRight aria-hidden className="size-4" />
                </button>
              </div>
            </div>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
              placeholder={PLACEHOLDER}
              maxLength={MAX_LENGTH}
              className="font-mono min-h-[45vh]"
            />
            <p className="text-muted mt-2 text-xs">
              {inputCounts.words.toLocaleString()} words · {inputCounts.characters.toLocaleString()}{' '}
              characters
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Reversed Text</p>
            <Textarea
              value={reversed}
              readOnly
              placeholder="The reversed text will appear here."
              className="font-mono min-h-[45vh]"
            />
            <p className="text-muted mt-2 text-xs">
              {reversedCounts.words.toLocaleString()} words ·{' '}
              {reversedCounts.characters.toLocaleString()} characters
            </p>
            {notice && <p className="text-danger mt-1 text-xs">{notice}</p>}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="border-border bg-surface rounded-2xl border p-4">
          <ControlPanel>
            <div>
              <p className="text-sm font-semibold">Reverse Options</p>
              <p className="text-muted text-xs">Choose what you want to reverse.</p>
            </div>
            <div className="flex flex-col gap-2">
              {REVERSE_OPTIONS.map((option) => (
                <RadioOptionCard
                  key={option.id}
                  icon={ICONS[option.id]}
                  label={option.label}
                  description={option.description}
                  selected={mode === option.id}
                  onSelect={() => setMode(option.id)}
                />
              ))}
            </div>
          </ControlPanel>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 text-sm font-semibold">Reversed Text</p>
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
