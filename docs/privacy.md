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

## Site analytics

Firebase Analytics (Google Analytics 4 under the hood) runs sitewide to measure page views and
which tools get used. Alongside the automatic `page_view`, three custom events fire, each
carrying only the tool's id/category/slug (already public in its URL) and nothing else:

- `tool_used` — a tool's processor was loaded, i.e. a run was attempted.
- `tool_error` — a run failed (a user cancelling is not counted as an error).
- `download_result` — a result file's download was triggered.

Plus standard client metadata Google collects for any site using it (approximate location from
IP, device and browser type). None of this ever includes a file, a file name, file contents, or
anything typed into a tool — see `lib/firebase/tool_events.ts`. `lib/firebase/analytics.ts`
initialises lazily, client-side only, and no-ops if the `NEXT_PUBLIC_FIREBASE_*` env vars are
unset.

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

The `NEXT_PUBLIC_FIREBASE_*` variables in `apps/web/.env.example` are optional; the app runs
fine without them, Firebase Analytics just never initialises.

## See also

The live copy on the site is `apps/web/app/privacy/page.tsx`; keep the two in sync. Full doc
index: [AGENTS.md](../AGENTS.md#docs). Terms of use: [terms.md](terms.md).
