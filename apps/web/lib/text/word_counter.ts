export interface WordCountOptions {
  words_per_minute?: number;
  words_per_minute_speaking?: number;
}

export interface WordCountStats {
  words: number;
  characters: number;
  characters_no_spaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  reading_minutes: number;
  speaking_minutes: number;
}

const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SENTENCE_PATTERN = /[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g;

export function countWords(text: string, options: WordCountOptions = {}): WordCountStats {
  const readingWpm = options.words_per_minute ?? 200;
  const speakingWpm = options.words_per_minute_speaking ?? 130;
  const trimmed = text.trim();

  const words = trimmed === '' ? 0 : (trimmed.match(WORD_PATTERN) ?? []).length;
  const characters = text.length;
  const characters_no_spaces = text.replace(/\s/g, '').length;
  const sentences =
    trimmed === ''
      ? 0
      : (trimmed.match(SENTENCE_PATTERN) ?? []).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
  const paragraphs =
    trimmed === '' ? 0 : trimmed.split(/\n\s*\n+/).filter((part) => part.trim() !== '').length;
  const lines = text === '' ? 0 : text.split('\n').length;

  return {
    words,
    characters,
    characters_no_spaces,
    sentences,
    paragraphs,
    lines,
    reading_minutes: readingWpm > 0 ? words / readingWpm : 0,
    speaking_minutes: speakingWpm > 0 ? words / speakingWpm : 0,
  };
}

/** "1 min 30 sec", trimmed to whichever units are non zero. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 sec';
  const totalSeconds = Math.round(minutes * 60);
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (wholeMinutes === 0) return `${seconds} sec`;
  if (seconds === 0) return `${wholeMinutes} min`;
  return `${wholeMinutes} min ${seconds} sec`;
}

export function buildWordCountReport(stats: WordCountStats): string {
  return [
    'Word and character count',
    '',
    `Words: ${stats.words}`,
    `Characters: ${stats.characters}`,
    `Characters, no spaces: ${stats.characters_no_spaces}`,
    `Sentences: ${stats.sentences}`,
    `Paragraphs: ${stats.paragraphs}`,
    `Lines: ${stats.lines}`,
    `Reading time: ${formatDuration(stats.reading_minutes)}`,
    `Speaking time: ${formatDuration(stats.speaking_minutes)}`,
    '',
  ].join('\n');
}
