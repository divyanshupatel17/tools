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
/                       home
/all                    every tool, grouped by category
/pdf                    a category page
/merge-pdf              a tool page — not /pdf/merge-pdf
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
| PDF Tools | `/pdf` | 37 | 6 | All available |
| Image Tools | `/image` | 64 | 5 | All available |
| Video Tools | `/video` | 8 | 4 | 6 available, 2 planned |
| Audio Tools | `/audio` | 10 | 3 | All available |
| Text Tools | `/text` | 13 | 5 | All available |
| Developer Tools | `/developer` | 18 | 6 | All available |
| Converters | `/converters` | 7 | none | All planned |
| Utilities | `/utilities` | 5 | none | All planned |
| AI Tools | `/ai` | 2 | none | All available |
| Math Tools | `/math` | 6 | none | 2 available, 4 planned |

A category large enough to be hard to scan declares sections in `lib/tools/sections.ts`, and
each of its tools names one in `section`. PDF, Image, Video, Audio, Text and Developer have them
today.

## Full URL table

Every tool's canonical URL, alphabetical within its category. Generated from `registry.ts` —
if this drifts from the live registry, regenerate it rather than hand editing rows.

### PDF Tools — `/pdf` — 38 tools

| Tool | URL | Status |
| --- | --- | --- |
| Add Page Numbers | `/add-page-numbers` | Available |
| Add Watermark | `/add-watermark` | Available |
| Compare PDF | `/compare-pdf` | Available |
| Compress PDF | `/compress-pdf` | Available |
| Crop PDF | `/crop-pdf` | Available |
| Remove Pages | `/delete-pages` | Available |
| Edit PDF | `/edit-pdf` | Available |
| Excel to PDF | `/excel-to-pdf` | Available |
| Extract Pages | `/extract-pages` | Available |
| Flatten PDF | `/flatten-pdf` | Available |
| HTML to PDF | `/html-to-pdf` | Available |
| Images to PDF | `/jpg-to-pdf` | Available |
| Jupyter Notebook to PDF | `/ipynb-to-pdf` | Available |
| Markdown to PDF | `/markdown-to-pdf` | Available |
| Merge PDF | `/merge-pdf` | Available |
| OCR PDF | `/ocr-pdf` | Available |
| Organize PDF | `/organize-pdf` | Available |
| PDF Forms | `/pdf-forms` | Available |
| PDF to Excel | `/pdf-to-excel` | Available |
| PDF to HTML | `/pdf-to-html` | Available |
| PDF to Images | `/pdf-to-jpg` | Available |
| PDF to Markdown | `/pdf-to-markdown` | Available |
| PDF to PDF/A | `/pdf-to-pdfa` | Available |
| PDF to PowerPoint | `/pdf-to-powerpoint` | Available |
| PDF to Text | `/pdf-to-text` | Available |
| PDF to Word | `/pdf-to-word` | Available |
| PowerPoint to PDF | `/powerpoint-to-pdf` | Available |
| Protect PDF | `/protect-pdf` | Available |
| Redact PDF | `/redact-pdf` | Available |
| Remove Metadata | `/remove-metadata` | Available |
| Repair PDF | `/repair-pdf` | Available |
| Rotate PDF | `/rotate-pdf` | Available |
| Scan to PDF | `/scan-to-pdf` | Available |
| Sign PDF | `/sign-pdf` | Available |
| Split PDF | `/split-pdf` | Available |
| Text to PDF | `/text-to-pdf` | Available |
| Unlock PDF | `/unlock-pdf` | Available |
| Word to PDF | `/word-to-pdf` | Available |

### Image Tools — `/image` — 64 tools

| Tool | URL | Status |
| --- | --- | --- |
| AVIF to BMP | `/avif-to-bmp` | Available |
| AVIF to GIF | `/avif-to-gif` | Available |
| AVIF to JPG | `/avif-to-jpg` | Available |
| AVIF to PNG | `/avif-to-png` | Available |
| AVIF to TIFF | `/avif-to-tiff` | Available |
| AVIF to WebP | `/avif-to-webp` | Available |
| Blur & Pixelate Image | `/blur-pixelate` | Available |
| BMP to AVIF | `/bmp-to-avif` | Available |
| BMP to JPG | `/bmp-to-jpg` | Available |
| BMP to PNG | `/bmp-to-png` | Available |
| BMP to WebP | `/bmp-to-webp` | Available |
| Collage Maker | `/collage-maker` | Available |
| Color Extractor | `/color-extractor` | Available |
| Compress Image | `/compress-image` | Available |
| Convert Image | `/convert-image` | Available |
| Crop Image | `/crop-image` | Available |
| GIF to AVIF | `/gif-to-avif` | Available |
| GIF to JPG | `/gif-to-jpg` | Available |
| GIF to PNG | `/gif-to-png` | Available |
| GIF to WebP | `/gif-to-webp` | Available |
| HEIC to AVIF | `/heic-to-avif` | Available |
| HEIC to JPG | `/heic-to-jpg` | Available |
| HEIC to PNG | `/heic-to-png` | Available |
| HEIC to WebP | `/heic-to-webp` | Available |
| ICO to AVIF | `/ico-to-avif` | Available |
| ICO to JPG | `/ico-to-jpg` | Available |
| ICO to PNG | `/ico-to-png` | Available |
| ICO to WebP | `/ico-to-webp` | Available |
| Image Editor | `/image-editor` | Available |
| Image Metadata | `/image-metadata` | Available |
| Image to Text | `/image-to-text` | Available |
| JPG to AVIF | `/jpg-to-avif` | Available |
| JPG to BMP | `/jpg-to-bmp` | Available |
| JPG to GIF | `/jpg-to-gif` | Available |
| JPG to ICO | `/jpg-to-ico` | Available |
| JPG to PNG | `/jpg-to-png` | Available |
| JPG to TIFF | `/jpg-to-tiff` | Available |
| JPG to WebP | `/jpg-to-webp` | Available |
| Meme Generator | `/meme-generator` | Available |
| PNG to AVIF | `/png-to-avif` | Available |
| PNG to BMP | `/png-to-bmp` | Available |
| PNG to GIF | `/png-to-gif` | Available |
| PNG to ICO | `/png-to-ico` | Available |
| PNG to JPG | `/png-to-jpg` | Available |
| PNG to TIFF | `/png-to-tiff` | Available |
| PNG to WebP | `/png-to-webp` | Available |
| Resize Image | `/resize-image` | Available |
| Rotate & Flip Image | `/rotate-flip-image` | Available |
| Screenshot Beautifier | `/screenshot-beautifier` | Available |
| SVG to AVIF | `/svg-to-avif` | Available |
| SVG to JPG | `/svg-to-jpg` | Available |
| SVG to PNG | `/svg-to-png` | Available |
| SVG to WebP | `/svg-to-webp` | Available |
| TIFF to AVIF | `/tiff-to-avif` | Available |
| TIFF to JPG | `/tiff-to-jpg` | Available |
| TIFF to PNG | `/tiff-to-png` | Available |
| TIFF to WebP | `/tiff-to-webp` | Available |
| Watermark Image | `/watermark-image` | Available |
| WebP to AVIF | `/webp-to-avif` | Available |
| WebP to BMP | `/webp-to-bmp` | Available |
| WebP to GIF | `/webp-to-gif` | Available |
| WebP to JPG | `/webp-to-jpg` | Available |
| WebP to PNG | `/webp-to-png` | Available |
| WebP to TIFF | `/webp-to-tiff` | Available |

### Video Tools — `/video` — 6 tools

| Tool | URL | Status |
| --- | --- | --- |
| Compress Video | `/compress-video` | Available |
| Convert Video | `/convert-video` | Available |
| GIF Maker | `/gif-maker` | Available |
| Resize & Crop Video | `/resize-crop-video` | Available |
| Screen & Camera Recorder | `/screen-recorder` | Available |
| Trim & Cut Video | `/trim-cut-video` | Available |

### Audio Tools — `/audio` — 10 tools

| Tool | URL | Status |
| --- | --- | --- |
| Audio Metadata Editor | `/audio-metadata-editor` | Available |
| Audio Speed & Pitch Changer | `/audio-speed-pitch` | Available |
| Audio Compressor | `/compress-audio` | Available |
| Audio Converter | `/convert-audio` | Available |
| Audio Merger & Joiner | `/merge-audio` | Available |
| Reverse Audio | `/reverse-audio` | Available |
| Audio Trimmer & Cutter | `/trim-audio` | Available |
| Video to Audio | `/video-to-audio` | Available |
| Voice Recorder | `/voice-recorder` | Available |
| Volume Booster & Normalizer | `/volume-booster` | Available |

### Text Tools — `/text` — 13 tools

| Tool | URL | Status |
| --- | --- | --- |
| Case Converter | `/case-converter` | Available |
| Find Duplicates | `/duplicate-lines` | Available |
| Find & Replace | `/find-replace` | Available |
| Line Editor | `/line-editor` | Available |
| Markdown Formatter & Preview | `/markdown-formatter` | Available |
| Slug Generator | `/slug-generator` | Available |
| Text Statistics | `/text-analyzer` | Available |
| Text Cleaner | `/text-cleaner` | Available |
| Text Diff Checker | `/text-diff` | Available |
| Text Reverser | `/text-reverser` | Available |
| Sort & Shuffle Text | `/text-sorter` | Available |
| Text Splitter & Joiner | `/text-splitter` | Available |
| Word & Character Counter | `/word-counter` | Available |

### Developer Tools — `/developer` — 18 tools

| Tool | URL | Status |
| --- | --- | --- |
| Base64 Encoder & Decoder | `/base64-converter` | Available |
| Code Diff Checker | `/code-diff` | Available |
| Code Formatter & Beautifier | `/code-formatter` | Available |
| Code Minifier | `/code-minifier` | Available |
| CSV Viewer & Converter | `/csv-viewer` | Available |
| Hash Generator | `/hash-generator` | Available |
| HTML Tools | `/html-tools` | Available |
| HTTP Status Code Lookup | `/http-status-codes` | Available |
| JSON Formatter & Validator | `/json-formatter` | Available |
| JSON, YAML & XML Converter | `/json-yaml-xml-converter` | Available |
| JWT Decoder | `/jwt-decoder` | Available |
| Lorem Ipsum Generator | `/lorem-ipsum` | Available |
| MIME Type Lookup | `/mime-type-lookup` | Available |
| Random Data Generator | `/random-data-generator` | Available |
| URL Encoder & Decoder | `/url-encoder-decoder` | Available |
| URL Parser | `/url-parser` | Available |
| URL Query String Tool | `/url-query-string` | Available |
| UUID Generator | `/uuid-generator` | Available |

### Converters — `/converters` — 7 tools

| Tool | URL | Status |
| --- | --- | --- |
| Currency Converter | `/currency-converter` | Planned |
| Data Converter | `/data-converter` | Planned |
| Length Converter | `/length-converter` | Planned |
| Temperature Converter | `/temperature-converter` | Planned |
| Time Converter | `/time-converter` | Planned |
| Unit Converter | `/unit-converter` | Planned |
| Weight Converter | `/weight-converter` | Planned |

### Utilities — `/utilities` — 4 tools

| Tool | URL | Status |
| --- | --- | --- |
| QR Generator | `/qr-generator` | Available |
| Random Generator | `/random-generator` | Planned |
| Stopwatch | `/stopwatch` | Available |
| Timer | `/timer` | Available |

### AI Tools — `/ai` — 2 tools

| Tool | URL | Status |
| --- | --- | --- |
| Gemini Video Watermark Remover | `/gemini-video-watermark-remover` | Available |
| Gemini Watermark Remover | `/gemini-watermark-remover` | Available |

### Math Tools — `/math` — 6 tools

| Tool | URL | Status |
| --- | --- | --- |
| 3D Graphing Calculator | `/3d-graphing-calculator` | Available |
| Basic Calculator | `/calculator` | Available |
| Graphing Calculator | `/graphing-calculator` | Available |
| Matrix Calculator | `/matrix-calculator` | Available |
| Programmer Calculator | `/programmer-calculator` | Available |
| Scientific Calculator | `/scientific-calculator` | Available |

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

## See also

Full doc index: [AGENTS.md](../AGENTS.md#docs). How to add a tool or category:
[architecture.md](architecture.md). SEO and URL rules in more depth: [seo.md](seo.md).
