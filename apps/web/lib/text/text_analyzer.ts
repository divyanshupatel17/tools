import { countWords } from './word_counter';

export interface TextAnalyzerOptions {
  top_words?: number;
  ignore_common_words?: boolean;
}

export interface WordFrequencyEntry {
  word: string;
  count: number;
  /** Percent share of all words in the text, i.e. keyword density. */
  density: number;
}

export interface TextAnalysisStats {
  total_words: number;
  unique_words: number;
  average_word_length: number;
  longest_word: string;
  shortest_word: string;
  total_characters: number;
  characters_no_spaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  top_words: WordFrequencyEntry[];
}

const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

// Common enough in ordinary English prose to swamp a keyword density table if left in.
const COMMON_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'as', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'up', 'out', 'about', 'into', 'over', 'after', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'am', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'them', 'his', 'her', 'their', 'our', 'your', 'not', 'no', 'do', 'does',
  'did', 'has', 'have', 'had', 'can', 'could', 'will', 'would', 'should', 'than', 'then', 'there',
  'here', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'each', 'more',
  'most', 'some', 'such', 'only', 'just', 'also', 'very', 'too', 'i’m',
]);

export function analyzeText(text: string, options: TextAnalyzerOptions = {}): TextAnalysisStats {
  const topN = Math.max(1, Math.min(50, options.top_words ?? 10));
  const ignoreCommon = options.ignore_common_words ?? true;

  const rawWords = text.toLowerCase().match(WORD_PATTERN) ?? [];
  const totalWords = rawWords.length;
  const uniqueWords = new Set(rawWords).size;

  let longestWord = '';
  let shortestWord = '';
  let totalLength = 0;
  for (const word of rawWords) {
    totalLength += word.length;
    if (word.length > longestWord.length) longestWord = word;
    if (shortestWord === '' || word.length < shortestWord.length) shortestWord = word;
  }

  const counted = ignoreCommon ? rawWords.filter((word) => !COMMON_WORDS.has(word)) : rawWords;
  const counts = new Map<string, number>();
  for (const word of counted) counts.set(word, (counts.get(word) ?? 0) + 1);

  const topWords: WordFrequencyEntry[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([word, count]) => ({
      word,
      count,
      density: totalWords > 0 ? (count / totalWords) * 100 : 0,
    }));

  const basic = countWords(text);

  return {
    total_words: totalWords,
    unique_words: uniqueWords,
    average_word_length: rawWords.length > 0 ? totalLength / rawWords.length : 0,
    longest_word: longestWord,
    shortest_word: shortestWord,
    total_characters: basic.characters,
    characters_no_spaces: basic.characters_no_spaces,
    sentences: basic.sentences,
    paragraphs: basic.paragraphs,
    lines: basic.lines,
    top_words: topWords,
  };
}

export function buildTextAnalysisReport(stats: TextAnalysisStats): string {
  const lines = [
    'Text statistics',
    '',
    `Total words: ${stats.total_words}`,
    `Unique words: ${stats.unique_words}`,
    `Average word length: ${stats.average_word_length.toFixed(1)} characters`,
    `Longest word: ${stats.longest_word || 'none'}`,
    `Shortest word: ${stats.shortest_word || 'none'}`,
    `Total characters: ${stats.total_characters}`,
    `Characters, no spaces: ${stats.characters_no_spaces}`,
    `Sentences: ${stats.sentences}`,
    `Paragraphs: ${stats.paragraphs}`,
    `Lines: ${stats.lines}`,
    '',
    'Most frequent words',
  ];
  if (stats.top_words.length === 0) lines.push('none');
  for (const entry of stats.top_words) {
    lines.push(`${entry.word}: ${entry.count} (${entry.density.toFixed(1)}%)`);
  }
  lines.push('');
  return lines.join('\n');
}
