# Utilities: planning

Single source of truth for what the Utilities category will contain. Registry entries live in
`apps/web/lib/tools/registry.ts`. Utilities has **6 tools**, no declared sections
(`lib/tools/sections.ts`) — small enough to render as one flat grid. None are built yet; follow
`docs/architecture.md`'s "Adding a tool" steps as each one starts.

This is the catch all for small helpers that save a search but don't fit a more specific
category. Everything runs entirely client side; nothing here needs a Web Worker or WASM.
Lorem Ipsum Generator does not live here even though it might seem to fit — it lives under
Developer, since placeholder text is overwhelmingly a web and app development need. See
`docs/tools.md` Notes before adding a new tool here that might actually belong elsewhere.

## Checklist

- [ ] QR Generator — `qr-generator`
- [ ] Password Generator — `password-generator`
- [ ] Random Generator — `random-generator`
- [ ] Calculator — `calculator`
- [ ] Stopwatch — `stopwatch`
- [ ] Timer — `timer`

## Utilities

### 1. QR Generator — `qr-generator`

| Feature | Details |
| --- | --- |
| Input | A link, plain text, or Wi-Fi network credentials. |
| Output | Download as PNG or SVG. |

SEO: QR Code Generator, Free QR Code Maker.

### 2. Password Generator — `password-generator`

| Feature | Details |
| --- | --- |
| Length | Adjustable, generated locally, never sent anywhere. |
| Character sets | Uppercase, lowercase, numbers, symbols, each toggled independently. |

SEO: Password Generator, Strong Password Generator.

### 3. Random Generator — `random-generator`

| Feature | Details |
| --- | --- |
| Numbers | Random number within a chosen range. |
| Pick | Choose randomly from a pasted list. |
| Shuffle | Randomize the order of a pasted list. |

SEO: Random Number Generator, Random Picker.

### 4. Calculator — `calculator`

| Feature | Details |
| --- | --- |
| Input | Keyboard friendly, standard operator precedence. |
| History | A running history of past entries in the same session. |

SEO: Online Calculator, Simple Calculator.

### 5. Stopwatch — `stopwatch`

| Feature | Details |
| --- | --- |
| Timing | Start, stop, reset, with lap splits. |
| Accuracy | Stays accurate even in a background tab, not throttled by the tab timer. |

SEO: Online Stopwatch, Stopwatch Timer.

### 6. Timer — `timer`

| Feature | Details |
| --- | --- |
| Countdown | Set a duration and count down to zero. |
| Alert | A sound plus a browser notification when it finishes. |

SEO: Online Timer, Countdown Timer.

## Shared conventions to build against

- Nothing in this category ever sends anything typed here anywhere; a password or a random
  value is generated and read locally only.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
