/**
 * Browser stand in for the `clean-css` package, aliased in via `next.config.ts`'s
 * `turbopack.resolveAlias`. html-minifier-terser statically imports `clean-css` (which itself
 * requires Node's `fs`), even though its CSS minification path only runs when the `minifyCSS`
 * option is truthy — which the code minifier never sets, since it already minifies standalone
 * CSS through csso. This stub keeps the import graph browser safe without ever being called.
 */
export default class CleanCSS {
  minify(input: string): { styles: string; errors: string[]; warnings: string[] } {
    return { styles: input, errors: [], warnings: [] };
  }
}
