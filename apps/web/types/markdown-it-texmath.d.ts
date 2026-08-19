// markdown-it-texmath ships no type declarations. This covers only the surface we use: a
// markdown-it plugin function taking the KaTeX engine and delimiter style.
declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';

  interface TexmathOptions {
    engine: unknown;
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown';
    katexOptions?: Record<string, unknown>;
  }

  function texmath(md: MarkdownIt, options: TexmathOptions): void;

  export default texmath;
}
