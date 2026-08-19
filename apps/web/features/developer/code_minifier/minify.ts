import { languageById, type MinifyLanguageDef } from './languages';

export interface CodeMinifyOptions {
  removeComments: boolean;
  /** JavaScript only: rename local variables and function parameters to shorter names. */
  mangleNames: boolean;
}

export const DEFAULT_CODE_MINIFY_OPTIONS: CodeMinifyOptions = {
  removeComments: true,
  mangleNames: true,
};

export interface CodeMinifyResult {
  output: string;
  originalBytes: number;
  minifiedBytes: number;
  /** 'full' when a real minifier ran, 'failed' when it exists but could not parse this input. */
  minifyMode: 'full' | 'failed';
  language: MinifyLanguageDef;
  error?: string;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

async function minifyJavaScript(source: string, options: CodeMinifyOptions): Promise<string> {
  const { minify } = await import('terser');
  const result = await minify(source, {
    compress: true,
    mangle: options.mangleNames,
    format: { comments: options.removeComments ? false : 'some' },
  });
  if (!result.code) throw new Error('Terser produced no output.');
  return result.code;
}

async function minifyCss(source: string): Promise<string> {
  const csso = await import('csso');
  return csso.minify(source, { comments: false }).css;
}

/** `minifyCSS` is deliberately left off: html-minifier-terser's CSS path shells out to
 * clean-css, which statically imports Node's `fs` and cannot be bundled for the browser.
 * Inline `<style>` blocks are left as is; standalone CSS already has its own csso powered
 * minifier above. */
async function minifyHtml(source: string, options: CodeMinifyOptions): Promise<string> {
  const { minify } = await import('html-minifier-terser');
  return minify(source, {
    collapseWhitespace: true,
    removeComments: options.removeComments,
    minifyJS: { mangle: options.mangleNames },
    removeAttributeQuotes: false,
    removeRedundantAttributes: false,
  });
}

function minifyJson(source: string): string {
  return JSON.stringify(JSON.parse(source));
}

/**
 * Minifies `source` for `languageId` per `options`. Never throws — a minifier failure (invalid
 * syntax mid edit, most often) falls back to the untouched input with `minifyMode: 'failed'`,
 * so the UI can say so rather than losing the user's work or faking a result.
 */
export async function minifyCode(
  source: string,
  languageId: string,
  options: CodeMinifyOptions = DEFAULT_CODE_MINIFY_OPTIONS,
): Promise<CodeMinifyResult> {
  const language = languageById(languageId);
  const originalBytes = byteLength(source);

  if (source.trim() === '') {
    return { output: '', originalBytes: 0, minifiedBytes: 0, minifyMode: 'full', language };
  }

  try {
    let output: string;
    if (language.engine === 'javascript') {
      output = await minifyJavaScript(source, options);
    } else if (language.engine === 'css') {
      output = await minifyCss(source);
    } else if (language.engine === 'html') {
      output = await minifyHtml(source, options);
    } else {
      output = minifyJson(source);
    }
    return { output, originalBytes, minifiedBytes: byteLength(output), minifyMode: 'full', language };
  } catch (error) {
    return {
      output: source,
      originalBytes,
      minifiedBytes: originalBytes,
      minifyMode: 'failed',
      language,
      error:
        error instanceof Error
          ? error.message
          : `This does not look like valid ${language.label} yet.`,
    };
  }
}
