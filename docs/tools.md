# Tools

Every tool below is a registry entry with a route. `lib/tools/registry.ts` is the single source
of truth; nothing here is hand maintained navigation. Per category planning docs:
`pdf_tools.md`, `image_tools.md`, `video_tools.md`, `audio_tools.md`, `text_tools.md`,
`developer_tools.md`, `converters_tools.md`, `utilities_tools.md`, `ai_tools.md`,
`math_tools.md`.

## Naming rules

- Slug: lowercase kebab case, short, what a person would search for — `merge-pdf`, not
  `merge_pdf_tool` or `pdf-merger-online`.
- Name: title case, matching the slug — `Merge PDF`.
- A slug is permanent once live. Renaming breaks links and search rankings.
- A tool lives in exactly one category. If two categories both want it, pick the stronger
  search intent and link to it from the other.

## URL scheme

Every category and tool URL is flat, with no category segment in the tool path:

```
/tools                        home
/tools/all                    every tool, grouped by category
/tools/pdf                    a category page
/tools/merge-pdf              a tool page — not /tools/pdf/merge-pdf
```

`toolPath()` in `lib/tools/registry.ts` builds every tool URL as `/${tool.slug}`; nothing else
constructs a tool URL by hand. This means **every tool slug across every category shares one
flat namespace**, and must also stay distinct from the 10 category slugs (`pdf`, `image`,
`video`, `audio`, `text`, `developer`, `converters`, `utilities`, `ai`, `math`). `registry.ts`
asserts this at module load — a duplicate slug or a slug matching a category name throws
immediately rather than silently shadowing a route. Keep this in mind when naming a new tool:
check the table below (or grep the registry) before picking a slug, not after.

## Categories

| Category | Route | Tools | Sections | Status |
| --- | --- | --- | --- | --- |
| PDF Tools | `/tools/pdf` | 37 | 6 | All available |
| Image Tools | `/tools/image` | 64 | 5 | All available |
| Video Tools | `/tools/video` | 8 | 4 | 6 available, 2 planned |
| Audio Tools | `/tools/audio` | 10 | 3 | All available |
| Text Tools | `/tools/text` | 13 | 5 | All available |
| Developer Tools | `/tools/developer` | 18 | 6 | All available |
| Converters | `/tools/converters` | 7 | none | All planned |
| Utilities | `/tools/utilities` | 5 | none | All planned |
| AI Tools | `/tools/ai` | 2 | none | All available |
| Math Tools | `/tools/math` | 6 | none | 2 available, 4 planned |

A category large enough to be hard to scan declares sections in `lib/tools/sections.ts`, and
each of its tools names one in `section`. PDF, Image, Video, Audio, Text and Developer have them
today.

## Full URL table

Every tool's canonical URL, alphabetical within its category. Generated from `registry.ts` —
if this drifts from the live registry, regenerate it rather than hand editing rows.

### PDF Tools — `/tools/pdf` — 38 tools

| Tool | URL | Status |
| --- | --- | --- |
| Add Page Numbers | `/tools/add-page-numbers` | Available |
| Add Watermark | `/tools/add-watermark` | Available |
| Compare PDF | `/tools/compare-pdf` | Available |
| Compress PDF | `/tools/compress-pdf` | Available |
| Crop PDF | `/tools/crop-pdf` | Available |
| Remove Pages | `/tools/delete-pages` | Available |
| Edit PDF | `/tools/edit-pdf` | Available |
| Excel to PDF | `/tools/excel-to-pdf` | Available |
| Extract Pages | `/tools/extract-pages` | Available |
| Flatten PDF | `/tools/flatten-pdf` | Available |
| HTML to PDF | `/tools/html-to-pdf` | Available |
| Images to PDF | `/tools/jpg-to-pdf` | Available |
| Jupyter Notebook to PDF | `/tools/ipynb-to-pdf` | Available |
| Markdown to PDF | `/tools/markdown-to-pdf` | Available |
| Merge PDF | `/tools/merge-pdf` | Available |
| OCR PDF | `/tools/ocr-pdf` | Available |
| Organize PDF | `/tools/organize-pdf` | Available |
| PDF Forms | `/tools/pdf-forms` | Available |
| PDF to Excel | `/tools/pdf-to-excel` | Available |
| PDF to HTML | `/tools/pdf-to-html` | Available |
| PDF to Images | `/tools/pdf-to-jpg` | Available |
| PDF to Markdown | `/tools/pdf-to-markdown` | Available |
| PDF to PDF/A | `/tools/pdf-to-pdfa` | Available |
| PDF to PowerPoint | `/tools/pdf-to-powerpoint` | Available |
| PDF to Text | `/tools/pdf-to-text` | Available |
| PDF to Word | `/tools/pdf-to-word` | Available |
| PowerPoint to PDF | `/tools/powerpoint-to-pdf` | Available |
| Protect PDF | `/tools/protect-pdf` | Available |
| Redact PDF | `/tools/redact-pdf` | Available |
| Remove Metadata | `/tools/remove-metadata` | Available |
| Repair PDF | `/tools/repair-pdf` | Available |
| Rotate PDF | `/tools/rotate-pdf` | Available |
| Scan to PDF | `/tools/scan-to-pdf` | Available |
| Sign PDF | `/tools/sign-pdf` | Available |
| Split PDF | `/tools/split-pdf` | Available |
| Text to PDF | `/tools/text-to-pdf` | Available |
| Unlock PDF | `/tools/unlock-pdf` | Available |
| Word to PDF | `/tools/word-to-pdf` | Available |

### Image Tools — `/tools/image` — 64 tools

| Tool | URL | Status |
| --- | --- | --- |
| AVIF to BMP | `/tools/avif-to-bmp` | Available |
| AVIF to GIF | `/tools/avif-to-gif` | Available |
| AVIF to JPG | `/tools/avif-to-jpg` | Available |
| AVIF to PNG | `/tools/avif-to-png` | Available |
| AVIF to TIFF | `/tools/avif-to-tiff` | Available |
| AVIF to WebP | `/tools/avif-to-webp` | Available |
| Blur & Pixelate Image | `/tools/blur-pixelate` | Available |
| BMP to AVIF | `/tools/bmp-to-avif` | Available |
| BMP to JPG | `/tools/bmp-to-jpg` | Available |
| BMP to PNG | `/tools/bmp-to-png` | Available |
| BMP to WebP | `/tools/bmp-to-webp` | Available |
| Collage Maker | `/tools/collage-maker` | Available |
| Color Extractor | `/tools/color-extractor` | Available |
| Compress Image | `/tools/compress-image` | Available |
| Convert Image | `/tools/convert-image` | Available |
| Crop Image | `/tools/crop-image` | Available |
| GIF to AVIF | `/tools/gif-to-avif` | Available |
| GIF to JPG | `/tools/gif-to-jpg` | Available |
| GIF to PNG | `/tools/gif-to-png` | Available |
| GIF to WebP | `/tools/gif-to-webp` | Available |
| HEIC to AVIF | `/tools/heic-to-avif` | Available |
| HEIC to JPG | `/tools/heic-to-jpg` | Available |
| HEIC to PNG | `/tools/heic-to-png` | Available |
| HEIC to WebP | `/tools/heic-to-webp` | Available |
| ICO to AVIF | `/tools/ico-to-avif` | Available |
| ICO to JPG | `/tools/ico-to-jpg` | Available |
| ICO to PNG | `/tools/ico-to-png` | Available |
| ICO to WebP | `/tools/ico-to-webp` | Available |
| Image Editor | `/tools/image-editor` | Available |
| Image Metadata | `/tools/image-metadata` | Available |
| Image to Text | `/tools/image-to-text` | Available |
| JPG to AVIF | `/tools/jpg-to-avif` | Available |
| JPG to BMP | `/tools/jpg-to-bmp` | Available |
| JPG to GIF | `/tools/jpg-to-gif` | Available |
| JPG to ICO | `/tools/jpg-to-ico` | Available |
| JPG to PNG | `/tools/jpg-to-png` | Available |
| JPG to TIFF | `/tools/jpg-to-tiff` | Available |
| JPG to WebP | `/tools/jpg-to-webp` | Available |
| Meme Generator | `/tools/meme-generator` | Available |
| PNG to AVIF | `/tools/png-to-avif` | Available |
| PNG to BMP | `/tools/png-to-bmp` | Available |
| PNG to GIF | `/tools/png-to-gif` | Available |
| PNG to ICO | `/tools/png-to-ico` | Available |
| PNG to JPG | `/tools/png-to-jpg` | Available |
| PNG to TIFF | `/tools/png-to-tiff` | Available |
| PNG to WebP | `/tools/png-to-webp` | Available |
| Resize Image | `/tools/resize-image` | Available |
| Rotate & Flip Image | `/tools/rotate-flip-image` | Available |
| Screenshot Beautifier | `/tools/screenshot-beautifier` | Available |
| SVG to AVIF | `/tools/svg-to-avif` | Available |
| SVG to JPG | `/tools/svg-to-jpg` | Available |
| SVG to PNG | `/tools/svg-to-png` | Available |
| SVG to WebP | `/tools/svg-to-webp` | Available |
| TIFF to AVIF | `/tools/tiff-to-avif` | Available |
| TIFF to JPG | `/tools/tiff-to-jpg` | Available |
| TIFF to PNG | `/tools/tiff-to-png` | Available |
| TIFF to WebP | `/tools/tiff-to-webp` | Available |
| Watermark Image | `/tools/watermark-image` | Available |
| WebP to AVIF | `/tools/webp-to-avif` | Available |
| WebP to BMP | `/tools/webp-to-bmp` | Available |
| WebP to GIF | `/tools/webp-to-gif` | Available |
| WebP to JPG | `/tools/webp-to-jpg` | Available |
| WebP to PNG | `/tools/webp-to-png` | Available |
| WebP to TIFF | `/tools/webp-to-tiff` | Available |

### Video Tools — `/tools/video` — 6 tools

| Tool | URL | Status |
| --- | --- | --- |
| Compress Video | `/tools/compress-video` | Available |
| Convert Video | `/tools/convert-video` | Available |
| GIF Maker | `/tools/gif-maker` | Available |
| Resize & Crop Video | `/tools/resize-crop-video` | Available |
| Screen & Camera Recorder | `/tools/screen-recorder` | Available |
| Trim & Cut Video | `/tools/trim-cut-video` | Available |

### Audio Tools — `/tools/audio` — 10 tools

| Tool | URL | Status |
| --- | --- | --- |
| Audio Metadata Editor | `/tools/audio-metadata-editor` | Available |
| Audio Speed & Pitch Changer | `/tools/audio-speed-pitch` | Available |
| Audio Compressor | `/tools/compress-audio` | Available |
| Audio Converter | `/tools/convert-audio` | Available |
| Audio Merger & Joiner | `/tools/merge-audio` | Available |
| Reverse Audio | `/tools/reverse-audio` | Available |
| Audio Trimmer & Cutter | `/tools/trim-audio` | Available |
| Video to Audio | `/tools/video-to-audio` | Available |
| Voice Recorder | `/tools/voice-recorder` | Available |
| Volume Booster & Normalizer | `/tools/volume-booster` | Available |

### Text Tools — `/tools/text` — 13 tools

| Tool | URL | Status |
| --- | --- | --- |
| Case Converter | `/tools/case-converter` | Available |
| Find Duplicates | `/tools/duplicate-lines` | Available |
| Find & Replace | `/tools/find-replace` | Available |
| Line Editor | `/tools/line-editor` | Available |
| Markdown Formatter & Preview | `/tools/markdown-formatter` | Available |
| Slug Generator | `/tools/slug-generator` | Available |
| Text Statistics | `/tools/text-analyzer` | Available |
| Text Cleaner | `/tools/text-cleaner` | Available |
| Text Diff Checker | `/tools/text-diff` | Available |
| Text Reverser | `/tools/text-reverser` | Available |
| Sort & Shuffle Text | `/tools/text-sorter` | Available |
| Text Splitter & Joiner | `/tools/text-splitter` | Available |
| Word & Character Counter | `/tools/word-counter` | Available |

### Developer Tools — `/tools/developer` — 18 tools

| Tool | URL | Status |
| --- | --- | --- |
| Base64 Encoder & Decoder | `/tools/base64-converter` | Available |
| Code Diff Checker | `/tools/code-diff` | Available |
| Code Formatter & Beautifier | `/tools/code-formatter` | Available |
| Code Minifier | `/tools/code-minifier` | Available |
| CSV Viewer & Converter | `/tools/csv-viewer` | Available |
| Hash Generator | `/tools/hash-generator` | Available |
| HTML Tools | `/tools/html-tools` | Available |
| HTTP Status Code Lookup | `/tools/http-status-codes` | Available |
| JSON Formatter & Validator | `/tools/json-formatter` | Available |
| JSON, YAML & XML Converter | `/tools/json-yaml-xml-converter` | Available |
| JWT Decoder | `/tools/jwt-decoder` | Available |
| Lorem Ipsum Generator | `/tools/lorem-ipsum` | Available |
| MIME Type Lookup | `/tools/mime-type-lookup` | Available |
| Random Data Generator | `/tools/random-data-generator` | Available |
| URL Encoder & Decoder | `/tools/url-encoder-decoder` | Available |
| URL Parser | `/tools/url-parser` | Available |
| URL Query String Tool | `/tools/url-query-string` | Available |
| UUID Generator | `/tools/uuid-generator` | Available |

### Converters — `/tools/converters` — 7 tools

| Tool | URL | Status |
| --- | --- | --- |
| Currency Converter | `/tools/currency-converter` | Planned |
| Data Converter | `/tools/data-converter` | Planned |
| Length Converter | `/tools/length-converter` | Planned |
| Temperature Converter | `/tools/temperature-converter` | Planned |
| Time Converter | `/tools/time-converter` | Planned |
| Unit Converter | `/tools/unit-converter` | Planned |
| Weight Converter | `/tools/weight-converter` | Planned |

### Utilities — `/tools/utilities` — 4 tools

| Tool | URL | Status |
| --- | --- | --- |
| QR Generator | `/tools/qr-generator` | Available |
| Random Generator | `/tools/random-generator` | Planned |
| Stopwatch | `/tools/stopwatch` | Available |
| Timer | `/tools/timer` | Available |

### AI Tools — `/tools/ai` — 2 tools

| Tool | URL | Status |
| --- | --- | --- |
| Gemini Video Watermark Remover | `/tools/gemini-video-watermark-remover` | Available |
| Gemini Watermark Remover | `/tools/gemini-watermark-remover` | Available |

### Math Tools — `/tools/math` — 6 tools

| Tool | URL | Status |
| --- | --- | --- |
| 3D Graphing Calculator | `/tools/3d-graphing-calculator` | Planned |
| Basic Calculator | `/tools/calculator` | Available |
| Graphing Calculator | `/tools/graphing-calculator` | Planned |
| Matrix Calculator | `/tools/matrix-calculator` | Planned |
| Programmer Calculator | `/tools/programmer-calculator` | Planned |
| Scientific Calculator | `/tools/scientific-calculator` | Available |

## Notes

- Images to PDF and PDF to Images live under PDF only. A duplicate under Image would compete
  with itself in search; the Image Tools page links across instead (`CATEGORY_CROSS_LINKS` in
  `lib/tools/sections.ts`).
- JSON Formatter lives under Developer only, for the same reason.
- Lorem Ipsum lives under Developer, not Utilities: placeholder text is overwhelmingly a web
  and app development need.
- `currency-converter` is the one tool with `client_only: false` — exchange rates cannot be
  computed offline.
- Basic Calculator lives under Math, not Utilities, and kept the `calculator` slug it had there.
  Math is the stronger fit next to the Scientific, Graphing, Programmer, Matrix and 3D Graphing
  Calculators.
