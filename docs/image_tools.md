# Image tools: state

Single source of truth for what the Image category contains. Registry entries live in
`apps/web/lib/tools/registry.ts`; section headers in `apps/web/lib/tools/sections.ts`.

Everything runs in the browser. Nothing is uploaded. All tools below are `status: 'available'`.

64 registry entries total: 14 hand built tools plus 50 one way format conversion pages (JPG to
PNG, PNG to WebP, and so on) that all share one implementation. See `conversion()` in
`registry.ts`.

## Checklist

- [x] Compress Image — `compress-image`
- [x] Resize Image — `resize-image`
- [x] Crop Image — `crop-image`
- [x] Rotate & Flip Image — `rotate-flip-image`
- [x] Convert Image — `convert-image`
- [x] 50 format pair pages (`jpg-to-png`, `heic-to-jpg`, and so on) — full list in `docs/tools.md`
- [x] Image Editor — `image-editor`
- [x] Watermark Image — `watermark-image`
- [x] Meme Generator — `meme-generator`
- [x] Collage Maker — `collage-maker`
- [x] Screenshot Beautifier — `screenshot-beautifier`
- [x] Blur & Pixelate Image — `blur-pixelate`
- [x] Image Metadata — `image-metadata`
- [x] Image to Text — `image-to-text`
- [x] Color Extractor — `color-extractor`

## Optimize Image

| Tool | Slug | Notes |
| --- | --- | --- |
| Compress Image | `compress-image` | Quality slider or a target file size in KB (decimals like 55.5 KB); batch, before and after per file. |
| Resize Image | `resize-image` | Exact pixels or percentage, aspect ratio lock, whole batch at once. |
| Crop Image | `crop-image` | Freeform, exact dimensions, fixed ratio, or a circle. |
| Rotate & Flip Image | `rotate-flip-image` | 90/180/270 or a custom angle; mirror horizontal or vertical; batch. |

## Convert Image

| Tool | Slug | Notes |
| --- | --- | --- |
| Convert Image | `convert-image` | Any supported format to JPG, PNG, WebP or AVIF, one at a time or in a batch. |
| Format pair pages | e.g. `jpg-to-png`, `heic-to-jpg` | 50 SEO landing pages, one per format pair, all running Convert Image with the output preset. Readable formats: JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, HEIC, SVG, ICO. |

## Edit & Create

| Tool | Slug | Notes |
| --- | --- | --- |
| Image Editor | `image-editor` | Text, shapes, drawing, overlays, brightness, contrast, saturation, blur, border, background. |
| Watermark Image | `watermark-image` | Text or logo; position, opacity, rotation, scale, tiling; batch. |
| Meme Generator | `meme-generator` | Top and bottom captions, or freeform text boxes. |
| Collage Maker | `collage-maker` | Grid layouts, spacing, border, background, overall shape. |
| Screenshot Beautifier | `screenshot-beautifier` | Background, padding, rounded corners, shadow, window frame. |

## Privacy & Analysis

| Tool | Slug | Notes |
| --- | --- | --- |
| Blur & Pixelate Image | `blur-pixelate` | Box select faces, names or numbers; blur, pixelate or soften the whole picture. |
| Image Metadata | `image-metadata` | Reads EXIF, camera, date, GPS, colour profile; exports a copy with it stripped. |

## Extract

| Tool | Slug | Notes |
| --- | --- | --- |
| Image to Text | `image-to-text` | OCR in the browser (Tesseract.js); copy or download as text/markdown. |
| Color Extractor | `color-extractor` | Dominant colour palette, or click to sample one pixel; HEX/RGB/HSL. |

## Cross links

Images to PDF and PDF to Images live under `/pdf` only (`jpg-to-pdf`, `pdf-to-jpg`), to avoid a
second page competing with the real one in search. The Image Tools page links to them via
`CATEGORY_CROSS_LINKS` in `lib/tools/sections.ts`.

## Shared code

Processing lives in `apps/web/lib/image/` (`decode.ts`, `encode.ts`, `canvas.ts`, `batch.ts`,
`perspective.ts`, `metadata.ts`, `palette.ts`); workspace UI in `apps/web/components/image/`
(`ImageWorkspaceLayout`, `ImageCanvasPreview`, `ControlPanel` and friends). Read those files
before writing a new image tool — the batch grid pattern, HEIC/TIFF preview handling and the
live preview scaling rule are enforced there, not repeated per tool.
