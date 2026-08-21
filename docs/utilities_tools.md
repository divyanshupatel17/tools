# Utilities: planning

Single source of truth for what the Utilities category will contain. Registry entries live in
`apps/web/lib/tools/registry.ts`. Utilities has **5 tools**, no declared sections
(`lib/tools/sections.ts`) — small enough to render as one flat grid. None are built yet; follow
`docs/architecture.md`'s "Adding a tool" steps as each one starts.

This is the catch all for small helpers that save a search but don't fit a more specific
category. Everything runs entirely client side; nothing here needs a Web Worker or WASM.
Lorem Ipsum Generator does not live here even though it might seem to fit — it lives under
Developer, since placeholder text is overwhelmingly a web and app development need. The
Calculator lives under Math instead, alongside the Scientific, Graphing, Programmer, Matrix and
3D Graphing Calculators — see `docs/math_tools.md`. See `docs/tools.md` Notes before adding a
new tool here that might actually belong elsewhere.

## Checklist

- [x] QR Generator — `qr-generator`
- [ ] Password Generator — `password-generator`
- [ ] Random Generator — `random-generator`
- [x] Stopwatch — `stopwatch`
- [x] Timer — `timer`

## Utilities

### 1. QR Generator — `qr-generator`

| Feature | Details |
| --- | --- |
| Types | 28 types: URL, text, email, phone, SMS, vCard, MeCard, location, Wi-Fi, calendar event, WhatsApp, Telegram, FaceTime, Skype, Twitter, Facebook, Instagram, YouTube, LinkedIn, Spotify, PayPal, Pinterest, Bitcoin, website, Google Maps (address, lat/long, or a pasted Maps link), App Store, Play Store, and a Universal type that auto detects a link, email or phone number. |
| Design | Solid or gradient (linear/radial) foreground, optional separate eye colours, transparent background, 5 module shapes, 4 eye frame/ball shapes. Finder eyes always render in one flat colour even when the body uses a gradient, so detection never depends on a position varying hue. |
| Logo | One click quick picks for the brand types, or upload your own; resize, optional backing padding, remove. Error correction is raised automatically once a logo is added. |
| Advanced | Error correction level (L/M/Q/H), quiet zone margin, output size up to 2000px. |
| Reliability | The rendered code is decoded back locally (jsQR) and flagged if it would not scan. |
| Output | Download as PNG, SVG or WebP. Everything renders in the browser; nothing is uploaded. |

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

### 4. Stopwatch — `stopwatch`

| Feature | Details |
| --- | --- |
| Timing | Start, stop, reset, with lap splits (Space to start/pause, L to lap, R to reset). |
| Accuracy | `performance.now()`-anchored elapsed clock; recomputes from real timestamps on every tick, so a throttled background tab never drifts. |
| Faces | Digital readout or an analog dial (continuous sweep hand), toggled from the theme picker; shared with Timer. |
| Themes | 11 design themes (3D, Claymorphism, Cyberpunk, Glassmorphism, Liquid Glass, Minimalism, Neo Brutalism, Neomorphism, Retro Y2K, Skeuomorphism, Terminal UI), each in light and dark, plus a custom accent colour. Minimalism is the default and follows the site's own light/AMOLED-dark theme. |
| Time format | Auto, or an explicit HH:MM:SS / HH:MM / MM:SS / HH:MM:SS.MS layout from the action bar. |
| Fullscreen | Distraction-free mode with its own floating, draggable action bar, independent light/dark toggle, and zoom in/out. |
| Picture-in-Picture | Opens in a real floating window via the `documentPictureInPicture` API (Chromium only; the button is disabled elsewhere). |
| Sound | Web Audio-synthesized alerts, no asset file; toggled from the action bar. |
| Quick link | Swaps directly to Timer from the action bar. |

SEO: Online Stopwatch, Stopwatch Timer.

### 5. Timer — `timer`

| Feature | Details |
| --- | --- |
| Countdown | Set hours, minutes and seconds (or +1/+5/+15/+30 minute presets) and count down to zero; optional label. Space to start/pause, R to reset. |
| Alert | A synthesized tick in the final 10 seconds, a chime at zero, plus a browser notification when it finishes. |
| Faces | Digital readout or an analog depleting ring, shared with Stopwatch. |
| Themes, fullscreen, PiP, time format, quick link | Shared with Stopwatch — see above. |

SEO: Online Timer, Countdown Timer.

## Shared conventions to build against

- Nothing in this category ever sends anything typed here anywhere; a password or a random
  value is generated and read locally only.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
