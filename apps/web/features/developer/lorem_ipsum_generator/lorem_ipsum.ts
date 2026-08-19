export type LoremType = 'paragraphs' | 'sentences' | 'words';
export type LoremStart = 'lorem-ipsum' | 'random';

export interface LoremOptions {
  type: LoremType;
  count: number;
  wordsPerParagraph: number;
  start: LoremStart;
}

export interface LoremResult {
  paragraphs: string[];
  text: string;
  wordCount: number;
  charCount: number;
}

const WORD_BANK = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
  'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim',
  'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip',
  'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
  'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est',
  'laborum', 'perspiciatis', 'unde', 'omnis', 'iste', 'natus', 'error', 'voluptatem', 'accusantium',
  'doloremque', 'laudantium', 'totam', 'rem', 'aperiam', 'eaque', 'ipsa', 'quae', 'ab', 'illo',
  'inventore', 'veritatis', 'quasi', 'architecto', 'beatae', 'vitae', 'dicta', 'explicabo',
];

const OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
const OPENING_WORDS = ['Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'];

function randomWord(): string {
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)] ?? 'lorem';
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function sentenceCase(words: string[]): string {
  let result = '';
  let sinceStart = 0;
  words.forEach((word, index) => {
    result += sinceStart === 0 ? capitalize(word) : word;
    sinceStart++;
    const sentenceLength = 8 + Math.floor(Math.random() * 6);
    if (sinceStart >= sentenceLength || index === words.length - 1) {
      result += '. ';
      sinceStart = 0;
    } else {
      result += ' ';
    }
  });
  return result.trim();
}

function generateParagraph(wordTarget: number, useOpening: boolean): string {
  const words: string[] = useOpening ? [...OPENING_WORDS] : [];
  while (words.length < wordTarget) words.push(randomWord());
  return sentenceCase(words.slice(0, Math.max(wordTarget, useOpening ? OPENING_WORDS.length : 1)));
}

function generateSentence(wordCount: number, useOpening: boolean): string {
  if (useOpening) return OPENING;
  const words = Array.from({ length: wordCount }, randomWord);
  words[0] = capitalize(words[0] ?? randomWord());
  return `${words.join(' ')}.`;
}

export function generateLorem(options: LoremOptions): LoremResult {
  const { type, count, wordsPerParagraph, start } = options;
  const useOpening = start === 'lorem-ipsum';
  let paragraphs: string[];

  if (type === 'paragraphs') {
    paragraphs = Array.from({ length: count }, (_, index) =>
      generateParagraph(wordsPerParagraph, index === 0 && useOpening),
    );
  } else if (type === 'sentences') {
    const sentences = Array.from({ length: count }, (_, index) =>
      generateSentence(6 + Math.floor(Math.random() * 9), index === 0 && useOpening),
    );
    paragraphs = [sentences.join(' ')];
  } else {
    paragraphs = [generateParagraph(count, useOpening)];
  }

  const text = paragraphs.join('\n\n');
  return {
    paragraphs,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
  };
}

export function toHtml(paragraphs: string[]): string {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('\n\n');
}
