/**
 * Every language the Code Formatter offers, plus what it takes to format, download and
 * syntax highlight each one. Kept free of the heavy prettier/sql-formatter/highlight.js
 * imports themselves — those load lazily from `processor.ts` and `workspace.tsx`.
 */

export type FormatEngine = 'prettier' | 'sql' | 'wasm' | 'xml' | 'best_effort';

/** Which lazily loaded WASM formatter backs engine 'wasm', only set when engine is 'wasm'.
 * 'clang' covers several languages at once (clang-format), keyed by clangFileName below. */
export type WasmFormatter = 'clang' | 'ruff' | 'gofmt' | 'shfmt' | 'mago';

export interface LanguageDef {
  id: string;
  label: string;
  /** File extension used for Download, without the dot. */
  extension: string;
  /** highlight.js registered language id, or 'plaintext' when nothing fits. */
  hljs: string;
  engine: FormatEngine;
  /** Prettier parser name, only set when engine is 'prettier'. */
  prettierParser?: string;
  /** Which WASM formatter to load, only set when engine is 'wasm'. */
  wasmFormatter?: WasmFormatter;
  /** Placeholder file name passed to clang-format so it picks the right language mode. */
  clangFileName?: string;
  /** Whether sortImports / quote conversion / import block detection apply. */
  supportsImportSort?: boolean;
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'javascript', label: 'JavaScript', extension: 'js', hljs: 'javascript', engine: 'prettier', prettierParser: 'babel', supportsImportSort: true },
  { id: 'typescript', label: 'TypeScript', extension: 'ts', hljs: 'typescript', engine: 'prettier', prettierParser: 'typescript', supportsImportSort: true },
  { id: 'jsx', label: 'JSX', extension: 'jsx', hljs: 'javascript', engine: 'prettier', prettierParser: 'babel', supportsImportSort: true },
  { id: 'tsx', label: 'TSX', extension: 'tsx', hljs: 'typescript', engine: 'prettier', prettierParser: 'typescript', supportsImportSort: true },
  { id: 'json', label: 'JSON', extension: 'json', hljs: 'json', engine: 'prettier', prettierParser: 'json' },
  { id: 'json5', label: 'JSON5', extension: 'json5', hljs: 'json', engine: 'prettier', prettierParser: 'json5' },
  { id: 'css', label: 'CSS', extension: 'css', hljs: 'css', engine: 'prettier', prettierParser: 'css' },
  { id: 'scss', label: 'SCSS', extension: 'scss', hljs: 'scss', engine: 'prettier', prettierParser: 'scss' },
  { id: 'less', label: 'LESS', extension: 'less', hljs: 'less', engine: 'prettier', prettierParser: 'less' },
  { id: 'html', label: 'HTML', extension: 'html', hljs: 'xml', engine: 'prettier', prettierParser: 'html' },
  { id: 'vue', label: 'Vue', extension: 'vue', hljs: 'xml', engine: 'prettier', prettierParser: 'vue' },
  { id: 'markdown', label: 'Markdown', extension: 'md', hljs: 'markdown', engine: 'prettier', prettierParser: 'markdown' },
  { id: 'yaml', label: 'YAML', extension: 'yaml', hljs: 'yaml', engine: 'prettier', prettierParser: 'yaml' },
  { id: 'graphql', label: 'GraphQL', extension: 'graphql', hljs: 'graphql', engine: 'prettier', prettierParser: 'graphql' },
  { id: 'sql', label: 'SQL', extension: 'sql', hljs: 'sql', engine: 'sql' },
  { id: 'python', label: 'Python', extension: 'py', hljs: 'python', engine: 'wasm', wasmFormatter: 'ruff', supportsImportSort: true },
  { id: 'java', label: 'Java', extension: 'java', hljs: 'java', engine: 'wasm', wasmFormatter: 'clang', clangFileName: 'main.java' },
  { id: 'c', label: 'C', extension: 'c', hljs: 'c', engine: 'wasm', wasmFormatter: 'clang', clangFileName: 'main.c' },
  { id: 'cpp', label: 'C++', extension: 'cpp', hljs: 'cpp', engine: 'wasm', wasmFormatter: 'clang', clangFileName: 'main.cc' },
  { id: 'csharp', label: 'C#', extension: 'cs', hljs: 'csharp', engine: 'wasm', wasmFormatter: 'clang', clangFileName: 'main.cs' },
  { id: 'go', label: 'Go', extension: 'go', hljs: 'go', engine: 'wasm', wasmFormatter: 'gofmt' },
  { id: 'rust', label: 'Rust', extension: 'rs', hljs: 'rust', engine: 'best_effort' },
  { id: 'php', label: 'PHP', extension: 'php', hljs: 'php', engine: 'wasm', wasmFormatter: 'mago' },
  { id: 'ruby', label: 'Ruby', extension: 'rb', hljs: 'ruby', engine: 'best_effort' },
  { id: 'kotlin', label: 'Kotlin', extension: 'kt', hljs: 'kotlin', engine: 'best_effort' },
  { id: 'swift', label: 'Swift', extension: 'swift', hljs: 'swift', engine: 'best_effort' },
  { id: 'shell', label: 'Shell', extension: 'sh', hljs: 'bash', engine: 'wasm', wasmFormatter: 'shfmt' },
  { id: 'xml', label: 'XML', extension: 'xml', hljs: 'xml', engine: 'xml' },
];

const FALLBACK_LANGUAGE = LANGUAGES[0]!;

export function languageById(id: string): LanguageDef {
  return LANGUAGES.find((language) => language.id === id) ?? FALLBACK_LANGUAGE;
}
