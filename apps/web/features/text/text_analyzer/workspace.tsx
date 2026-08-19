'use client';

import { useMemo, useState } from 'react';
import {
  Ban,
  CaseSensitive,
  Check,
  CircleDashed,
  Copy,
  Download,
  Hash,
  List,
  Pilcrow,
  Star,
  TrendingUp,
  Type,
} from 'lucide-react';
import { ControlPanel, Notice, StatGrid, StatTile } from '@/components/text/control_panel';
import { TextInputPanel } from '@/components/text/text_input_panel';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { analyzeText, buildTextAnalysisReport } from '@/lib/text/text_analyzer';

export function TextAnalyzerWorkspace() {
  const [text, setText] = useState('');
  const [topWords, setTopWords] = useState(10);
  const [ignoreCommonWords, setIgnoreCommonWords] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const stats = useMemo(
    () => analyzeText(text, { top_words: topWords, ignore_common_words: ignoreCommonWords }),
    [text, topWords, ignoreCommonWords],
  );

  const maxCount = Math.max(1, ...stats.top_words.map((entry) => entry.count));

  async function copyStats() {
    await navigator.clipboard.writeText(buildTextAnalysisReport(stats));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadReport() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.text-analyzer');
      const output = await processor(
        { files: [], text, options: { top_words: topWords, ignore_common_words: ignoreCommonWords } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That report could not be created.');
    }
  }

  // Built once and reused for both the sidebar and the fullscreen editor's right pane, so
  // expanding never leaves the live analysis behind.
  const resultsContent = (
    <>
      <StatGrid columns={3}>
        <StatTile icon={Type} label="Total words" value={stats.total_words.toLocaleString()} />
        <StatTile icon={Star} label="Unique words" value={stats.unique_words.toLocaleString()} />
        <StatTile
          icon={CaseSensitive}
          label="Average word length"
          value={`${stats.average_word_length.toFixed(1)} chars`}
        />
        <StatTile
          icon={Hash}
          label="Total characters"
          value={stats.total_characters.toLocaleString()}
        />
        <StatTile
          icon={Ban}
          label="Characters, no spaces"
          value={stats.characters_no_spaces.toLocaleString()}
        />
        <StatTile icon={CircleDashed} label="Sentences" value={stats.sentences.toLocaleString()} />
        <StatTile icon={Pilcrow} label="Paragraphs" value={stats.paragraphs.toLocaleString()} />
        <StatTile icon={List} label="Lines" value={stats.lines.toLocaleString()} />
      </StatGrid>

      {/* Full width on its own: a long word can run well past a shared row, and with plenty
       of them tied for shortest that tile never told a useful story anyway. */}
      <StatTile
        icon={TrendingUp}
        label="Longest word"
        value={stats.longest_word || 'none'}
        valueClassName="break-all"
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ignoreCommonWords}
          onChange={(event) => setIgnoreCommonWords(event.target.checked)}
          className="accent-brand size-4"
        />
        <span className="font-semibold">Ignore common words</span>
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Word frequency and keyword density</p>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted">Show top</span>
            <NumberField
              value={topWords}
              onChange={setTopWords}
              min={3}
              max={50}
              className="border-border bg-background h-8 w-14 rounded-full border px-2.5 text-center outline-none"
            />
          </label>
        </div>

        {stats.top_words.length === 0 ? (
          <p className="text-muted text-sm">Nothing to show yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-muted text-left text-xs">
                <th scope="col" className="pb-1.5 font-medium">
                  Word
                </th>
                <th scope="col" className="w-24 pb-1.5 font-medium">
                  Count
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  Density
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.top_words.map((entry) => (
                <tr key={entry.word} className="border-border/60 border-t">
                  <td className="py-1.5 break-all">{entry.word}</td>
                  <td className="py-1.5">
                    <span className="block">{entry.count}</span>
                    <span className="bg-cream mt-1 block h-1 w-full overflow-hidden rounded-full">
                      <span
                        className="bg-brand block h-full rounded-full"
                        style={{ width: `${Math.max(6, (entry.count / maxCount) * 100)}%` }}
                      />
                    </span>
                  </td>
                  <td className="text-muted py-1.5 text-right">{entry.density.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_520px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextInputPanel
          value={text}
          onChange={setText}
          placeholder="Type or paste your text here…"
          autosaveKey="text-analyzer"
          expandedOutput={<div className="flex flex-col gap-4">{resultsContent}</div>}
          expandedOutputLabel="Text Statistics"
        />
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <ControlPanel>
          {resultsContent}

          {notice && <Notice>{notice}</Notice>}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={copyStats}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? 'Copied' : 'Copy Report'}
            </Button>
            <Button className="flex-1" onClick={downloadReport}>
              <Download aria-hidden className="size-4" />
              Download Report
            </Button>
          </div>
        </ControlPanel>
      </aside>
    </div>
  );
}
