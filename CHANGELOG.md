# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/).

History before this file was added is in `git log`, not backfilled here.

## [Unreleased]

### Added
- `seo.keywords` on all 168 tool entries (117 hand-written, 50 image format conversions via a
  shared generator), including size-targeted SEO copy ("compress to 100KB", "compress to 1MB",
  etc.) for every compress tool (`compress-image`, `compress-pdf`, `compress-video`,
  `compress-audio`).
- Site-wide Open Graph / Twitter share image (`app/opengraph-image.tsx`, `app/twitter-image.tsx`).
- Universal search overlay (`components/search/search_overlay.tsx`): clicking the navbar search
  icon or the homepage search bar now opens one lifted, focus-trapped search surface above a
  dimmed and blurred page, from any route, closing on Escape, backdrop click or navigation.
- `SECURITY.md` and this changelog.

### Changed
- On-site search now matches a tool's `seo.keywords`, not just its name/slug/description.
- Popular Tools row reordered to: Gemini Watermark Remover, Image Compressor, Compress PDF,
  Merge PDF, QR Generator, Image Resizer.
- Renamed the "Compress Image" and "Resize Image" tools to "Image Compressor" and "Image
  Resizer" (display name only; slugs unchanged).
- Related tools on every tool page now render as a column, name-only list (no icons), including
  categories that don't declare named sections (`converters`, `utilities`, `ai`, `math`).
- Dark theme surfaces (`--paper`, `--surface`, `--cream`, footer) flattened to pure `#000000`
  for true AMOLED black; cards now separate from the page by `--border` alone.
- Homepage hero search bar is now a trigger for the universal search overlay rather than its
  own separate inline search.
- Structured data (`toolJsonLd`): `@type` changed from `SoftwareApplication` to `WebApplication`,
  and `applicationCategory` now maps each category to a real schema.org value (e.g.
  `UtilitiesApplication`) instead of the free-text category display name.
- Sitemap now excludes `status: 'planned'` "Coming soon" tools; those pages also now serve
  `noindex, follow` instead of being silently indexable.

### Fixed
- Site header overflowed horizontally on every single page at exactly the 768px tablet
  breakpoint, pushing the theme toggle off-screen — the desktop nav switched on at `md` (768px)
  without enough room for logo + nav + search + theme toggle in one row. Moved the breakpoint
  to `lg` (1024px).
- 5 `seo.title`/`seo.description` entries exceeded recommended search-result length; trimmed.
