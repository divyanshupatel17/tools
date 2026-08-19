# Deployment

## Local

```bash
pnpm install
pnpm dev      # http://localhost:3000/tools
```

Production build locally:

```bash
pnpm build
pnpm start    # http://localhost:3000/tools
```

No environment variables are required. `NEXT_PUBLIC_SITE_ORIGIN` is optional and only overrides
the canonical origin used in metadata, the sitemap and robots.

## Vercel project settings

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| Framework preset | Next.js                          |
| Root directory   | `apps/web`                       |
| Install command  | `pnpm install --frozen-lockfile` |
| Build command    | `pnpm build`                     |
| Node version     | 24                               |

The app sets `basePath: '/tools'`, so the deployment serves `/tools/...` on its own domain.
Point `divyanshupatel.com/tools` at it either by attaching the domain directly or by rewriting
`/tools/:path*` from the main site to this deployment with the prefix preserved.

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
