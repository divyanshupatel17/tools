# Contributing

Thanks for wanting to help. This project is a browser only tools site: no backend, no
database, no accounts. Every contribution should keep that true.

## Before you start

- Read [AGENTS.md](AGENTS.md) — the short rule set every change must follow.
- Read [docs/architecture.md](docs/architecture.md) for how the app is structured and how a
  tool is added.
- Browse [docs/tools.md](docs/tools.md) for naming and URL rules, and existing tool slugs.

## Setup

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Requires Node 20+ and pnpm 11+. No environment variables are needed.

## Making a change

1. Branch from an updated `main` using the prefix that matches your change
   (`feat/`, `fix/`, `chore/`, `refactor/`, `docs/`) — see
   [docs/git_workflow.md](docs/git_workflow.md) for the full flow.
2. Make a focused change. One tool or one fix per branch.
3. Run the checks below before opening a pull request.
4. Use a [conventional commit](docs/git_workflow.md#commit-message-convention) message,
   e.g. `feat: add qr code generator`.
5. Open a pull request against `main` and fill in the template.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e       # needs a build first
```

## Adding a new tool

1. Add an entry to `apps/web/lib/tools/registry.ts`.
2. Implement the processor in `apps/web/features/<category>/`.
3. Register it in `apps/web/lib/processing/processor_registry.ts`.
4. Build the workspace UI and flip `status` to `available`.
5. Update the checklist in that category's `docs/{category}_tools.md`.

Full walkthrough, including how to add a whole new category:
[docs/architecture.md](docs/architecture.md).

## Reporting bugs and requesting features

Use the issue templates: [Bug report](../../issues/new?template=bug_report.yml) ·
[Feature request](../../issues/new?template=feature_request.yml).

For a security issue, do not open a public issue — see [SECURITY.md](SECURITY.md).

## Code of conduct

Be respectful. Disagree on the technical merits, not the person. Reports of abusive behaviour
can go to the email in [SECURITY.md](SECURITY.md).
