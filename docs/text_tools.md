# Text tools: state

Single source of truth for what the Text category contains. Registry entries live in
`apps/web/lib/tools/registry.ts`. Text has **13 tools across 5 sections** (declared in
`lib/tools/sections.ts`, same mechanism as PDF, Image and Audio) — each tool below is one
registry entry, one processor, one workspace. All 13 are `status: 'available'`.

Everything runs entirely client side against the text a person types or pastes. Nothing is
uploaded, and no tool in this category needs a Web Worker or WASM — plain JavaScript string
operations are fast enough at the sizes a paste box holds. The one exception is Markdown
Formatter & Preview, which lazily loads a markdown rendering pipeline (markdown-it, KaTeX,
Mermaid, highlight.js) the same way the heavier categories load FFmpeg or pdf-lib — see
`lib/text/markdown/engine.ts`. Every other tool shares `components/text/control_panel.tsx`
(`ControlPanel`, `Field`, `Notice`, `StatGrid`, `StatTile`) and `components/text/
text_input_panel.tsx` for the left hand paste box; a new tool in this category should reuse both
before adding a new variant.

## Checklist

- [x] Word & Character Counter — `word-counter`
- [x] Text Statistics — `text-analyzer`
- [x] Case Converter — `case-converter`
- [x] Slug Generator — `slug-generator`
- [x] Text Reverser — `text-reverser`
- [x] Sort & Shuffle Text — `text-sorter`
- [x] Find & Replace — `find-replace`
- [x] Text Cleaner — `text-cleaner`
- [x] Line Editor — `line-editor`
- [x] Text Splitter & Joiner — `text-splitter`
- [x] Find Duplicates — `duplicate-lines`
- [x] Text Diff Checker — `text-diff`
- [x] Markdown Formatter & Preview — `markdown-formatter`

## Count & Analyze — `count-analyze`

### 1. Word & Character Counter — `word-counter`

**Built.** One merged tool rather than separate Word Counter and Character Counter pages, since
a person checking one count almost always wants the others too.

| Feature | Details |
| --- | --- |
| Counts | Words, characters, characters without spaces, sentences, paragraphs, lines. |
| Time estimates | Reading time and speaking time, from configurable words per minute. |
| Live | Every count updates as the user types or pastes, no button press needed. |

SEO: Word Counter, Character Counter, Word Count.

### 2. Text Statistics — `text-analyzer`

**Built.**

| Feature | Details |
| --- | --- |
| Frequency | Word frequency table, unique word count, most repeated words. |
| Shape | Average word length, longest and shortest word. |
| Keyword density | Percentage share of each significant word, for on page SEO checks. |

SEO: Text Analyzer, Word Frequency Counter.

## Convert & Transform — `convert-transform`

### 3. Case Converter — `case-converter`

| Feature | Details |
| --- | --- |
| Cases | lowercase, UPPERCASE, Title Case, Sentence case, Capitalize Words, camelCase, PascalCase, snake_case, kebab case, CONSTANT_CASE. |
| Live preview | Result updates as the source text or the chosen case changes. |

SEO: Case Converter, Uppercase Converter, Title Case Converter.

### 4. Slug Generator — `slug-generator`

| Feature | Details |
| --- | --- |
| Conversion | Turns any text into a lowercase, hyphenated, URL safe slug. |
| Options | Custom separator, max length, strip stop words. |

SEO: Slug Generator, URL Slug Generator.

### 5. Text Reverser — `text-reverser`

| Feature | Details |
| --- | --- |
| Modes | Reverse the complete text, reverse the order of words, reverse the letters within each word, reverse the order of lines. |

SEO: Reverse Text, Reverse Words.

### 6. Sort & Shuffle Text — `text-sorter`

| Feature | Details |
| --- | --- |
| Sort | A to Z, Z to A, numerical, natural (so "item 2" sorts before "item 10"). |
| Randomize | Shuffle into a random order, or simply reverse the current order. |
| Cleanup | Remove duplicate lines as part of the same pass. |

SEO: Sort Text, Alphabetize List, Shuffle List.

## Find & Clean — `find-clean`

### 7. Find & Replace — `find-replace`

| Feature | Details |
| --- | --- |
| Matching | Case sensitive toggle, whole word toggle, regular expression mode. |
| Replace | Replace first match or replace all, with a live match count before committing. |

SEO: Find and Replace Text, Search and Replace.

### 8. Text Cleaner — `text-cleaner`

One combined cleanup tool rather than a page per cleanup rule.

| Feature | Details |
| --- | --- |
| Whitespace | Remove extra spaces, leading and trailing spaces, empty lines, duplicate lines. |
| Characters | Remove invisible characters, unwanted characters, emojis, accents and diacritics. |
| Normalization | Normalize Unicode, turn smart quotes into straight quotes. |
| Markup | Strip HTML tags. |
| Toggles | Each cleanup rule is its own checkbox, so a user picks only what they want applied. |

SEO: Text Cleaner, Clean Text Online, Remove Extra Spaces.

### 9. Line Editor — `line-editor`

| Feature | Details |
| --- | --- |
| Add | Prefix, suffix, or sequential line numbers on every line. |
| Filter | Keep only lines containing a search term, or remove lines containing one. |
| Line breaks | Add line breaks at a chosen width, or remove them and join into one paragraph. |

SEO: Line Editor, Add Prefix Suffix, Remove Lines.

## Split & Combine — `split-combine`

### 10. Text Splitter & Joiner — `text-splitter`

| Feature | Details |
| --- | --- |
| Split by | Newline, comma, space, or a custom delimiter. |
| Join with | Newline, comma, space, or a custom separator. |
| Output | Result list can be copied as is or re split with a different delimiter without retyping the source. |

SEO: Split Text, Text Splitter, Text Joiner.

### 11. Find Duplicates — `duplicate-lines`

A focused companion to Sort & Shuffle Text for lists specifically.

| Feature | Details |
| --- | --- |
| Detect | Find duplicate lines and highlight them in place. |
| Count | Show how many times each duplicated line appears. |
| Remove | Remove duplicates, keeping either the first or the last occurrence. |

SEO: Remove Duplicate Lines, Duplicate Text Finder.

## Compare & Format — `compare-format`

### 12. Text Diff Checker — `text-diff`

**Built.** A line level LCS diff (`lib/text/text_diff.ts`), the same proven approach as the PDF
category's `lib/pdf/text_diff.ts`. Consecutive removed and added runs are paired into a single
"modified" row so a like for like line change reads as one change, not an unrelated remove plus
add.

| Feature | Details |
| --- | --- |
| Comparison | Line level diff between two pasted or uploaded text blocks, live on every change. |
| View modes | Side by side (two columns, paired modified rows) or unified (single column, `-`/`+` git style). |
| Ignore options | Ignore case, ignore whitespace changes — both affect comparison only, never the displayed text. |
| Highlight | Green added, red removed, yellow modified, consistent with the legend shown beside it. |
| Summary | A stat view of added, removed, modified and unchanged line counts. |
| Export | Copy the current view or download a classic `---`/`+++`/`-`/`+` unified `.txt` diff. |
| Limits | Comparison caps at 1,500 lines per side to keep the diff table a bounded size; a notice appears if either block is longer. |

SEO: Text Diff Checker, Compare Text, Difference Checker.

### 13. Markdown Formatter & Preview — `markdown-formatter`

**Built.** A markdown-it pipeline (`lib/text/markdown/engine.ts`) with footnotes, heading
anchors, emoji shortcodes, KaTeX math, and this tool's own plugins (`lib/text/markdown/
plugins.ts`) for interactive task lists and GitHub style alerts, plus Mermaid and highlight.js
for diagrams and syntax highlighting. Every heavy library loads lazily on first render, and the
final HTML is passed through DOMPurify before it reaches the page. The Preview always renders the
live, unformatted source — the Formatting Options only shape what Copy, Download and the
processor's `.md` export produce, so ticking one never silently rewrites what a person is typing.

| Feature | Details |
| --- | --- |
| Task lists | `- [ ]`/`- [x]` render as real, clickable checkboxes; clicking one flips the exact source line, found via markdown-it's own token map, not a line scanning heuristic. |
| Math | Inline `$...$` and block `$$...$$` LaTeX via KaTeX. |
| Diagrams | ` ```mermaid ` fences render as real diagrams; a block Mermaid rejects shows its own inline error, never a stray graphic elsewhere on the page. |
| Syntax highlighting | Language aware, via highlight.js, styled with this site's own colour tokens rather than a vendored theme. |
| Tables | GFM tables wrapped in a horizontally scrollable box. |
| Footnotes | Clickable `[^1]` references with a back linked footnote list. |
| Alerts | GitHub's `> [!NOTE]`/`TIP`/`IMPORTANT`/`WARNING`/`CAUTION` convention, each its own colour. |
| Emoji | `:rocket:` style shortcodes. |
| Anchor links | Every heading gets an id and a hover revealed permalink. |
| Links | Always open in a new tab without a `window.opener` handle. |
| Formatting options | Auto format (tidy spacing), normalize line endings, remove trailing spaces, fix indentation — independent toggles, applied to Copy/Download/Export only. |
| Sync scroll | Mirrors scroll position between the input and the preview. |
| Export | Copy or download the formatted `.md`, or Export PDF via the browser's own print to PDF, scoped to the preview only. |
| Expand | Fullscreen shows the editable source and the live preview side by side. |

SEO: Markdown Formatter, Markdown Preview, Markdown Editor.

## Shared conventions to build against

- Every tool works on typed or pasted text; a few (Text Cleaner, Line Editor) also accept a
  `.txt` file upload as a convenience, never a requirement.
- A live result is required wherever a tool has a result at all; no tool in this category makes
  a user click a button just to see what a setting produced, since text is cheap enough to
  recompute on every change.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
