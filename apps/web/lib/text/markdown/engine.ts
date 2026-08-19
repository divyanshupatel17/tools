import type { MarkdownIt } from 'markdown-it';
import { alertsPlugin, responsiveTablesPlugin, safeLinksPlugin, taskListsPlugin } from './plugins';

export interface MarkdownRenderResult {
  html: string;
  /** Source line for each task checkbox, in document order — see `lib/text/markdown/tasks.ts`. */
  task_lines: number[];
  /** Raw Mermaid source for each ```mermaid fence, in document order. The HTML already contains
   * a placeholder `<div data-mermaid-index="N">` for each one; the caller renders the actual
   * diagram into that element once Mermaid itself has loaded — see
   * `renderMermaidDiagrams` below. */
  mermaid_blocks: string[];
}

interface MarkdownEngine {
  render(source: string): MarkdownRenderResult;
}

let enginePromise: Promise<MarkdownEngine> | null = null;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Builds the whole rendering pipeline once and reuses it: markdown-it plus every plugin this
 * tool needs (footnotes, heading anchors, emoji shortcodes, LaTeX via KaTeX, GFM task lists and
 * GitHub style alerts, syntax highlighted and Mermaid aware code fences) and a DOMPurify pass on
 * the resulting HTML. Everything here is a heavy, rarely needed library, so it is loaded lazily
 * on first render rather than at module load — the same lazy boundary pattern
 * `lib/processing/processor_registry.ts` uses for FFmpeg and pdf-lib.
 */
async function buildEngine(): Promise<MarkdownEngine> {
  const [
    { default: MarkdownItCtor },
    { default: footnote },
    { default: anchor },
    { full: emojiFull },
    { default: texmath },
    { default: katex },
    { default: DOMPurify },
    { default: hljs },
  ] = await Promise.all([
    import('markdown-it'),
    import('markdown-it-footnote'),
    import('markdown-it-anchor'),
    import('markdown-it-emoji'),
    import('markdown-it-texmath'),
    import('katex'),
    import('dompurify'),
    import('highlight.js/lib/common'),
  ]);

  let mermaidBlocks: string[] = [];

  const md = new MarkdownItCtor({
    // Raw HTML blocks/inline (tables, <kbd>, <sub>/<sup>, <abbr>, <mark>, <u>, aligned <div>s —
    // all common in real world markdown) need to reach the DOM as elements, not escaped text.
    // DOMPurify below is what actually makes this safe: it strips anything dangerous (script
    // tags, event handler attributes, javascript: URLs) from the rendered HTML afterwards.
    html: true,
    linkify: true,
    typographer: false,
    highlight(code: string, lang: string): string {
      if (lang === 'mermaid') {
        const index = mermaidBlocks.length;
        mermaidBlocks.push(code);
        return `<div class="md-mermaid-block" data-mermaid-index="${index}">${escapeHtml(code)}</div>`;
      }
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      try {
        const result = language
          ? hljs.highlight(code, { language, ignoreIllegals: true })
          : hljs.highlightAuto(code);
        return `<pre class="md-code-block"><code class="hljs${language ? ` language-${language}` : ''}">${result.value}</code></pre>`;
      } catch {
        return `<pre class="md-code-block"><code class="hljs">${escapeHtml(code)}</code></pre>`;
      }
    },
  });

  // footnote and emoji's own type declarations resolve markdown-it through a `require()`
  // specifier, which TypeScript ends up treating as a structurally distinct (if identical at
  // runtime) `MarkdownIt` type from the ESM import above — a known dual module format quirk,
  // not a real incompatibility. `md.use`'s own typing is loose enough to need only this cast.
  md.use(footnote as unknown as (md: MarkdownIt) => void);
  md.use(emojiFull as unknown as (md: MarkdownIt) => void);
  md.use(anchor, {
    slugify,
    permalink: anchor.permalink.linkAfterHeader({
      style: 'aria-label',
      class: 'md-anchor-link',
      symbol: '#',
      placement: 'after',
      assistiveText: (title: string) => `Link to heading: ${title}`,
    }),
  });
  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, output: 'html' },
  });
  md.use(taskListsPlugin);
  md.use(alertsPlugin);
  md.use(safeLinksPlugin);
  md.use(responsiveTablesPlugin);

  return {
    render(source: string): MarkdownRenderResult {
      mermaidBlocks = [];
      const env: { task_lines?: number[] } = {};
      const rawHtml = md.render(source, env);
      const html = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ['input'],
        ADD_ATTR: ['target', 'checked', 'type', 'data-task-index', 'data-mermaid-index'],
      });
      return {
        html,
        task_lines: env.task_lines ?? [],
        mermaid_blocks: mermaidBlocks,
      };
    },
  };
}

export function loadMarkdownEngine(): Promise<MarkdownEngine> {
  if (!enginePromise) enginePromise = buildEngine();
  return enginePromise;
}

/**
 * Renders every ```mermaid fence's placeholder (see `MarkdownRenderResult.mermaid_blocks`) into
 * real SVG inside `container`. Runs after the sanitized HTML is already in the DOM: Mermaid
 * generates its own trusted SVG from parsed diagram syntax, so this bypasses DOMPurify by design
 * rather than round tripping generated markup back through a sanitizer built for arbitrary HTML.
 * A block whose syntax Mermaid rejects shows its own inline error, not a blank space, and never
 * fails the rest of the preview.
 */
export async function renderMermaidDiagrams(
  container: HTMLElement,
  blocks: readonly string[],
): Promise<void> {
  if (blocks.length === 0) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'strict',
    // Mermaid's own default error handling inserts a "bomb" error graphic straight into
    // `document.body`, outside any container this function controls. Suppressing it and
    // validating with `parse()` first keeps a bad diagram's failure inside its own placeholder.
    suppressErrorRendering: true,
  });

  await Promise.all(
    blocks.map(async (code, index) => {
      const target = container.querySelector<HTMLElement>(`[data-mermaid-index="${index}"]`);
      if (!target) return;
      try {
        await mermaid.parse(code);
        const { svg } = await mermaid.render(`md-mermaid-${index}-${Date.now()}`, code);
        target.innerHTML = svg;
        target.classList.add('md-mermaid-rendered');
      } catch (error) {
        target.textContent =
          error instanceof Error ? error.message : 'This diagram could not be rendered.';
        target.classList.add('md-mermaid-error');
      }
    }),
  );
}
