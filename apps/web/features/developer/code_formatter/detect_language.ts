/**
 * Cheap, synchronous language sniffing from source text alone, so "Auto detect" can resolve
 * before any heavy formatter or highlighter has loaded. Heuristic, not a parser: ordered from
 * the most specific/reliable signals (shebangs, JSON parseability, doctype) down to the most
 * general (bracket and keyword shape), falling back to JavaScript when nothing matches.
 */
export function detectLanguageId(source: string): string {
  const trimmed = source.trim();
  if (trimmed === '') return 'javascript';

  const firstLine = trimmed.split('\n', 1)[0] ?? '';
  if (firstLine.startsWith('#!')) {
    if (/python/.test(firstLine)) return 'python';
    if (/node/.test(firstLine)) return 'javascript';
    if (/\b(bash|sh|zsh)\b/.test(firstLine)) return 'shell';
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON — keep looking, it may still be JS/TS/JSON5 with comments or trailing commas.
    }
  }

  if (/^<\?xml/.test(trimmed)) return 'xml';
  if (/^<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) return 'html';
  if (/<template[\s>][\s\S]*<script[\s>]/i.test(trimmed)) return 'vue';
  if (/^<\?php/.test(trimmed)) return 'php';

  if (/^(query|mutation|subscription|fragment)\s+\w*\s*[{(]/.test(trimmed)) return 'graphql';

  if (/^\s*(select\s+[\s\S]+\bfrom\b|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+table|alter\s+table|with\s+\w+\s+as\s*\()/i.test(trimmed)) {
    return 'sql';
  }

  if (/^#{1,6}\s/.test(trimmed) || /^-\s\[[ x]\]/im.test(trimmed) || /^```/m.test(trimmed)) {
    return 'markdown';
  }

  if (/^---\s*\n[\s\S]*?\n---/.test(trimmed) || (/^[\w.-]+:\s?.*$/m.test(trimmed) && !/[{};]/.test(trimmed) && /^\s*-\s|:\s/m.test(trimmed))) {
    return 'yaml';
  }

  if (/^\s*def\s+\w+\s*\(.*\)\s*:/m.test(trimmed) || /^\s*(from\s+[\w.]+\s+import\s+|import\s+\w+(\.\w+)*\s*$)/m.test(trimmed) || /^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/m.test(trimmed)) {
    return 'python';
  }

  if (/\busing\s+System(\.\w+)*;/.test(trimmed) || /\bnamespace\s+[\w.]+\s*[{;]/.test(trimmed) || /\bConsole\.WriteLine\s*\(/.test(trimmed)) {
    return 'csharp';
  }

  if (/\bpublic\s+(static\s+)?(final\s+)?class\s+\w+/.test(trimmed) || /\bSystem\.out\.println\s*\(/.test(trimmed)) {
    return 'java';
  }

  if (/^\s*package\s+\w+\s*$/m.test(trimmed) && /\bfunc\s+\w+\s*\(/.test(trimmed)) return 'go';

  if (/\bfn\s+\w+\s*\(/.test(trimmed) && (/->\s*\w/.test(trimmed) || /\blet\s+mut\b/.test(trimmed) || /::</.test(trimmed))) {
    return 'rust';
  }

  if (/\bfunc\s+\w+\s*\(/.test(trimmed) && (/\blet\s+|\bvar\s+/.test(trimmed)) && /\bimport\s+(Foundation|SwiftUI|UIKit)\b/.test(trimmed)) {
    return 'swift';
  }

  if (/\bfun\s+\w+\s*\(/.test(trimmed) && (/\bval\s+|\bvar\s+/.test(trimmed))) return 'kotlin';

  if (/^\s*require\s+['"]/.test(trimmed) || (/\bdef\s+\w+/.test(trimmed) && /\bend\b/.test(trimmed) && /\bputs\s/.test(trimmed))) {
    return 'ruby';
  }

  if (/#include\s*[<"]\w/.test(trimmed)) {
    return /\bstd::|::\w|\bclass\s+\w+|\btemplate\s*</.test(trimmed) ? 'cpp' : 'c';
  }

  if (/^\s*(sudo\s|echo\s|export\s\w+=|if\s+\[|\$\(|#\s*!)/m.test(trimmed) && !/[{};]/.test(trimmed)) {
    return 'shell';
  }

  const looksLikeStylesheet =
    /[.#]?[\w-]+\s*\{[^{}]*:[^{}]*\}/.test(trimmed) && !/=>|function\s*\(|\bconst\b|\blet\b/.test(trimmed);
  if (looksLikeStylesheet) {
    if (/@mixin|@include|\$[\w-]+\s*:/.test(trimmed)) return 'scss';
    if (/@variable|\.[\w-]+\(.*\)\s*;/.test(trimmed)) return 'less';
    return 'css';
  }

  const hasJsxTag = /<[A-Z][\w.]*[\s/>]/.test(trimmed);
  const looksTyped =
    /:\s*(string|number|boolean|any|void|unknown|never)\b/.test(trimmed) ||
    /\binterface\s+\w+/.test(trimmed) ||
    /\bas\s+const\b/.test(trimmed);
  if (looksTyped) return hasJsxTag ? 'tsx' : 'typescript';
  if (hasJsxTag) return 'jsx';

  return 'javascript';
}
