'use client';

import { useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Copy,
  Download,
  Gauge,
  Hash,
  Mic,
  Pilcrow,
  Rows3,
  Type,
} from 'lucide-react';
import { ControlPanel, Field, Notice, StatGrid, StatTile } from '@/components/text/control_panel';
import { TextInputPanel } from '@/components/text/text_input_panel';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { buildWordCountReport, countWords, formatDuration } from '@/lib/text/word_counter';

function SpeedField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <NumberField
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          className="border-border bg-background h-11 w-full rounded-full border px-4 pr-10 outline-none"
        />
        <Gauge aria-hidden className="text-muted pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2" />
      </div>
    </Field>
  );
}

export function WordCounterWorkspace() {
  const [text, setText] = useState('');
  const [readingWpm, setReadingWpm] = useState(200);
  const [speakingWpm, setSpeakingWpm] = useState(130);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const stats = useMemo(
    () =>
      countWords(text, {
        words_per_minute: readingWpm,
        words_per_minute_speaking: speakingWpm,
      }),
    [text, readingWpm, speakingWpm],
  );

  async function copyStats() {
    await navigator.clipboard.writeText(buildWordCountReport(stats));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadReport() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.word-counter');
      const output = await processor(
        {
          files: [],
          text,
          options: { words_per_minute: readingWpm, words_per_minute_speaking: speakingWpm },
        },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That report could not be created.');
    }
  }

  // Built once and reused for both the sidebar and the fullscreen editor's right pane, so
  // expanding never leaves the live counts behind.
  const statsGrid = (
    <StatGrid>
      <StatTile icon={Type} label="Words" value={stats.words.toLocaleString()} />
      <StatTile icon={Hash} label="Characters" value={stats.characters.toLocaleString()} />
      <StatTile
        icon={Ban}
        label="Characters, no spaces"
        value={stats.characters_no_spaces.toLocaleString()}
      />
      <StatTile icon={Pilcrow} label="Sentences" value={stats.sentences.toLocaleString()} />
      <StatTile icon={Pilcrow} label="Paragraphs" value={stats.paragraphs.toLocaleString()} />
      <StatTile icon={Rows3} label="Lines" value={stats.lines.toLocaleString()} />
      <StatTile icon={Clock} label="Reading time" value={formatDuration(stats.reading_minutes)} />
      <StatTile icon={Mic} label="Speaking time" value={formatDuration(stats.speaking_minutes)} />
    </StatGrid>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextInputPanel
          value={text}
          onChange={setText}
          placeholder="Paste or type your text here…"
          autosaveKey="word-counter"
          expandedOutput={statsGrid}
          expandedOutputLabel="Live Counts"
        />
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <ControlPanel>
          {statsGrid}

          <SpeedField
            label="Reading speed (words per minute)"
            hint="Used to calculate reading time."
            value={readingWpm}
            onChange={setReadingWpm}
            min={100}
            max={500}
          />

          <SpeedField
            label="Speaking speed (words per minute)"
            hint="Used to calculate speaking time."
            value={speakingWpm}
            onChange={setSpeakingWpm}
            min={80}
            max={220}
          />

          {notice && <Notice>{notice}</Notice>}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={copyStats}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="flex-1" onClick={downloadReport}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </div>
        </ControlPanel>
      </aside>
    </div>
  );
}
