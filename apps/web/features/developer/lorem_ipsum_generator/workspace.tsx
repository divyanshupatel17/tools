'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { generateLorem, toHtml, type LoremResult, type LoremStart, type LoremType } from './lorem_ipsum';

const EMPTY_RESULT: LoremResult = { paragraphs: [], text: '', wordCount: 0, charCount: 0 };

const MIN_COUNT = 1;
const MAX_COUNT = 500;

const TYPE_LABELS: Record<LoremType, string> = {
  paragraphs: 'Paragraphs',
  sentences: 'Sentences',
  words: 'Words',
};

const PARAGRAPH_PRESETS = [1, 3, 5, 10];
const WORD_PRESETS = [10, 20, 50, 100];

function LineNumberedOutput({ content }: { content: string }) {
  const lines = content === '' ? [''] : content.split('\n');
  return (
    <div className="border-border bg-background flex max-h-[24rem] overflow-y-auto rounded-2xl border font-mono text-sm leading-6">
      <div className="text-muted border-border shrink-0 border-r px-3 py-4 text-right select-none">
        {lines.map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <pre className="min-w-0 flex-1 overflow-auto px-3 py-4 whitespace-pre-wrap break-words">{content}</pre>
    </div>
  );
}

export function LoremIpsumGeneratorWorkspace() {
  const [type, setType] = useState<LoremType>('paragraphs');
  const [count, setCount] = useState(3);
  const [wordsPerParagraph, setWordsPerParagraph] = useState(20);
  const [start, setStart] = useState<LoremStart>('lorem-ipsum');
  const [includeHtml, setIncludeHtml] = useState(true);
  // Random generation must happen client side only: seeding this from generateLorem() during
  // the initial render would embed one random result in the server HTML and a different one on
  // the client's first render, which React treats as a hydration mismatch.
  const [result, setResult] = useState<LoremResult>(EMPTY_RESULT);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(generateLorem({ type: 'paragraphs', count: 3, wordsPerParagraph: 20, start: 'lorem-ipsum' }));
  }, []);

  function generate(next?: { type?: LoremType; count?: number }) {
    const nextType = next?.type ?? type;
    const nextCount = next?.count ?? count;
    if (next?.type) setType(next.type);
    if (next?.count) setCount(next.count);
    setResult(generateLorem({ type: nextType, count: nextCount, wordsPerParagraph, start }));
  }

  const htmlOutput = toHtml(result.paragraphs);

  async function copyText() {
    await navigator.clipboard.writeText(result.text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  }

  async function copyHtml() {
    await navigator.clipboard.writeText(htmlOutput);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2000);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-muted text-xs font-medium">Type</p>
          <select
            id="lorem-type"
            name="lorem-type"
            value={type}
            onChange={(event) => setType(event.target.value as LoremType)}
            className="border-border bg-background h-9 rounded-full border px-3 text-sm outline-none"
            aria-label="Lorem ipsum type"
          >
            {(Object.keys(TYPE_LABELS) as LoremType[]).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-muted text-xs font-medium">Count</p>
          <NumberField
            value={count}
            onChange={setCount}
            min={MIN_COUNT}
            max={MAX_COUNT}
            id="lorem-count"
            aria-label="Count"
            className="border-border bg-background h-9 w-20 rounded-full border px-3 text-center text-sm outline-none"
          />
        </div>

        {type === 'paragraphs' && (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">Words per Paragraph</p>
            <NumberField
              value={wordsPerParagraph}
              onChange={setWordsPerParagraph}
              min={5}
              max={200}
              id="lorem-words-per-paragraph"
              aria-label="Words per paragraph"
              className="border-border bg-background h-9 w-20 rounded-full border px-3 text-center text-sm outline-none"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-muted text-xs font-medium">Start with</p>
          <label className="border-border bg-background flex h-9 items-center gap-2 rounded-full border px-3 text-sm">
            <input
              id="lorem-start"
              name="lorem-start"
              type="checkbox"
              checked={start === 'lorem-ipsum'}
              onChange={(event) => setStart(event.target.checked ? 'lorem-ipsum' : 'random')}
              className="accent-brand size-4"
            />
            {'"Lorem ipsum..."'}
          </label>
        </div>

        <label className="text-foreground flex h-9 items-center gap-2 text-sm">
          <input
            id="lorem-include-html"
            name="lorem-include-html"
            type="checkbox"
            checked={includeHtml}
            onChange={(event) => setIncludeHtml(event.target.checked)}
            className="accent-brand size-4"
          />
          Include HTML
        </label>

        <Button variant="primary" size="sm" onClick={() => generate()} className="ml-auto">
          <Sparkles aria-hidden className="size-4" />
          Generate
        </Button>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${includeHtml ? 'lg:grid-cols-2' : ''}`}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Generated Text</p>
            <Button variant="secondary" size="sm" onClick={() => void copyText()}>
              {copiedText ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              Copy
            </Button>
          </div>
          <div className="border-border bg-background max-h-[24rem] overflow-y-auto rounded-2xl border p-4">
            {result.paragraphs.map((paragraph, index) => (
              <p key={index} className="mb-4 text-sm leading-6 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
          <p className="text-muted text-xs">
            {result.paragraphs.length} {result.paragraphs.length === 1 ? 'paragraph' : 'paragraphs'} · {result.wordCount} words · {result.charCount} characters
          </p>
        </div>

        {includeHtml && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">HTML Output</p>
              <Button variant="secondary" size="sm" onClick={() => void copyHtml()}>
                {copiedHtml ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                Copy HTML
              </Button>
            </div>
            <LineNumberedOutput content={htmlOutput} />
            <p className="text-muted text-xs">
              {result.paragraphs.length} {result.paragraphs.length === 1 ? 'paragraph' : 'paragraphs'}
            </p>
          </div>
        )}
      </div>

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
        <p className="text-muted text-xs font-medium">Quick Presets</p>
        {PARAGRAPH_PRESETS.map((value) => (
          <Button
            key={`p-${value}`}
            variant="secondary"
            size="sm"
            onClick={() => generate({ type: 'paragraphs', count: value })}
          >
            {value} {value === 1 ? 'Paragraph' : 'Paragraphs'}
          </Button>
        ))}
        <span className="text-border">|</span>
        {WORD_PRESETS.map((value) => (
          <Button
            key={`w-${value}`}
            variant="secondary"
            size="sm"
            onClick={() => generate({ type: 'words', count: value })}
          >
            {value} Words
          </Button>
        ))}
      </div>
    </div>
  );
}
