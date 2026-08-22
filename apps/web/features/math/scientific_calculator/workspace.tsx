'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Expand, History as HistoryIcon, Minimize2, Redo2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCalculator } from './use_calculator';
import { useCalculatorFullscreen } from '../calculator/use_calculator_fullscreen';
import { INSERT } from './calculator_engine';
import { SlotView } from './slot_view';
import type { FocusPath } from './expression_tree';

const NEVER_FOCUS: FocusPath = [{ itemIndex: -1, key: 'base' }];

type KeyVariant = 'digit' | 'function' | 'operator' | 'equals' | 'sci' | 'control';

interface KeyDef {
  id: string;
  label: string;
  ariaLabel?: string;
  variant: KeyVariant;
  onPress: () => void;
}

function CalcKey({ keyDef, pressed }: { keyDef: KeyDef; pressed: boolean }) {
  const isSci = keyDef.variant === 'sci';
  return (
    <button
      type="button"
      onClick={keyDef.onPress}
      aria-label={keyDef.ariaLabel ?? keyDef.label}
      className={cn(
        'calc-key',
        `calc-key--${isSci ? 'function' : keyDef.variant}`,
        pressed && 'is-pressed',
        'flex items-center justify-center rounded-xl font-medium select-none',
        isSci ? 'h-12 text-base sm:h-14 sm:text-lg' : 'h-14 text-xl sm:h-16 sm:text-2xl',
      )}
    >
      {keyDef.label}
    </button>
  );
}

function displayFontClass(value: string): string {
  if (value.length > 20) return 'text-xl sm:text-2xl';
  if (value.length > 12) return 'text-2xl sm:text-3xl';
  return 'text-3xl sm:text-4xl';
}

export function ScientificCalculatorWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle } = useCalculatorFullscreen(containerRef);
  const [showHistory, setShowHistory] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const calc = useCalculator({
    onActivity: (keyId) => {
      setPressedKey(keyId);
      window.setTimeout(() => setPressedKey((current) => (current === keyId ? null : current)), 120);
    },
  });

  function insertKey(id: string, insertId: keyof typeof INSERT, label: string, ariaLabel?: string): KeyDef {
    return {
      id,
      label,
      ariaLabel,
      variant: 'sci',
      onPress: () => calc.insertText(id, INSERT[insertId] as string),
    };
  }

  function powerKey(id: string, label: string, exponentText: string, ariaLabel: string): KeyDef {
    return { id, label, ariaLabel, variant: 'sci', onPress: () => calc.insertTemplate(id, 'power', exponentText) };
  }
  function templateKey(id: string, label: string, kind: 'root' | 'nthroot' | 'fraction' | 'logbase' | 'sum' | 'integral', ariaLabel: string): KeyDef {
    return { id, label, ariaLabel, variant: 'sci', onPress: () => calc.insertTemplate(id, kind) };
  }

  interface KeyGroup {
    title: string;
    keys: KeyDef[];
  }

  const sciGroups: KeyGroup[] = [
    {
      title: 'Trigonometry',
      keys: [
        insertKey('sin', 'sin', 'sin'),
        insertKey('cos', 'cos', 'cos'),
        insertKey('tan', 'tan', 'tan'),
        insertKey('sin-1', 'sin-1', 'sin⁻¹', 'Inverse sine'),
        insertKey('cos-1', 'cos-1', 'cos⁻¹', 'Inverse cosine'),
        insertKey('tan-1', 'tan-1', 'tan⁻¹', 'Inverse tangent'),
        insertKey('csc', 'csc', 'csc'),
        insertKey('sec', 'sec', 'sec'),
        insertKey('cot', 'cot', 'cot'),
      ],
    },
    {
      title: 'Hyperbolic',
      keys: [
        insertKey('sinh', 'sinh', 'sinh'),
        insertKey('cosh', 'cosh', 'cosh'),
        insertKey('tanh', 'tanh', 'tanh'),
        insertKey('sinh-1', 'sinh-1', 'sinh⁻¹', 'Inverse hyperbolic sine'),
        insertKey('cosh-1', 'cosh-1', 'cosh⁻¹', 'Inverse hyperbolic cosine'),
        insertKey('tanh-1', 'tanh-1', 'tanh⁻¹', 'Inverse hyperbolic tangent'),
      ],
    },
    {
      title: 'Logs and exponents',
      keys: [
        insertKey('ln', 'ln', 'ln'),
        insertKey('log', 'log', 'log'),
        templateKey('logbase', 'log□', 'logbase', 'Log with a custom base, click the small box to fill it'),
        insertKey('expfn', 'expfn', 'eˣ', 'e to the power'),
        {
          id: 'pow10',
          label: '10ˣ',
          ariaLabel: 'Ten to the power, click the exponent box to fill it',
          variant: 'sci',
          onPress: () => calc.insertTemplate('pow10', 'power', undefined, '10'),
        },
        {
          id: 'exp',
          label: 'EXP',
          ariaLabel: 'Times ten to the power',
          variant: 'sci',
          onPress: () => calc.insertExpNotation(),
        },
        insertKey('degree', 'degree', '°', 'Degrees, forces this value to degrees regardless of the angle mode'),
      ],
    },
    {
      title: 'Powers and roots',
      keys: [
        {
          id: 'pow',
          label: 'xʸ',
          ariaLabel: 'Raise to a power, click the base or exponent box to fill it',
          variant: 'sci',
          onPress: () => calc.insertTemplate('pow', 'power'),
        },
        powerKey('square', 'x²', '2', 'Square'),
        powerKey('cube', 'x³', '3', 'Cube'),
        powerKey('reciprocal', 'x⁻¹', '-1', 'Reciprocal'),
        templateKey('sqrt', '√', 'root', 'Square root, click into the box to fill it'),
        templateKey('nthroot', 'ⁿ√', 'nthroot', 'Nth root, click the index or radicand box to fill it'),
      ],
    },
    {
      title: 'Fractions and calculus',
      keys: [
        templateKey('fraction', 'a/b', 'fraction', 'Fraction, click the numerator or denominator box to fill it'),
        insertKey('abs', 'abs', '|x|', 'Absolute value'),
        insertKey('round', 'round', 'round', 'Round'),
        insertKey('floor', 'floor', 'floor', 'Round down'),
        insertKey('ceil', 'ceil', 'ceil', 'Round up'),
        insertKey('mod', 'mod', 'mod', 'Modulo remainder'),
        insertKey('factorial', 'factorial', 'x!', 'Factorial'),
        templateKey('sum', 'Σ', 'sum', 'Summation from n, click the bounds or body box to fill it'),
        templateKey('integral', '∫', 'integral', 'Definite integral over x, click the bounds or body box to fill it'),
      ],
    },
    {
      title: 'Variables and constants',
      keys: [
        insertKey('varN', 'varN', 'n', 'Summation variable n'),
        insertKey('varX', 'varX', 'x', 'Integral variable x'),
        insertKey('pi', 'pi', 'π'),
        insertKey('e', 'e', 'e', "Euler's number"),
        insertKey('phi', 'phi', 'φ', 'Golden ratio'),
        insertKey('infinity', 'infinity', '∞', 'Infinity'),
        insertKey('rand', 'rand', 'Rand', 'Random number between 0 and 1'),
        insertKey('comma', 'comma', ',', 'Comma'),
      ],
    },
  ];

  const digit = (value: string): KeyDef => ({
    id: `digit-${value}`,
    label: value,
    variant: 'digit',
    onPress: () => calc.insertText(`digit-${value}`, value),
  });
  const operator = (id: string, label: string, text: string, ariaLabel?: string): KeyDef => ({
    id,
    label,
    ariaLabel,
    variant: 'operator',
    onPress: () => calc.insertText(id, text),
  });
  const control = (id: string, label: string, onPress: () => void, ariaLabel?: string): KeyDef => ({
    id,
    label,
    ariaLabel,
    variant: 'control',
    onPress,
  });
  const templateOperator = (id: string, label: string, kind: 'ncr' | 'npr', ariaLabel: string): KeyDef => ({
    id,
    label,
    ariaLabel,
    variant: 'operator',
    onPress: () => calc.insertTemplate(id, kind),
  });

  const padKeys: KeyDef[] = [
    digit('7'),
    digit('8'),
    digit('9'),
    operator('op-÷', '÷', '÷', 'Divide'),

    digit('4'),
    digit('5'),
    digit('6'),
    operator('op-×', '×', '×', 'Multiply'),

    digit('1'),
    digit('2'),
    digit('3'),
    operator('op--', '−', '-', 'Subtract'),

    digit('0'),
    digit('.'),
    insertKey('ans', 'ans', 'Ans', 'Last answer'),
    operator('op-+', '+', '+', 'Add'),

    operator('lparen', '(', '(', 'Open parenthesis'),
    operator('rparen', ')', ')', 'Close parenthesis'),
    operator('percent', '%', '%', 'Percent'),
    templateOperator('ncr', 'nCr', 'ncr', 'Combinations, click the n or r box to fill it'),

    control('clear', 'AC', calc.pressClearAll, 'All clear'),
    control('backspace', '⌫', calc.pressBackspace, 'Backspace'),
    control('sign', '±', calc.pressToggleSign, 'Toggle sign'),
    templateOperator('npr', 'nPr', 'npr', 'Permutations, click the n or r box to fill it'),
  ];

  const historyPanel = (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">History</h2>
        {calc.history.length > 0 && (
          <button
            type="button"
            onClick={calc.clearHistory}
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      {calc.history.length === 0 ? (
        <p className="text-sm text-muted">Nothing calculated yet this session.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-sm lg:max-h-[36rem]">
          {calc.history.map((entry) => (
            <li key={entry.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-end text-xs text-muted">
                <SlotView slot={entry.expression} path={[]} focusPath={NEVER_FOCUS} cursor={-1} />
              </div>
              <p className="text-right text-lg font-medium break-words whitespace-normal text-foreground">
                {entry.result}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const isRootActive = calc.focus.length === 0;

  return (
    <div
      ref={containerRef}
      className={cn('flex w-full justify-center', isFullscreen && 'h-full items-center overflow-y-auto bg-background p-6')}
    >
      <div
        className={cn(
          'flex w-full max-w-5xl flex-col gap-4',
          showHistory && 'lg:grid lg:max-w-[96rem] lg:grid-cols-[1fr_2.6fr] lg:items-stretch lg:gap-6',
        )}
      >
        {showHistory && <div className="order-2 lg:order-1">{historyPanel}</div>}

        <div className="order-1 flex w-full flex-col gap-4 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={calc.toggleAngleMode}
                className="flex overflow-hidden rounded-full border border-border text-xs font-semibold"
              >
                <span
                  className={cn(
                    'px-3 py-1.5',
                    calc.angleMode === 'DEG'
                      ? 'bg-[var(--accent-math)] text-[var(--on-accent-math)]'
                      : 'bg-surface text-muted',
                  )}
                >
                  DEG
                </span>
                <span
                  className={cn(
                    'px-3 py-1.5',
                    calc.angleMode === 'RAD'
                      ? 'bg-[var(--accent-math)] text-[var(--on-accent-math)]'
                      : 'bg-surface text-muted',
                  )}
                >
                  RAD
                </span>
              </button>
              <button
                type="button"
                onClick={calc.undo}
                disabled={!calc.canUndo}
                aria-label="Undo"
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={calc.redo}
                disabled={!calc.canRedo}
                aria-label="Redo"
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
              >
                <Redo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={calc.pressClearAll}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                Clear all
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                aria-pressed={showHistory}
                aria-label="Toggle calculation history"
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <HistoryIcon className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Expand className="size-4" aria-hidden />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
            <div
              role="group"
              aria-label={`Expression: ${calc.ariaText}`}
              onClick={() => calc.focusSlot([], calc.root.length)}
              className="flex min-h-10 cursor-text items-center justify-end overflow-x-auto overflow-y-hidden py-2 text-2xl font-medium text-foreground sm:text-3xl"
            >
              {calc.root.length === 0 && !isRootActive ? (
                <span className="shrink-0 text-muted">0</span>
              ) : (
                <span className="shrink-0">
                  <SlotView slot={calc.root} path={[]} focusPath={calc.focus} cursor={calc.cursor} onFocus={calc.focusSlot} />
                </span>
              )}
            </div>
            <p
              className={cn(
                'mt-2 truncate text-right font-semibold tracking-tight',
                calc.hasError ? 'text-danger' : 'text-muted',
                displayFontClass(calc.preview ?? ''),
              )}
            >
              {calc.preview ?? ''}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[8fr_5fr]">
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sciGroups.map((group) => (
                <div key={group.title} className="rounded-xl border border-border bg-surface-muted/40 p-3">
                  <p className="mb-2 px-0.5 text-xs font-semibold tracking-wide text-muted uppercase">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.keys.map((keyDef) => (
                      <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-2">
                {padKeys.map((keyDef) => (
                  <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => calc.moveCursor(-1)}
                  aria-label="Move cursor left"
                  className={cn(
                    'calc-key calc-key--control flex h-14 items-center justify-center rounded-xl sm:h-16',
                    pressedKey === 'left' && 'is-pressed',
                  )}
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => calc.moveCursor(1)}
                  aria-label="Move cursor right"
                  className={cn(
                    'calc-key calc-key--control flex h-14 items-center justify-center rounded-xl sm:h-16',
                    pressedKey === 'right' && 'is-pressed',
                  )}
                >
                  <ArrowRight className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={calc.pressEquals}
                  aria-label="Equals"
                  className={cn(
                    'calc-key calc-key--equals col-span-2 flex h-14 items-center justify-center rounded-xl text-2xl font-medium select-none sm:h-16 sm:text-3xl',
                    pressedKey === 'equals' && 'is-pressed',
                  )}
                >
                  =
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted">
            Click any blank box to fill it directly. Examples: xʸ and ⁿ√ open clickable base, exponent, index and
            radicand boxes.
          </p>
        </div>
      </div>
    </div>
  );
}
