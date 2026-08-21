# Math: planning

Single source of truth for what the Math category will contain. Registry entries live in
`apps/web/lib/tools/registry.ts`. Math has **6 tools**, no declared sections
(`lib/tools/sections.ts`) — small enough to render as one flat grid. Basic Calculator is built;
the rest follow `docs/architecture.md`'s "Adding a tool" steps as each one starts.

This category covers calculation and graphing: everyday arithmetic, scientific functions, base
conversion and bitwise work, matrices, and 2D/3D function plotting. Everything runs entirely
client side; nothing here needs a Web Worker or WASM, though the graphing tools should still
render their plot on a canvas rather than recomputing thousands of points in the DOM. The Basic
Calculator absorbed the `calculator` slug and tool that previously lived under Utilities, since a
calculator is a stronger fit next to the rest of Math than as a generic utility — see
`docs/utilities_tools.md`.

## Checklist

- [x] Basic Calculator — `calculator`
- [ ] Scientific Calculator — `scientific-calculator`
- [ ] Graphing Calculator — `graphing-calculator`
- [ ] Programmer Calculator — `programmer-calculator`
- [ ] Matrix Calculator — `matrix-calculator`
- [ ] 3D Graphing Calculator — `3d-graphing-calculator`

## Math

### 1. Basic Calculator — `calculator`

| Feature | Details |
| --- | --- |
| Input | On screen keypad plus full keyboard support (digits, `+ - * /`, `%`, Enter for equals, Backspace, Escape to clear). Standard operator precedence: multiply and divide bind tighter than add and subtract. |
| Operations | Add, subtract, multiply, divide, percent, sign toggle, backspace, all clear. |
| History | A running list of past `expression = result` entries for the session, shown in a toggleable panel with a clear action. |
| Fullscreen | Expands via the native Fullscreen API from a dedicated icon button. |
| Keys | Raised, tactile keys that visibly depress on press, whether triggered by pointer, touch or the matching keyboard key. |

SEO: Online Calculator, Simple Calculator.

### 2. Scientific Calculator — `scientific-calculator`

| Feature | Details |
| --- | --- |
| Functions | Trigonometric (sin, cos, tan and inverses), logarithmic, exponential, powers, roots and factorial. |
| Modes | Degree and radian angle modes. |
| Memory | Store, recall, add to and clear a memory register. |
| History | A running history of past entries in the same session. |

SEO: Scientific Calculator, Online Scientific Calculator.

### 3. Graphing Calculator — `graphing-calculator`

| Feature | Details |
| --- | --- |
| Plotting | Graph one or more functions of x at once, each in its own colour. |
| Navigation | Pan and zoom the plane, trace a curve to read exact coordinates. |
| Input | Standard math notation, including implicit multiplication. |
| Output | The rendered graph can be viewed full size and downloaded as an image. |

SEO: Graphing Calculator, Function Grapher.

### 4. Programmer Calculator — `programmer-calculator`

| Feature | Details |
| --- | --- |
| Bases | Binary, octal, decimal and hexadecimal, all kept in sync as you type in any one of them. |
| Bitwise | AND, OR, XOR, NOT and bit shifts. |
| Word size | 8, 16, 32 or 64 bit, with overflow and two's complement handled per size. |

SEO: Programmer Calculator, Hex Calculator.

### 5. Matrix Calculator — `matrix-calculator`

| Feature | Details |
| --- | --- |
| Size | Configurable rows and columns, up to a practical limit for on screen entry. |
| Operations | Addition, subtraction, multiplication, transpose, determinant and inverse. |
| Result | Shown as a matrix grid, matching the input layout. |

SEO: Matrix Calculator, Matrix Multiplication Calculator.

### 6. 3D Graphing Calculator — `3d-graphing-calculator`

| Feature | Details |
| --- | --- |
| Plotting | Graph a surface from a function of x and y. |
| Navigation | Rotate, pan and zoom the 3D view. |
| Input | Standard math notation, including implicit multiplication. |
| Output | The rendered surface can be viewed full size and downloaded as an image. |

SEO: 3D Graphing Calculator, Surface Plotter.

## Shared conventions to build against

- Nothing typed into any Math tool is ever sent anywhere; every calculation, plot and matrix
  operation runs and stays in the browser.
- The two graphing tools render to a canvas and redraw on every input or view change, matching
  the sitewide rule that a setting a user tunes by eye always shows a live preview rather than a
  result to download and check.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
