# Architecture

## Shape

A pnpm workspace with one deployable app and four small shared packages. There is no backend,
database, or authentication, and none should be added unless a tool genuinely cannot work
without it.

```
apps/web        Next.js App Router app — the only deployable
packages/ui           cn() and shared primitives
packages/tool_engine  the ToolProcessor contract
packages/file_utils   file validation, size formatting, safe names
packages/config       shared tsconfig base
```

## Routing and basePath

The app is served at `divyanshupatel.com/tools`. `next.config.ts` sets `basePath: '/tools'`,
so routes are authored without the prefix:

| File | URL |
| --- | --- |
| `app/page.tsx` | `/tools` |
| `app/all/page.tsx` | `/tools/all` |
| `app/pdf/page.tsx` | `/tools/pdf` |
| `app/[tool_slug]/page.tsx` | `/tools/merge-pdf` |

`SITE_BASE_PATH` in `lib/seo/site.ts` mirrors this and must be changed alongside it.

Tool URLs are flat: **`/tools/{slug}`, never `/tools/{category}/{slug}`.** One dynamic route,
`app/[tool_slug]/page.tsx`, resolves any tool by slug alone via `getToolBySlug()` and derives
its category from the tool it finds; there is no per-category tool route. Category pages
(`app/pdf/page.tsx` and its 8 siblings) are still one thin wrapper per category over
`CategoryPage` in `components/layout/` — adding a category means adding a registry category
plus one such wrapper, no page logic duplicated.

Because tool URLs are flat, every tool slug shares one namespace with every other tool slug
*and* with the 9 category slugs. `registry.ts` throws at module load if any two collide — see
`docs/tools.md` for the full URL table and the naming rule this enforces.

## The registry

`lib/tools/registry.ts` holds every tool as data: slug, category, name, description, icon,
processor id, input and output types, `client_only`, `worker_required`, `multiple_files`,
`popular`, `status`, and SEO copy.

Everything derives from it — the homepage, category listings, navigation, search, related
tools, `generateStaticParams`, and the sitemap. Nothing else may hold a tool list.

`lib/tools/categories.ts` holds the 10 categories. `lib/tools/tool_types.ts` holds the types
and re-exports the processor contract from `@tools/tool_engine`.

## Browser-first processing

Files never leave the device. A tool is implemented as a `ToolProcessor`:

```ts
(input: ProcessorInput, context: ProcessorContext) => Promise<ProcessorOutput>;
```

`lib/processing/processor_registry.ts` maps a processor id to a **dynamic import**. Heavy
dependencies — pdf-lib, PDF.js, FFmpeg, WASM — must only ever be reachable through that lazy
import, so the homepage never pays for them. CPU-heavy work belongs in a Web Worker under
`apps/web/workers/`.

`lib/browser/capabilities.ts` reports what the current browser supports (workers, WASM,
`SharedArrayBuffer`, OffscreenCanvas) so a tool can degrade rather than fail.

## Rendering

Everything is statically prerendered. Client components are limited to the pieces that need
interaction: search, theme toggle, mascot, and file handling.

## Adding a tool

Six steps. Nothing else should need to change: navigation, search, the sitemap and related
tools all read the registry.

`pdf/merge_pdf` is the reference implementation. Copy its shape.

### 1. Registry entry

In `apps/web/lib/tools/registry.ts`, add a draft to the right category array:

```ts
{
  slug: 'merge-pdf',
  section: 'organize', // required in a category that declares sections; see lib/tools/sections.ts
  name: 'Merge PDF',
  description: 'Combine several PDF files into one document and reorder the pages before saving.',
  icon: 'Combine',
  input_types: ['pdf'],
  output_types: ['pdf'],
  multiple_files: true,
  popular: true,
}
```

Defaults are filled in by `define()`: `processor` becomes `<category>.<slug>`, `client_only` is
`true`, `status` is `'planned'`, and SEO copy falls back to the name and description.

Pick a slug that does not already appear anywhere in `docs/tools.md` — every tool slug is
globally unique across every category and must not match a category slug either (see
Routing above). The registry throws at load time if it does, but checking first saves the
round trip.

Listings show the name only, so it has to say what the tool is on its own; the description is
what appears on a long hover and to screen readers.

If `icon` names a lucide icon that is not yet in `components/ui/tool_icon.tsx`, add it to the
named imports and the `ICONS` map there. Do not import lucide's `icons` barrel.

### 2. Processor

Implement the `ToolProcessor` contract in `apps/web/features/<category>/<slug>/processor.ts`:

```ts
import type { ToolProcessor } from '@tools/tool_engine';

const mergePdf: ToolProcessor = async ({ files }, { signal, on_progress }) => {
  const { PDFDocument } = await import('pdf-lib'); // lazy — never a top-level import
  // ...
  return { artifacts: [{ file_name: 'merged.pdf', mime_type: 'application/pdf', blob }] };
};

export default mergePdf;
```

Rules: validate input with `@tools/file_utils` first, honour `signal`, report progress, and put
anything CPU-heavy in a Web Worker under `apps/web/workers/`.

### 3. Register the loader

In `apps/web/lib/processing/processor_registry.ts`:

```ts
export const PROCESSORS: Record<string, ProcessorLoader> = {
  'pdf.merge-pdf': () => import('@/features/pdf/merge_pdf/processor'),
};
```

Keep it a dynamic import. A static import here pulls the library into every page's bundle.

### 4. Workspace UI

Build the client UI in `apps/web/features/<category>/<slug>/workspace.tsx`, composing the
existing pieces (`FileUpload`, `Button`, `downloadBlob`) before writing anything new. Then
register it in two places:

```ts
// lib/processing/workspace_ids.ts — importless, so Server Components can ask the question
export const WORKSPACE_IDS = ['pdf.merge-pdf'] as const;

// components/tool_workspace/tool_ui.tsx — the lazy client import
'pdf.merge-pdf': dynamic(() => import('@/features/pdf/merge_pdf/workspace').then((m) => m.MergePdfWorkspace)),
```

Finally set `status: 'available'` in the registry. `ToolWorkspace` only drops the "Coming
soon" state once the tool has both a processor and a workspace, and a unit test enforces it.

### 5. Tests and SEO

- Add a Vitest case for the processor's real behaviour in `apps/web/tests/unit/`.
- Add a Playwright case only if the tool introduces a new critical flow.
- Override `seo.title` / `seo.description` in the registry if the defaults read awkwardly.
  Write for the tool's actual intent; do not stuff keywords. See `docs/seo.md`.

The sitemap, canonical URL and structured data are generated for you.

### 6. Update the category doc

Every category has one planning/state doc — `docs/{category}_tools.md` — with a checklist at
the top (`- [x] Tool Name — \`slug\`` for built, `- [ ]` for not yet built) followed by one
section per declared section, one subsection per tool, in a feature/details table. Flip the new
tool's checklist entry to `[x]` and add or update its subsection in the same doc. See any
existing `{category}_tools.md` for the shape to copy.

## Adding a category

Adding a whole new category (not just a tool inside an existing one) is the same six steps,
plus two things done first:

1. Add the category to `lib/tools/categories.ts` (id, name, slug, tagline, description, icon,
   SEO). The id becomes the category's route segment.
2. Create `docs/{category}_tools.md` up front, even with every tool still unbuilt — see
   `converters_tools.md` or `utilities_tools.md` for what an all-planned category doc looks
   like. Do not add tools to `registry.ts` for a category that has no doc yet.

Then add the category's tools via the six steps above, add `app/{category}/page.tsx` (the
one-line `CategoryPage` wrapper — no `[tool_slug]` route needed, the flat `app/[tool_slug]/
page.tsx` covers every category already), and add a row for the category to the table in
`docs/tools.md`.
