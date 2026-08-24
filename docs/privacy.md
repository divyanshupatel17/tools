# Privacy

## Local processing

Files are processed in the browser using the File API, Canvas, Web Workers and WebAssembly.
A file selected in a tool stays in that browser tab's memory and is discarded when the tab
closes. Nothing is uploaded, stored, or logged.

This is an architectural property, not a policy: there is no backend, no database, and no file
storage to upload to.

## No unnecessary uploads

A tool must not send a file, its contents, or its name anywhere. That includes analytics,
error reporting and third-party scripts. If a feature would require it, it does not ship.

## If server processing is ever needed

Some formats may eventually be impractical in-browser. If that happens:

- It must be an explicit, per-tool decision — never a silent fallback.
- The tool page must say plainly what is sent, why, and how long it is kept.
- The default must stay local; server processing is opt-in.
- The rest of the platform stays browser-only.

`currency-converter` is the only planned tool with `client_only: false`, and it fetches
published exchange rates — it sends no user data.

## Secrets

No credentials, API keys or tokens in the repository, including inside `.local/`.
`.env.example` lists key names with empty values. Any key that touches disk here is considered
leaked and must be rotated.

There are currently no required environment variables.

## See also

The live copy on the site is `apps/web/app/privacy/page.tsx`; keep the two in sync. Full doc
index: [AGENTS.md](../AGENTS.md#docs). Terms of use: [terms.md](terms.md).
