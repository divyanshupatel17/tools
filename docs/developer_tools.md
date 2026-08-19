# Developer tools: state

Single source of truth for what the Developer category contains. Registry entries live in
`apps/web/lib/tools/registry.ts`. Developer has **18 tools across 6 sections** (declared in
`lib/tools/sections.ts`, same mechanism as PDF, Image and Audio) — each tool below is one
registry entry, one processor, one workspace. All 18 are `status: 'available'`.

This is where programming language specific functionality belongs: formatting, validating,
converting, encoding, comparing and testing code and data. Everything runs client side; nothing
is uploaded, and no tool here needs the server, since parsing and reformatting text is cheap
enough for the main thread or, for very large pastes, a Web Worker.

`lorem-ipsum` used to live under Utilities; it moved here because placeholder text is
overwhelmingly a web and app development need, not a general everyday helper.

## Checklist

- [x] Code Formatter & Beautifier — `code-formatter`
- [x] Code Minifier — `code-minifier`
- [x] Code Diff Checker — `code-diff`
- [x] JSON Formatter & Validator — `json-formatter`
- [x] JSON, YAML & XML Converter — `json-yaml-xml-converter`
- [x] CSV Viewer & Converter — `csv-viewer`
- [x] Base64 Encoder & Decoder — `base64-converter`
- [x] HTML Tools — `html-tools`
- [x] URL Encoder & Decoder — `url-encoder-decoder`
- [x] URL Parser — `url-parser`
- [x] Hash Generator — `hash-generator`
- [x] JWT Decoder — `jwt-decoder`
- [x] UUID Generator — `uuid-generator`
- [x] URL Query String Tool — `url-query-string`
- [x] HTTP Status Code Lookup — `http-status-codes`
- [x] MIME Type Lookup — `mime-type-lookup`
- [x] Random Data Generator — `random-data-generator`
- [x] Lorem Ipsum Generator — `lorem-ipsum`

## Code — `code`

### 1. Code Formatter & Beautifier — `code-formatter`

The most important tool in this category: one workspace covering every language, not a
separate page per language.

| Feature | Details |
| --- | --- |
| Web languages | HTML, CSS, SCSS, Sass, Less, JavaScript, TypeScript, JSX, TSX, Vue and Angular templates. |
| Programming languages | C, C++, C#, Java, Python, Kotlin, Swift, Go, Rust, PHP, Ruby, Dart, Scala. |
| Shell & other | Bash/Shell, PowerShell, SQL, R, Lua, Perl. |
| Data & config | JSON, XML, YAML, TOML, INI, Markdown. |
| Detection | Language picker with auto detect where the syntax is unambiguous enough to guess. |
| Actions | Format/beautify, minify where the language supports it, syntax highlighting, line numbers, copy, download, upload a file, tabs vs spaces and indent width, undo/redo. |

SEO: Code Formatter, Code Beautifier, Online Code Formatter, JavaScript Formatter, Python
Formatter, C++ Formatter, Java Formatter.

### 2. Code Minifier — `code-minifier`

Kept separate from the formatter because "minifier" is its own strong search term.

| Feature | Details |
| --- | --- |
| Languages | HTML, CSS, JavaScript, JSON, and XML where practical. |
| Output | Size before and after, percentage saved. |

SEO: Code Minifier, JavaScript Minifier, CSS Minifier, HTML Minifier.

### 3. Code Diff Checker — `code-diff`

| Feature | Details |
| --- | --- |
| Input | Code, plain text, or an uploaded file on each side. |
| Views | Side by side or unified. |
| Marking | Added, removed and changed lines, with syntax highlighting and an ignore whitespace option. |

SEO: Code Diff, Compare Code, Code Comparison Tool.

## Data — `data`

### 4. JSON Formatter & Validator — `json-formatter`

| Feature | Details |
| --- | --- |
| Format | Beautify or minify, with adjustable indent width. |
| Validate | Syntax errors reported with the exact line and column. |
| Explore | Collapsible tree view, search by key. |

SEO: JSON Formatter, JSON Validator, JSON Beautifier.

### 5. JSON, YAML & XML Converter — `json-yaml-xml-converter`

One tool covering every direction rather than three separate converter pages.

| Feature | Details |
| --- | --- |
| Directions | JSON to YAML, YAML to JSON, JSON to XML, XML to JSON, YAML to XML where the shapes map reliably. |
| Preview | Both sides shown at once, converted live as the source changes. |

SEO: JSON to YAML, YAML to JSON, JSON to XML, XML to JSON.

### 6. CSV Viewer & Converter — `csv-viewer`

| Feature | Details |
| --- | --- |
| View | CSV rendered as a sortable, searchable table. |
| Convert | CSV to JSON, JSON to CSV. |
| Export | Download as an Excel compatible CSV. |

SEO: CSV Viewer, CSV to JSON, JSON to CSV.

### 7. Base64 Encoder & Decoder — `base64-converter`

| Feature | Details |
| --- | --- |
| Text | Text to Base64 and Base64 to text. |
| Files | A file to a Base64 string, and a Base64 string back to a downloadable file. |
| Output | Copy or download the result. |

SEO: Base64 Encode, Base64 Decode, Base64 Converter.

## Web & URL — `web-url`

### 8. HTML Tools — `html-tools`

One combined tool rather than separate encode/decode/preview pages.

| Feature | Details |
| --- | --- |
| Encode/decode | HTML entity encode and decode. |
| Escape/unescape | HTML escape and unescape for embedding in other markup. |
| Strip | Remove HTML tags, leaving plain text. |
| Preview | Render the HTML live alongside the source. |

SEO: HTML Encoder, HTML Decoder, HTML Escape, HTML Preview.

### 9. URL Encoder & Decoder — `url-encoder-decoder`

| Feature | Details |
| --- | --- |
| Encode | Percent encode text for a URL or a query string. |
| Decode | Percent decode back to readable text. |

SEO: URL Encoder, URL Decoder.

### 10. URL Parser — `url-parser`

| Feature | Details |
| --- | --- |
| Breakdown | Protocol, host, domain, path, query parameters and hash, each shown in its own field. |

SEO: URL Parser, Parse URL.

## Encoding & Utilities — `encoding-utilities`

### 11. Hash Generator — `hash-generator`

| Feature | Details |
| --- | --- |
| Algorithms | MD5, SHA1, SHA256, SHA384, SHA512. |
| Input | Text, or a file, hashed locally through the Web Crypto API (MD5 via a small local implementation, since Web Crypto does not offer it). |

SEO: SHA256 Generator, Hash Generator, File Hash Checker.

### 12. JWT Decoder — `jwt-decoder`

| Feature | Details |
| --- | --- |
| Decode | Header and payload decoded and shown as formatted JSON. |
| Expiry | Reads the `exp` claim and shows whether the token has expired. |
| Copy | Copy either section as JSON. |
| Scope | Decodes only; the control panel is explicit that this is not signature verification. |

SEO: JWT Decoder, Decode JWT Token.

### 13. UUID Generator — `uuid-generator`

| Feature | Details |
| --- | --- |
| Version | UUID v4. |
| Bulk | Generate many at once. |
| Copy | Copy one at a time or copy all. |
| Format | Uppercase or lowercase, with or without hyphens. |

SEO: UUID Generator, GUID Generator.

### 14. URL Query String Tool — `url-query-string`

| Feature | Details |
| --- | --- |
| Parse | Query string to a JSON object. |
| Build | JSON object back to a query string, with automatic URL encoding of each value. |
| Edit | Add, edit or remove individual parameters directly. |

SEO: Query String Parser, URL Parameters Tool.

## API & Reference — `api-reference`

### 15. HTTP Status Code Lookup — `http-status-codes`

| Feature | Details |
| --- | --- |
| Search | By code (200, 301, 404, 429, 500 and the rest) or by keyword. |
| Result | Meaning, category (informational, success, redirection, client error, server error) and a common use case. |

SEO: HTTP Status Codes, HTTP Status Code Lookup.

### 16. MIME Type Lookup — `mime-type-lookup`

| Feature | Details |
| --- | --- |
| Search | By file extension (`png`) or by MIME type (`image/png`), matching in either direction. |

SEO: MIME Type Lookup, File MIME Type.

## Generate — `generate`

### 17. Random Data Generator — `random-data-generator`

| Feature | Details |
| --- | --- |
| Fields | Names, emails, numbers, UUIDs, dates, strings, boolean values, assembled into JSON records. |
| Export | JSON or CSV, for a chosen number of rows. |

SEO: Random Data Generator, Test Data Generator, Fake Data Generator.

### 18. Lorem Ipsum Generator — `lorem-ipsum`

| Feature | Details |
| --- | --- |
| Units | Paragraphs, sentences or words, for a chosen count. |
| Output | Plain text or HTML (wrapped in `<p>` tags), with a copy button. |

SEO: Lorem Ipsum Generator, Placeholder Text Generator.

## Shared conventions to build against

- Every tool works on typed, pasted or uploaded text; a result renders live wherever the input
  is small enough to reformat on every keystroke, and on an explicit action for larger pastes.
- Copy and download are offered wherever there is a result, matching every other category.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
