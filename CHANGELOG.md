# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-08-25

Initial release.

### Highlights

- **160+ browser only tools** across PDF, image, video, audio, text, developer, converter,
  utility, AI and math categories — see [docs/tools.md](docs/tools.md) for the full list.
- **No uploads.** Every tool processes files locally using the File API, Canvas, Web Workers
  and WebAssembly. Nothing is sent to a server. See [docs/privacy.md](docs/privacy.md).
- **One tool registry** (`apps/web/lib/tools/registry.ts`) drives the homepage, category
  pages, navigation, search and sitemap.
- **Hand painted landing page** with mascots, doodles and a playable dino runner in the
  footer, light/dark/system themes including a true AMOLED dark mode.
- **Universal search overlay** reachable from any page, matching tool name, description and
  keywords.
- **SEO complete**: per tool title/description/keywords, canonical URLs, Open Graph and
  Twitter share images, structured data and a registry driven sitemap.
- Free, no account, no paywall, no tracking.

See `git log` for the detailed commit history leading up to this release.
