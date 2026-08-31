# Deployment

## Local

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

Production build locally:

```bash
pnpm build
pnpm start    # http://localhost:3000
```

`NEXT_PUBLIC_SITE_ORIGIN` is optional and only overrides the canonical origin used in metadata,
the sitemap and robots.

Firebase Analytics needs the `NEXT_PUBLIC_FIREBASE_*` variables listed in
[`apps/web/.env.example`](../apps/web/.env.example), copied into `apps/web/.env.local` for local
development. Without them the app still runs; `lib/firebase/analytics.ts` just never
initialises Firebase, so nothing is sent. Values come from Firebase console → Project settings
→ General → Your apps → ToolHub Web → SDK setup and configuration.

## Vercel project settings

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| Framework preset | Next.js                          |
| Root directory   | `apps/web`                       |
| Install command  | `pnpm install --frozen-lockfile` |
| Build command    | `pnpm build`                     |
| Node version     | 24                               |

The app sets `basePath: ''` and is served at the root of its own subdomain,
`toolhub.divyanshupatel.com` — attach that domain directly to the Vercel project, no rewrite
needed. If it ever moves back under a path on another domain (e.g. `divyanshupatel.com/tools`),
set `basePath` in `next.config.ts` and `SITE_BASE_PATH` in `lib/seo/site.ts` together first —
see [architecture.md](architecture.md#routing-and-basepath).

## Environments

- `main` → production
- Every other branch → an automatic Vercel preview URL

There is no beta branch and no beta URL. Test on a preview, then merge.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: install, lint,
typecheck, test, build. It does **not** deploy — the Vercel Git integration owns deployment.

## Flow

```
feature branch → push → Vercel preview → test → pull request → CI green → merge main → production
```

## Rollback

Promote the previous production deployment from the Vercel dashboard. Do not force-push `main`.

## See also

Branching and commit conventions: [git_workflow.md](git_workflow.md). Full doc index:
[AGENTS.md](../AGENTS.md#docs).
