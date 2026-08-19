# PDF tools: state

Single source of truth for what the PDF category contains and what runs today. Registry
entries live in `apps/web/lib/tools/registry.ts`; section headers in `apps/web/lib/tools/sections.ts`.

Everything runs in the browser. Nothing is uploaded. All 37 tools are `status: 'available'`.

## Checklist

- [x] Merge PDF — `merge-pdf`
- [x] Split PDF — `split-pdf`
- [x] Remove Pages — `delete-pages`
- [x] Extract Pages — `extract-pages`
- [x] Organize PDF — `organize-pdf`
- [x] Scan to PDF — `scan-to-pdf`
- [x] Compress PDF — `compress-pdf`
- [x] Repair PDF — `repair-pdf`
- [x] OCR PDF — `ocr-pdf`
- [x] Flatten PDF — `flatten-pdf`
- [x] Images to PDF — `jpg-to-pdf`
- [x] Word to PDF — `word-to-pdf`
- [x] PowerPoint to PDF — `powerpoint-to-pdf`
- [x] Excel to PDF — `excel-to-pdf`
- [x] HTML to PDF — `html-to-pdf`
- [x] Markdown to PDF — `markdown-to-pdf`
- [x] Text to PDF — `text-to-pdf`
- [x] PDF to Images — `pdf-to-jpg`
- [x] PDF to Word — `pdf-to-word`
- [x] PDF to PowerPoint — `pdf-to-powerpoint`
- [x] PDF to Excel — `pdf-to-excel`
- [x] PDF to PDF/A — `pdf-to-pdfa`
- [x] PDF to Markdown — `pdf-to-markdown`
- [x] PDF to HTML — `pdf-to-html`
- [x] PDF to Text — `pdf-to-text`
- [x] Rotate PDF — `rotate-pdf`
- [x] Add Page Numbers — `add-page-numbers`
- [x] Add Watermark — `add-watermark`
- [x] Crop PDF — `crop-pdf`
- [x] Edit PDF — `edit-pdf`
- [x] PDF Forms — `pdf-forms`
- [x] Unlock PDF — `unlock-pdf`
- [x] Protect PDF — `protect-pdf`
- [x] Sign PDF — `sign-pdf`
- [x] Redact PDF — `redact-pdf`
- [x] Compare PDF — `compare-pdf`
- [x] Remove Metadata — `remove-metadata`

## Organize PDF

| Tool | Slug | Notes |
| --- | --- | --- |
| Merge PDF | `merge-pdf` | Reorder, name sort, custom output name. |
| Split PDF | `split-pdf` | Ranges, every N pages, or one file per page. |
| Remove Pages | `delete-pages` | Page grid, tap to select and delete. |
| Extract Pages | `extract-pages` | Same grid, inverted. |
| Organize PDF | `organize-pdf` | Reorder, rotate and delete on one grid. |
| Scan to PDF | `scan-to-pdf` | Camera capture or upload, perspective crop, per page view popup. |

## Optimize PDF

| Tool | Slug | Notes |
| --- | --- | --- |
| Compress PDF | `compress-pdf` | Quality slider (debounced real recompress) or a target size (KB/MB, decimals like 1.5 MB) that binary searches for the closest quality. |
| Repair PDF | `repair-pdf` | Rebuilds a broken cross reference table and object graph. |
| OCR PDF | `ocr-pdf` | Tesseract.js in the browser, invisible searchable text layer. English only for now. |
| Flatten PDF | `flatten-pdf` | Bakes form field appearances into the page, one way. |

## Convert to PDF

| Tool | Slug | Notes |
| --- | --- | --- |
| Images to PDF | `jpg-to-pdf` | JPG, PNG, WebP, GIF, BMP; per image view, rotate, reorder. |
| Word to PDF | `word-to-pdf` | Headings, bold/italic, lists and tables from the docx XML. Font size/color and images are not carried over yet. |
| PowerPoint to PDF | `powerpoint-to-pdf` | Title placeholder becomes a heading, bullets and bold/italic are read from the slide XML, one PDF page per slide. |
| Excel to PDF | `excel-to-pdf` | First sheet as a real ruled table. Other sheets, cell formatting and formulas are not carried over. |
| HTML to PDF | `html-to-pdf` | Structural tags plus inline bold/italic/code, no CSS layout. |
| Markdown to PDF | `markdown-to-pdf` | Bold, italic, strikethrough, inline code, blockquotes, horizontal rules and clickable links. |
| Text to PDF | `text-to-pdf` | Line by line, manual line breaks preserved. |

## Convert from PDF

| Tool | Slug | Notes |
| --- | --- | --- |
| PDF to Images | `pdf-to-jpg` | JPG, PNG or WebP at a chosen DPI. |
| PDF to Word | `pdf-to-word` | Text and heading structure. Table layout is not reconstructed. |
| PDF to PowerPoint | `pdf-to-powerpoint` | Renders each page as a picture slide, not editable text boxes. |
| PDF to Excel | `pdf-to-excel` | Cells are grouped by real text x position on the page, not a whitespace guess. |
| PDF to PDF/A | `pdf-to-pdfa` | Rasterised pages, embedded ICC profile, PDF/A-2B metadata. |
| PDF to Markdown | `pdf-to-markdown` | Heading and list heuristics from font size and bullets. |
| PDF to HTML | `pdf-to-html` | Same extraction, HTML output. |
| PDF to Text | `pdf-to-text` | Plain reading order text. |

## Edit PDF

| Tool | Slug | Notes |
| --- | --- | --- |
| Rotate PDF | `rotate-pdf` | Per page or all pages. |
| Add Page Numbers | `add-page-numbers` | Six presets, or drag the number to any spot on the live preview. |
| Add Watermark | `add-watermark` | Text or image, opacity, rotation, centered or tiled. |
| Crop PDF | `crop-pdf` | One crop rectangle, applied to every page or a range. |
| Edit PDF | `edit-pdf` | Drop new text and image elements anywhere on a page. |
| PDF Forms | `pdf-forms` | Fills existing AcroForm fields; the left preview re renders the page live as you type. |

## PDF Security

| Tool | Slug | Notes |
| --- | --- | --- |
| Unlock PDF | `unlock-pdf` | Removes a known password. Not a password cracker. |
| Protect PDF | `protect-pdf` | AES 256 bit encryption, hand built on Web Crypto. |
| Sign PDF | `sign-pdf` | Draw, type or upload a signature. Visible only, no PAdES. |
| Redact PDF | `redact-pdf` | Boxed pages are rasterised so the covered content is actually removed. |
| Compare PDF | `compare-pdf` | Scroll synced page viewers with a change report panel, grouped by page. |
| Remove Metadata | `remove-metadata` | Drops the info dictionary and any XMP stream. |

## Shared code

| Piece | Used for |
| --- | --- |
| `components/pdf/page_detail_modal.tsx` | View action on every page/document, PDF or image. |
| `components/pdf/page_grid.tsx` | Page grid tools; drag is reorder only. |
| `lib/pdf/pdf_text.ts`, `components/pdf/text_extract_workspace.tsx` | Text output tools. |
| `lib/pdf/pdf_typeset.ts`, `lib/pdf/unicode_font.ts` | Markdown/HTML/Text to PDF, block typesetting with real Unicode fonts. |
| `components/tool_card/related_tools_list.tsx` | Title only related list, grouped by section. |

Control panel copy stays a caveat or two, never a paragraph. No hyphens or dashes in user
facing text.

## Known gaps

| Tool | Gap |
| --- | --- |
| Word to PDF | No font size/color or inline image support yet, structure only. |
| PDF to Word / PowerPoint | Table layout and editable slide text are not reconstructed; PDF to PowerPoint rasterises each page as a picture on purpose. |
| Markdown to PDF | Nested inline styles (bold inside italic) are not resolved, innermost marker wins. |
