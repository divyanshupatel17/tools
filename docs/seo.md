# SEO

## URLs

```
/                         home, every category
/all                      every tool, grouped by category
/pdf                      category
/merge-pdf                tool — flat, no /pdf/ segment
```

Lowercase, kebab-case, short, readable, keyword-focused. Never `?tool=merge`,
`/merge_pdf_tool`, `/pdf/merge-pdf`, or a `/beta` path. A live slug is permanent —
renaming loses rankings and breaks inbound links.

Tool URLs are flat by design: `toolPath()` in `lib/tools/registry.ts` returns `/${tool.slug}`,
never `/${category}/${slug}`. That means every tool slug across every category must be
globally unique, and none may match a category slug — enforced at registry load time (see
`docs/architecture.md` and `docs/tools.md`).

One tool, one URL. If two categories both want a tool, pick the stronger intent and link from
the other rather than shipping a duplicate page.

## Metadata

`lib/seo/metadata.ts` builds every page's metadata:

- `rootMetadata` sets `metadataBase`, the title template `` %s | ${SITE_NAME} `` (currently
  `%s | ToolHub`), the default description and site-wide Open Graph and Twitter defaults.
- `buildMetadata({ title, description, path, keywords })` is used by category and tool pages.

Tool copy comes from the registry's `seo` field, which falls back to the tool name and
description. Write for the tool's actual intent — a person searching "merge pdf" wants to merge
a PDF. No keyword stuffing, no repeated phrases.

## Per-tool checklist

When adding or reviewing a tool, confirm all of this before calling it done:

- [ ] `seo.title` reads like a real search query, not the registry `name` restated with a
      suffix bolted on — override it if the default is awkward.
- [ ] `seo.description` is one to two sentences: what the tool does, plus one concrete detail
      (a format list, a limit, a real capability) — never generic marketing copy.
- [ ] `seo.keywords` covers the real alternate phrasings people search (e.g. Word Counter also
      covers "character counter", "word count tool") — only phrasings the tool actually serves.
- [ ] The H1 on the tool page (the registry `name`) and the page `<title>` are not identical
      walls of the same words — `buildMetadata` already varies them via the title template, so
      this is usually automatic; check it stays true after any registry edit.
- [ ] No hyphens or dashes anywhere in user-facing copy (headings, hints, labels, SEO title and
      description) — this is a sitewide rule, not SEO-specific, and search snippets are still
      user-facing.

## Canonical URLs

Every page sets `alternates.canonical` to its absolute URL via `absoluteUrl()`, which combines
`SITE_ORIGIN` and `SITE_BASE_PATH`. `SITE_BASE_PATH` in `lib/seo/site.ts` must stay in sync
with `basePath` in `next.config.ts` (currently `''` — the app is served at the root of
`toolhub.divyanshupatel.com`).

## Sitemap and robots

`app/sitemap.ts` generates `/sitemap.xml` from the registry — home, `/all`, every category in
`lib/tools/categories.ts`, and every tool at its flat URL. Priorities: home 1.0, `/all` 0.9,
categories 0.8, popular tools 0.7, the rest 0.6. Adding a registry entry adds a sitemap entry
automatically.

`app/robots.ts` allows everything and points at the sitemap.

No redirects exist for the old `/{category}/{slug}` shape. If a live URL ever needs to
change after launch, add registry-generated redirects in `next.config.ts` at that time rather
than by default.

## Structured data

`lib/seo/structured_data.ts` emits JSON-LD: `WebSite` in the root layout, `BreadcrumbList` on
category and tool pages, and `SoftwareApplication` on tool pages.

## Indexing

All pages are statically prerendered and indexable. Unknown tool slugs return a real 404
(`dynamicParams = false`) rather than a soft 404, so nothing thin gets indexed.

## Device and responsiveness checklist

Every tool ships only once it holds up here, not just in a desktop browser at default zoom:

- [ ] Layout works at 360px wide (small phone) up through a 4K desktop, with no horizontal
      scroll on the page body itself.
- [ ] The control panel aside collapses above the workspace on narrow viewports rather than
      overflowing or getting clipped (`lg:sticky lg:top-20` pattern, see `AGENTS.md`).
- [ ] Touch targets (buttons, drag handles, sliders) are usable with a finger, not just a mouse
      pointer, on an actual phone or a touch emulator — not just a resized desktop window.
- [ ] File upload works via the OS file picker and via drag-and-drop where the platform
      supports it; camera capture (Scan to PDF, Voice Recorder, Screen Recorder) is tested on a
      real mobile browser, not assumed from desktop behaviour.
- [ ] Heavy processing (FFmpeg, OCR, large PDFs) is tested on a mid-range device or a throttled
      CPU profile, not only a fast development machine, since a worker or WASM path that hangs
      silently reads as a broken tool.
- [ ] Light, dark and system theme all render correctly — no hardcoded hex colors bypassing the
      CSS variables in `styles/globals.css`.

## See also

Full doc index: [AGENTS.md](../AGENTS.md#docs). URL and naming rules for every tool:
[tools.md](tools.md).
