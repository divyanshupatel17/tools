'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface KeypadKey {
  label: string;
  ariaLabel?: string;
  insert: string;
  /** How many characters back from the end of `insert` the cursor should land. */
  cursorBack?: number;
}

interface KeypadSection {
  title: string;
  keys: KeypadKey[];
}

function fn(label: string, name: string, ariaLabel?: string): KeypadKey {
  return { label, ariaLabel, insert: `${name}()`, cursorBack: 1 };
}
function fn2(label: string, name: string, ariaLabel?: string): KeypadKey {
  return { label, ariaLabel, insert: `${name}(,)`, cursorBack: 2 };
}

const BASE_SYMBOL_KEYS: KeypadKey[] = [
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: ',', insert: ',' },
  { label: '^', insert: '^', ariaLabel: 'Power' },
  { label: 'x²', insert: '^2', ariaLabel: 'Squared' },
  { label: '√', insert: 'sqrt()', cursorBack: 1, ariaLabel: 'Square root' },
  { label: '=', insert: '=' },
  { label: '<', insert: '<' },
  { label: '>', insert: '>' },
  { label: '≤', insert: '<=', ariaLabel: 'Less than or equal to' },
  { label: '≥', insert: '>=', ariaLabel: 'Greater than or equal to' },
  { label: '!', insert: '!', ariaLabel: 'Factorial' },
];

const SECTIONS: KeypadSection[] = [
  {
    title: 'Trig functions',
    keys: [fn('sin', 'sin'), fn('cos', 'cos'), fn('tan', 'tan'), fn('csc', 'csc'), fn('sec', 'sec'), fn('cot', 'cot')],
  },
  {
    title: 'Inverse trig functions',
    keys: [
      fn('sin⁻¹', 'asin', 'Inverse sine'),
      fn('cos⁻¹', 'acos', 'Inverse cosine'),
      fn('tan⁻¹', 'atan', 'Inverse tangent'),
      fn('csc⁻¹', 'acsc', 'Inverse cosecant'),
      fn('sec⁻¹', 'asec', 'Inverse secant'),
      fn('cot⁻¹', 'acot', 'Inverse cotangent'),
    ],
  },
  {
    title: 'Hyperbolic trig functions',
    keys: [
      fn('sinh', 'sinh'),
      fn('cosh', 'cosh'),
      fn('tanh', 'tanh'),
      fn('sinh⁻¹', 'asinh', 'Inverse hyperbolic sine'),
      fn('cosh⁻¹', 'acosh', 'Inverse hyperbolic cosine'),
      fn('tanh⁻¹', 'atanh', 'Inverse hyperbolic tangent'),
    ],
  },
  {
    title: 'Logs and exponents',
    keys: [
      fn('ln', 'ln'),
      fn('log', 'log', 'Log base 10'),
      fn2('logₐ', 'log', 'Log with a custom base: base first, then the value'),
      fn('eˣ', 'exp', 'e to the power'),
    ],
  },
  {
    title: 'Roots',
    keys: [fn('√', 'sqrt', 'Square root'), fn('∛', 'cbrt', 'Cube root'), fn2('ⁿ√', 'nthroot', 'Nth root: index first, then the value')],
  },
  {
    title: 'Number theory',
    keys: [
      fn('abs', 'abs', 'Absolute value'),
      fn('floor', 'floor', 'Round down'),
      fn('ceil', 'ceil', 'Round up'),
      fn('round', 'round'),
      fn('sign', 'sign'),
      fn2('mod', 'mod', 'Modulo remainder'),
      fn2('gcd', 'gcd', 'Greatest common divisor'),
      fn2('lcm', 'lcm', 'Least common multiple'),
      fn2('nCr', 'ncr', 'Combinations'),
      fn2('nPr', 'npr', 'Permutations'),
    ],
  },
  {
    title: 'Aggregate over a list',
    keys: [fn2('min', 'min'), fn2('max', 'max'), fn2('mean', 'mean'), fn2('sum', 'sum')],
  },
  {
    title: 'Constants',
    keys: [
      { label: 'π', insert: 'π', ariaLabel: 'Pi' },
      { label: 'e', insert: 'e', ariaLabel: "Euler's number" },
      { label: 'τ', insert: 'tau', ariaLabel: 'Tau' },
      { label: 'φ', insert: 'φ', ariaLabel: 'Golden ratio' },
      { label: '∞', insert: '∞', ariaLabel: 'Infinity' },
    ],
  },
];

interface FunctionKeypadProps {
  onInsert: (text: string, cursorBack?: number) => void;
  /** Bare variable keys to lead the quick row with. Defaults to `x`, `y`. */
  variableKeys?: readonly string[];
}

export function FunctionKeypad({ onInsert, variableKeys = ['x', 'y'] }: FunctionKeypadProps) {
  const [open, setOpen] = useState(false);
  const basicKeys: KeypadKey[] = [...variableKeys.map((name) => ({ label: name, insert: name })), ...BASE_SYMBOL_KEYS];

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Keyboard className="size-4" aria-hidden />
          Functions
        </span>
        {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-border p-2">
          <div className="grid grid-cols-6 gap-1 pb-2 sm:grid-cols-7">
            {basicKeys.map((key) => (
              <button
                key={key.label}
                type="button"
                onClick={() => onInsert(key.insert, key.cursorBack)}
                aria-label={key.ariaLabel ?? key.label}
                className="flex h-8 items-center justify-center rounded-lg bg-surface-muted text-sm text-foreground hover:bg-[var(--accent-math)] hover:text-[var(--on-accent-math)]"
              >
                {key.label}
              </button>
            ))}
          </div>
          {SECTIONS.map((section) => (
            <div key={section.title} className={cn('border-t border-border pt-2 pb-2')}>
              <p className="mb-1.5 px-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">{section.title}</p>
              <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                {section.keys.map((key) => (
                  <button
                    key={key.label}
                    type="button"
                    onClick={() => onInsert(key.insert, key.cursorBack)}
                    aria-label={key.ariaLabel ?? key.label}
                    className="flex h-8 items-center justify-center rounded-lg bg-surface-muted text-sm text-foreground hover:bg-[var(--accent-math)] hover:text-[var(--on-accent-math)]"
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
