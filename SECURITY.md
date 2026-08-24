# Security Policy

This is a browser-first tools site — files are processed locally in the visitor's browser and
are never uploaded to a server. That said, the site still has a real attack surface: the
client-side code itself, dependencies, and the few endpoints that aren't purely static (see
`docs/architecture.md` and `docs/privacy.md`).

## Reporting a vulnerability

If you find a security issue — XSS, a dependency vulnerability, a way to exfiltrate a file a
tool is supposed to keep local, or anything else — please report it privately rather than
opening a public issue or PR.

- Email: itzdivyanshupatel@gmail.com
- Include what you found, the steps to reproduce it, and its impact if you can.

You should get an acknowledgement within a few days. Please give a reasonable amount of time
to fix a confirmed issue before any public disclosure.

## Supported versions

Only the latest deployed version of the site is supported. There are no older versions to
patch — a fix ships by deploying `main`.
