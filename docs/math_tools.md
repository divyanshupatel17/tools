# Math: planning

Single source of truth for what the Math category will contain. Registry entries live in
`apps/web/lib/tools/registry.ts`. Math has **6 tools**, no declared sections
(`lib/tools/sections.ts`) — small enough to render as one flat grid. Basic Calculator and
Scientific Calculator are built; the rest follow `docs/architecture.md`'s "Adding a tool" steps
as each one starts.

This category covers calculation and graphing: everyday arithmetic, scientific functions, base
conversion and bitwise work, matrices, and 2D/3D function plotting. Everything runs entirely
client side; nothing here needs a Web Worker or WASM, though the graphing tools should still
render their plot on a canvas rather than recomputing thousands of points in the DOM. The Basic
Calculator absorbed the `calculator` slug and tool that previously lived under Utilities, since a
calculator is a stronger fit next to the rest of Math than as a generic utility — see
`docs/utilities_tools.md`.

## Checklist

- [x] Basic Calculator — `calculator`
- [x] Scientific Calculator — `scientific-calculator`
- [x] Graphing Calculator — `graphing-calculator`
- [x] Programmer Calculator — `programmer-calculator`
- [ ] Matrix Calculator — `matrix-calculator`
- [x] 3D Graphing Calculator — `3d-graphing-calculator`

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
| Input | Cursor based expression editing (insert anywhere, left/right, undo/redo), keyboard support, and a live result preview that updates on every keystroke. Every function and constant button is visible at once, not tucked under a tab. |
| Functions | Trigonometric (sin, cos, tan and inverses), hyperbolic, natural and base 10 log, eˣ, square root, nth root, general power, square, cube, reciprocal, absolute value, round, factorial, nCr and nPr, all through a real recursive descent parser with parentheses and comma separated arguments. |
| Modes | Degree and radian angle modes, switchable at any time; conversion applies to sin, cos, tan and their inverses. |
| Constants | π, e, φ (golden ratio) and Ans (the last committed answer). |
| Display | The typed expression renders in proper math notation (sin⁻¹, √, ⁿ√, `\|x\|`) instead of raw parser tokens, both live and in history. |
| History | A running list of past `expression -> result` entries for the session, shown in the same toggleable panel as Basic Calculator. |
| Fullscreen | Expands via the native Fullscreen API, matching Basic Calculator. |

SEO: Scientific Calculator, Online Scientific Calculator.

### 3. Graphing Calculator — `graphing-calculator`

| Feature | Details |
| --- | --- |
| Layout | An editable equation list on the left, each row auto colour coded; the plot fills the right side and stays sticky on scroll, matching the reference implementation this tool follows (Desmos). |
| Expression kinds | A bare expression or `y=f(x)` plots a function of x; `x=g(y)` plots a function of y; `a=3` (or any bare letter equals a constant expression) declares a slider parameter later rows can reference; `x^2+y^2=4` style two variable equalities plot an implicit curve via marching squares; `<`, `<=`, `>`, `>=` shade an inequality's region; `(a, a^2)` plots a literal point. |
| Functions | Trig and inverse trig (`sin`...`cot`, `asin`/`arcsin`...`acot`/`arccot`), hyperbolic and inverse hyperbolic, `ln`, `log` (base 10 or `log(base, x)`), `exp`, `sqrt`, `cbrt`, `nthroot`, `abs`, `floor`, `ceil`, `round`, `sign`, `mod`, `gcd`, `lcm`, `ncr`, `npr`, factorial, and `min`/`max`/`mean`/`sum` over any number of arguments, all through a real recursive descent parser with implicit multiplication (`2x`, `xy`, `2(x+1)`). |
| Sliders | Each parameter row gets an inline range input with editable min and max, plus a play button that animates the value back and forth. |
| Navigation | Drag to pan, scroll or pinch to zoom (keeping x and y scaled equally so circles stay round), hover any function or point to trace its exact coordinates. |
| Output | A small export button offers standard, high and ultra resolution PNG downloads of the current view. |

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
| Layout | An editable equation list on the left (the same expression panel component the 2D Graphing Calculator uses), a rotatable 3D plot filling the right side, matching Desmos 3D. |
| Expression kinds | `z=f(x,y)` (or bare `f(x,y)`), `y=f(x,z)` and `x=f(y,z)` plot a surface; `a=3` declares a slider parameter later rows can reference; a three variable equality like `x^2+y^2+z^2=9` plots an implicit isosurface via marching cubes; `<`, `<=`, `>`, `>=` shade an inequality as a region bounded by the view box; `(a,a^2,1)` plots a literal point. A two variable equation such as `x^2+y^2=7` becomes a cylinder automatically, since the third axis is simply free. |
| Functions | The same full function set as the 2D Graphing Calculator (trig, inverse trig, hyperbolic, logs, roots, number theory, aggregates), through the same recursive descent parser. |
| Sliders | Each parameter row gets the same inline range input and play button as the 2D tool. Surfaces resample every frame while a slider animates; implicit and inequality surfaces only re extract when the values they actually reference change. |
| Navigation | Drag to rotate the view, scroll or pinch to zoom, shift drag or right click drag to pan, hover any surface or point to trace its exact coordinate. |
| Output | A small export button offers standard, high and ultra resolution PNG downloads of the current view. |

SEO: 3D Graphing Calculator, Surface Plotter.

## Shared conventions to build against

- Nothing typed into any Math tool is ever sent anywhere; every calculation, plot and matrix
  operation runs and stays in the browser.
- The two graphing tools render to a canvas and redraw on every input or view change, matching
  the sitewide rule that a setting a user tunes by eye always shows a live preview rather than a
  result to download and check.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
