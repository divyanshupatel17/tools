# ToolHub

Free online tools that run entirely in your browser — PDF, image, video, audio, text,
developer, converter and utility tools. No upload, no account, no tracking of your files.
Live at [toolhub.divyanshupatel.com](https://toolhub.divyanshupatel.com).

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
/                              landing page
/all                           every tool, grouped by category
/pdf                           a category
/merge-pdf                     a tool — flat, no /pdf/ segment
```

Categories: `pdf`, `image`, `video`, `audio`, `text`, `developer`, `converters`, `utilities`,
`ai`, `math`. Every tool URL is flat (`/{slug}`, not `/{category}/{slug}`). The app is served
at the root of its domain (`basePath: ''`), so routes are authored exactly as they resolve
(`app/[tool_slug]/page.tsx` → `/merge-pdf`). If it is ever hosted under a path prefix instead,
`basePath` in `next.config.ts` and `SITE_BASE_PATH` in `lib/seo/site.ts` are the only two
places that change. Full table of every tool's URL: [docs/tools.md](docs/tools.md).

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
pnpm dev            # http://localhost:3000
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

Full walkthrough: [docs/architecture.md](docs/architecture.md). Contribution process:
[CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Branch (`feat/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*`) → push → Vercel preview →
pull request → CI (lint, typecheck, test, build) → merge to `main` → production.

Commits follow conventional prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
`test:`, `perf:`. Full guide: [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/git_workflow.md](docs/git_workflow.md).

Found a bug or want a new tool? Open an
[issue](https://github.com/divyanshupatel17/tools/issues/new/choose). Found a security
problem? See [SECURITY.md](SECURITY.md) instead of filing a public issue.

## Deployment

Vercel, with the Git integration handling deploys. `main` is production; every other branch
gets a preview URL. Details in [docs/deployment.md](docs/deployment.md).

## Privacy

Files are processed in your browser and never uploaded. If a tool ever needs a server, that
will be stated on the tool itself. See [docs/privacy.md](docs/privacy.md) and
[docs/terms.md](docs/terms.md).

## Docs

Full reference index, and the rules every change follows: [AGENTS.md](AGENTS.md).
Release history: [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
