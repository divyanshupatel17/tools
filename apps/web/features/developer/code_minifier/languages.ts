/**
 * Languages the Code Minifier offers. Kept free of the heavy terser/csso/html-minifier-terser
 * imports themselves — those load lazily from `minify.ts`.
 */

export type MinifyEngine = 'javascript' | 'css' | 'html' | 'json';

export interface MinifyLanguageDef {
  id: string;
  label: string;
  extension: string;
  hljs: string;
  engine: MinifyEngine;
}

export const LANGUAGES: MinifyLanguageDef[] = [
  { id: 'javascript', label: 'JavaScript', extension: 'js', hljs: 'javascript', engine: 'javascript' },
  { id: 'css', label: 'CSS', extension: 'css', hljs: 'css', engine: 'css' },
  { id: 'html', label: 'HTML', extension: 'html', hljs: 'xml', engine: 'html' },
  { id: 'json', label: 'JSON', extension: 'json', hljs: 'json', engine: 'json' },
];

const FALLBACK_LANGUAGE = LANGUAGES[0]!;

export function languageById(id: string): MinifyLanguageDef {
  return LANGUAGES.find((language) => language.id === id) ?? FALLBACK_LANGUAGE;
}

export function detectLanguageId(source: string): string {
  const trimmed = source.trim();
  if (trimmed === '') return 'javascript';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON — keep looking, could still be JS.
    }
  }
  if (/^<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return 'html';
  }
  const looksLikeStylesheet =
    /[.#]?[\w-]+\s*\{[^{}]*:[^{}]*\}/.test(trimmed) && !/=>|function\s*\(|\bconst\b|\blet\b/.test(trimmed);
  if (looksLikeStylesheet) return 'css';
  return 'javascript';
}
