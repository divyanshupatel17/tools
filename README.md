# divyanshupatel.com/tools

Free online tools that run entirely in your browser — PDF, image, video, audio, text,
developer, converter and utility tools. No upload, no account, no tracking of your files.

## Features

- **Browser-first** — files are processed locally; nothing is sent to a server
- **Free** — no account, no paywall
- **Privacy-focused** — your files never leave your device
- **Scalable tool architecture** — every page is driven by one registry
- **Responsive** — works on phone, tablet and desktop
- **Hand-painted landing page** — watercolour paper world with mascots, doodles and a
  playable dino runner built into the footer

## Tech stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · pnpm workspaces ·
ESLint · Prettier · Vitest · Playwright · GitHub Actions · Vercel

No backend, database, or authentication.

## URL structure

```
/tools                        landing page
/tools/all                    every tool, grouped by category
/tools/pdf                    a category
/tools/merge-pdf              a tool — flat, no /pdf/ segment
```

Categories: `pdf`, `image`, `video`, `audio`, `text`, `developer`, `converters`, `utilities`,
`ai`. Every tool URL is flat (`/tools/{slug}`, not `/tools/{category}/{slug}`); the app is
served under `/tools` via `basePath`, so routes are authored without that prefix
(`app/[tool_slug]/page.tsx` → `/tools/merge-pdf`). Full table of every tool's URL:
[docs/tools.md](docs/tools.md).

## Repository structure

```
apps/web/          the Next.js app
  app/             routes: home, /all, one page.tsx per category, one flat [tool_slug] route
  components/      landing, layout, navigation, search, tool UI, theme, primitives
  features/        per-category tool implementations (processor.ts + workspace.tsx each)
  lib/             tools registry, landing data, lazy processing, browser, seo, utils
  public/          images (WebP illustrations), game (pixel art), doodles (SVG)
  workers/         Web Workers for heavy processing
packages/          ui, tool_engine, file_utils, config
docs/              architecture, tools, one {category}_tools.md per category, SEO, deployment,
                   privacy, terms — see docs/architecture.md for what goes where
design/            design sources
.local/            untracked scratch
```

Adding a tool touches exactly 4 places: a registry entry, a processor, a workspace UI, and a
checklist line in that category's `docs/{category}_tools.md`. Full steps, and how to add a
whole new category: [docs/architecture.md](docs/architecture.md).

## Local setup

```bash
pnpm install
pnpm dev            # http://localhost:3000/tools
```

Requires Node 20+ and pnpm 11+. No environment variables are needed.

## Commands

```bash
pnpm dev            # dev server
pnpm build          # production build
pnpm lint           # eslint
pnpm typecheck      # tsc across the workspace
pnpm test           # vitest unit tests
pnpm test:e2e       # playwright smoke tests (needs a build first)
pnpm format         # prettier
```

## Adding a tool

1. Add an entry to `apps/web/lib/tools/registry.ts`
2. Implement the processor in `apps/web/features/<category>/`
3. Register it in `apps/web/lib/processing/processor_registry.ts`
4. Build the workspace UI and flip `status` to `available`
5. Update that category's checklist in `docs/{category}_tools.md`

Full walkthrough: [docs/architecture.md](docs/architecture.md).

## Git workflow

Branch (`feature/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*`) → push → Vercel preview →
pull request → CI (lint, typecheck, test, build) → merge to `main` → production.

Commits follow conventional prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
`test:`, `perf:`.

## Deployment

Vercel, with the Git integration handling deploys. `main` is production; every other branch
gets a preview URL. Details in [docs/deployment.md](docs/deployment.md).

## Privacy

Files are processed in your browser and never uploaded. If a tool ever needs a server, that
will be stated on the tool itself. See [docs/privacy.md](docs/privacy.md) and
[docs/terms.md](docs/terms.md).

## License

MIT — see [LICENSE](LICENSE).
