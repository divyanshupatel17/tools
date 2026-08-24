# AGENTS.md

Rules for ToolHub. This file is the short version; `docs/` holds the full detail behind almost every rule below —
check it before assuming, especially `docs/architecture.md` and `docs/tools.md`.

## Architecture

- Browser-first. No backend, database, auth, or queue. Do not add one "for architecture".
- `apps/web` is the only deployable. `packages/*` hold code shared beyond the app.
- Deployed at the root of `toolhub.divyanshupatel.com` via `basePath: ''` — routes and their
  real URLs are identical, no prefix. **Tool URLs are flat**: `app/[tool_slug]/page.tsx` serves
  every tool at `/{slug}` (e.g. `/merge-pdf`), never `/{category}/{slug}`. Category pages stay
  at `/{category}` (`app/pdf/page.tsx` → `/pdf`). Full details and the full URL table:
  `docs/architecture.md`, `docs/tools.md`.
- `SITE_BASE_PATH` in `lib/seo/site.ts` must match `basePath` in `next.config.ts` — the one
  place to change if the app is ever hosted under a path prefix or a different domain again.
  Never hardcode a domain, path prefix, or site name literal elsewhere; use `SITE_NAME`,
  `SITE_URL`, `absoluteUrl()` or `assetPath()` from `lib/seo/site.ts` / `lib/utils/asset_path.ts`.
- Full folder/file structure, the registry data shape and the tool doc set: `docs/architecture.md`.

## Naming

- Files and folders: `snake_case`. Framework names (`page.tsx`, `[tool_slug]`) are exempt.
- URL slugs: lowercase kebab case, short, keyword focused, stable. Never rename a live slug.
  Every slug is globally unique across all categories and distinct from every category slug —
  the registry throws at load time if not; check `docs/tools.md` before picking one.
- Registry fields use `snake_case`; React props and components stay idiomatic.

## Tool registry

- `lib/tools/registry.ts` is the single source of truth. Homepage, category pages, nav,
  search, sitemap and related tools all derive from it. Never hardcode a tool list.
- Adding a tool = one registry entry plus a processor plus a workspace UI plus a checklist
  update in that category's `docs/{category}_tools.md`. Adding a whole new category also means
  creating that doc file first. Full steps: `docs/architecture.md`.
- `status: 'available'` only once a processor is registered and its UI exists. Until then the
  page shows "Coming soon". Never fake a successful result.
- Every tool's SEO title, description and keywords, plus the device/responsiveness checklist a
  tool must pass before shipping, live in `docs/seo.md`.

## Processing

- Files are processed in the browser. Nothing is uploaded.
- Heavy libraries (pdf-lib, PDF.js, FFmpeg, WASM) load lazily through
  `lib/processing/processor_registry.ts`. Never import them at module top level in shared code
  that isn't already behind a lazy processor boundary.
- Anything CPU heavy runs in a Web Worker (`apps/web/workers/`).
- Validate type and size with `@tools/file_utils` before processing. Treat file names as
  untrusted.

## Components and design

- Reuse `components/layout`, `tool_card`, `file_upload`, `tool_workspace` before writing new
  ones. Do not build one off variants per tool.
- Server Components by default; add `'use client'` only where interaction requires it.
- Colours come from CSS variables in `styles/globals.css`. Never hardcode a hex in a component.
  Light, dark and system themes must all work.
- No hyphens or dashes in any user facing text (headings, hints, labels, placeholders). Rewrite
  the sentence instead of punctuating around it. Code comments are exempt.

## Workspace layout

- Every processing workspace puts the visual, the file, its pages, a live preview, on the
  left, and the control panel (options, action button, result) on the right, in a sticky
  `lg:sticky lg:top-20` aside. If the left side can overflow it scrolls; the page itself does
  not grow without bound.
- When a tool's output depends on a setting a user tunes by eye (page numbers, watermarks,
  crop, stamps, form fields), the left side renders a live preview of the effect and re renders
  on every option change. Never make the user download and check to see what they picked.
- Every document view, source or result, offers both a view action (opens
  `components/pdf/page_detail_modal.tsx`) and a download action wherever a result exists.
  The modal handles both PDF pages and plain images. It renders the entire document as a
  scrollable popup, freshly re-rasterised rather than upscaled, pre-scrolled to the page
  clicked. A page that fails to render shows its own inline notice; it never fails the whole
  popup. Page grid tools additionally share `components/pdf/page_grid.tsx`; dragging there is
  reserved for reorder only.
- Control panel copy stays short: the label plus at most one or two short bullets for a real
  caveat the user needs before clicking. Never a paragraph of engineering explanation, never
  private implementation detail.
- A category with declared sections (`lib/tools/sections.ts`) lists its related tools as a
  plain, title only list grouped by section (`components/tool_card/related_tools_list.tsx`),
  not the full card grid. Categories without sections keep the card grid.

## Text tools

- Every Text tool's main content — the toolbar plus its textarea column(s) — sits inside one
  `border-border bg-surface rounded-2xl border p-4` card, exactly like the sticky aside beside
  it. Never let the toolbar and textareas sit bare against the page background while the aside
  is a card; that reads as two different tools bolted together.
- Every `components/ui/textarea.tsx` in a Text tool keeps its native vertical resize handle
  (the component's own `resize-y`). Never wrap it in a `flex flex-col` parent with `flex-1`/
  `flex-grow` on the textarea itself to force two columns to match height — a flex-basis-0 grow
  item overrides whatever height the resize handle sets, so the drag silently does nothing.
  Give each panel a plain block wrapper and a `min-h-[...]` on the textarea instead (see Case
  Converter or Word Counter); columns are allowed to end up different heights once a user drags
  one taller.
- `components/text/text_toolbar.tsx`'s expand button always opens a two pane fullscreen editor:
  the editable input on the left, and that tool's own result — `expandedOutput`, whatever shape
  it takes (a read only textarea, a stat grid, a frequency table) — on the right. Never let
  expanding show the input alone; a person who expands to work more comfortably still needs to
  see what their input produced. Pass `expandedOutput` (and `expandedOutputLabel`) to every
  `TextToolbar`/`TextInputPanel` call; the single pane fallback exists only for a tool with
  truly no derived result.

## Form inputs

- A number input must let the user clear it and retype while still focused. Never force a
  fallback value (e.g. `Number(e.target.value) || 1`) inside `onChange`, since that fights
  backspace. Keep the field's own text in local state, accept the empty string while typing,
  and only clamp to `min`/`max` on blur. Use `components/ui/number_field.tsx` instead of a raw
  `<input type="number">`.
- Any field a person would reasonably type a fraction into — a target file size foremost, since
  "1.5 MB" or "55.5 KB" are completely ordinary targets — passes `allowDecimal` to
  `NumberField`. Without it the field silently rejects the decimal point, which reads as broken,
  not as a deliberate whole-number-only field. A size field that also offers a KB/MB/GB unit
  picker needs `allowDecimal` regardless of which unit is selected, not just the smallest one.

## Landing page and artwork

- The landing page lives in `components/landing/*` and is composed by `app/page.tsx`. Nothing
  else may import from it; other routes use `category_page` / `tool_page`.
- Illustrations are pre sized WebP in `public/images/`, rendered through
  `components/ui/art.tsx`. Pixel art stays PNG in `public/game/`. No duplicate formats.
- Decorative doodles are first party single path SVGs in `public/doodles/`. Never pull in a
  third party doodle pack; document the gap in `docs/missing-assets.md` instead.
- Mascots are static images. No cursor tracking, no idle animation, no emoji.
- The footer is one continuous painted surface. No boxed cards, no dividers inside it.

## SEO, accessibility, testing

- Every page sets a title, description and canonical URL through `lib/seo/metadata.ts`.
  Sitemap entries come from the registry. Copy is natural, no keyword stuffing.
- Semantic HTML, keyboard reachable, visible focus, labelled controls, adequate contrast.
- Vitest for the registry and pure utilities; Playwright for critical routes. Add tests with
  behaviour, not in bulk. No placeholder tests.

## Dead code

- Before deleting a file as unused, grep for every export it has, not just the file's own
  name, and check `.tsx` consumers too. A file can be "unreferenced by name" and still be the
  only implementation behind a widely imported function.

## Git

- Branches: `feat/*`, `fix/*`, `claude/*`, `codex/*`, `chore/*`, `refactor/*`, `docs/*`.
  `main` is production; always branch from an updated `main`. Full branching, PR and commit
  flow with a diagram: `docs/git_workflow.md`.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `perf:`.
- Never commit `.env`, secrets, build output, `node_modules`, or anything in `.local/`.
- Never commit changes on your own. Only commit when explicitly asked. When asked, give the
  commit message in short, following conventional commit tags (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`, `test:`, `perf:`).

## Comments

Comment only non obvious behaviour, browser limitations, architectural constraints, or tricky
algorithms. One or two short lines. Never restate what the code plainly says.

## Docs

Every doc below is the source of truth for its own topic; this file is only the short version.

| File | What it holds |
| --- | --- |
| `docs/architecture.md` | Repo shape, routing, the registry, browser-first processing, and the full "adding a tool" / "adding a category" steps. |
| `docs/tools.md` | Naming rules, the full URL table for every tool and category, and the slug uniqueness rule. |
| `docs/{category}_tools.md` | One per category (`pdf`, `image`, `video`, `audio`, `text`, `developer`, `converters`, `utilities`, `ai`, `math`) — a checklist plus a feature table per tool. Update this whenever a tool's status or feature set changes. |
| `docs/seo.md` | Metadata, SEO checklist per tool, and the device/responsiveness checklist a tool must pass before shipping. |
| `docs/git_workflow.md` | Branch prefixes, commit conventions, and the full branch to PR to merge flow with a diagram. |
| `docs/deployment.md` | How and where the site deploys. |
| `docs/privacy.md`, `docs/terms.md` | The copy behind the live Privacy/Terms pages. |
| [`README.md`](README.md) | Project overview, tech stack, local setup, and where everything lives. Start here. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to propose a change: branching, checks, and the new tool checklist, condensed. |
| [`SECURITY.md`](SECURITY.md) | How to report a vulnerability privately. |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable changes per release. |
