'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Delete,
  Expand,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useProgrammerCalculator } from './use_programmer_calculator';
import { useCalculatorFullscreen } from '../calculator/use_calculator_fullscreen';
import {
  BIT_WIDTHS,
  NUMBER_SYSTEMS,
  formatValue,
  groupAndPad,
  isDigitValidForSystem,
  toSigned,
  wrapToWidth,
  type NumberSystem,
} from './calculator_engine';

type KeyVariant = 'digit' | 'function' | 'operator' | 'equals' | 'control';

interface KeyDef {
  id: string;
  label: string;
  ariaLabel?: string;
  variant: KeyVariant;
  disabled?: boolean;
  onPress: () => void;
}

function CalcKey({ keyDef, pressed }: { keyDef: KeyDef; pressed: boolean }) {
  return (
    <button
      type="button"
      onClick={keyDef.onPress}
      disabled={keyDef.disabled}
      aria-label={keyDef.ariaLabel ?? keyDef.label}
      className={cn(
        'calc-key',
        `calc-key--${keyDef.variant}`,
        pressed && 'is-pressed',
        'flex h-8 items-center justify-center rounded-lg text-xs font-medium select-none sm:h-9 sm:text-sm',
        keyDef.disabled && 'cursor-not-allowed opacity-35',
      )}
    >
      {keyDef.label}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      aria-label="Copy value"
      className="text-muted hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="border-border inline-flex shrink-0 overflow-hidden rounded-full border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              'shrink-0 px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
              value === option.value
                ? 'bg-[var(--accent-math)] text-[var(--on-accent-math)]'
                : 'bg-surface text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProgrammerCalculatorWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isFullscreen, toggle } = useCalculatorFullscreen(containerRef);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const calc = useProgrammerCalculator();

  // liveValue is already wrapped by the parser, but a stale `ans` (or the 0n fallback) predates the
  // current bit width whenever it changes with no live expression, so re-wrap it for every display.
  const displayValue = wrapToWidth(calc.liveValue ?? calc.ans ?? 0n, calc.bitWidth);

  useEffect(() => {
    if (focusRequest === 0) return;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(calc.cursor, calc.cursor);
  }, [focusRequest, calc.cursor]);

  function flash(id: string) {
    setPressedKey(id);
    window.setTimeout(() => setPressedKey((current) => (current === id ? null : current)), 120);
  }

  function insertText(id: string, text: string) {
    flash(id);
    calc.insertAtCursor(text);
    setFocusRequest((value) => value + 1);
  }

  function transform(id: string, next: (value: bigint) => bigint) {
    flash(id);
    calc.replaceWithValue(wrapToWidth(next(displayValue), calc.bitWidth));
  }

  const digitKey = (digit: string): KeyDef => ({
    id: `digit-${digit}`,
    label: digit,
    variant: 'digit',
    disabled: !isDigitValidForSystem(digit, calc.numberSystem),
    onPress: () => insertText(`digit-${digit}`, digit),
  });
  const opKey = (id: string, label: string, text: string, ariaLabel?: string): KeyDef => ({
    id,
    label,
    ariaLabel,
    variant: 'operator',
    onPress: () => insertText(id, text),
  });
  const fnKey = (id: string, label: string, text: string, ariaLabel?: string): KeyDef => ({
    id,
    label,
    ariaLabel,
    variant: 'function',
    onPress: () => insertText(id, ` ${text} `),
  });

  const hexKeys: KeyDef[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => ({
    id: `hex-${letter}`,
    label: letter,
    variant: 'digit',
    disabled: calc.numberSystem !== 'HEX',
    onPress: () => insertText(`hex-${letter}`, letter),
  }));

  const bitwiseKeys: KeyDef[] = [
    fnKey('and', 'AND', 'AND'),
    fnKey('or', 'OR', 'OR'),
    fnKey('xor', 'XOR', 'XOR'),
    fnKey('not', 'NOT', 'NOT', "One's complement of the following value"),
    fnKey('nand', 'NAND', 'NAND'),
    fnKey('nor', 'NOR', 'NOR'),
    fnKey('xnor', 'XNOR', 'XNOR'),
  ];

  const shiftKeys: KeyDef[] = [
    opKey('shl', '<<', '<<', 'Shift left'),
    opKey('shr', '>>', '>>', 'Shift right'),
    fnKey('rol', 'RoL', 'ROL', 'Rotate left'),
    fnKey('ror', 'RoR', 'ROR', 'Rotate right'),
  ];

  const transformKeys: KeyDef[] = [
    {
      id: 'twos',
      label: "2's",
      ariaLabel: "Two's complement of the current value",
      variant: 'function',
      onPress: () => transform('twos', (v) => -v),
    },
    {
      id: 'ones',
      label: "1's",
      ariaLabel: "One's complement of the current value",
      variant: 'function',
      onPress: () => transform('ones', (v) => ~v),
    },
    {
      id: 'abs',
      label: '|x|',
      ariaLabel: 'Absolute value of the current value',
      variant: 'function',
      onPress: () =>
        transform('abs', (v) =>
          calc.signed ? (toSigned(v, calc.bitWidth) < 0n ? -toSigned(v, calc.bitWidth) : v) : v,
        ),
    },
    {
      id: 'sign',
      label: '±',
      ariaLabel: 'Toggle sign of the current value',
      variant: 'function',
      onPress: () => transform('sign', (v) => -v),
    },
  ];

  const editKeys: KeyDef[] = [
    {
      id: 'clear',
      label: 'AC',
      ariaLabel: 'All clear',
      variant: 'control',
      onPress: () => {
        flash('clear');
        calc.clearAll();
      },
    },
    {
      id: 'backspace',
      label: '',
      ariaLabel: 'Backspace',
      variant: 'control',
      onPress: () => {
        flash('backspace');
        calc.backspace();
        setFocusRequest((value) => value + 1);
      },
    },
    opKey('lparen', '(', '(', 'Open parenthesis'),
    opKey('rparen', ')', ')', 'Close parenthesis'),
  ];

  const padKeys: KeyDef[] = [
    digitKey('7'),
    digitKey('8'),
    digitKey('9'),
    opKey('div', '÷', '/', 'Divide'),
    digitKey('4'),
    digitKey('5'),
    digitKey('6'),
    opKey('mul', '×', '*', 'Multiply'),
    digitKey('1'),
    digitKey('2'),
    digitKey('3'),
    opKey('sub', '−', '-', 'Subtract'),
    digitKey('0'),
    fnKey('mod', 'MOD', 'MOD', 'Remainder'),
    {
      id: 'ans',
      label: 'Ans',
      variant: 'function',
      ariaLabel: 'Last answer',
      onPress: () => insertText('ans', 'Ans'),
    },
    opKey('add', '+', '+', 'Add'),
  ];

  const width = calc.bitWidth;
  const conversions: { key: NumberSystem; label: string }[] = [
    { key: 'DEC', label: 'Decimal' },
    { key: 'HEX', label: 'Hexadecimal' },
    { key: 'BIN', label: `Binary (${width} bit)` },
    { key: 'OCT', label: 'Octal' },
  ];

  const bitRows = useMemo(() => {
    const rows: { label: string; bits: number[] }[] = [];
    for (let high = width - 1; high >= 0; high -= 16) {
      const low = Math.max(0, high - 15);
      const bits: number[] = [];
      for (let b = high; b >= low; b -= 1) bits.push(b);
      rows.push({ label: `${high}-${low}`, bits });
    }
    return rows;
  }, [width]);

  function toggleBit(index: number) {
    const next = displayValue ^ (1n << BigInt(index));
    calc.replaceWithValue(wrapToWidth(next, width));
  }

  const historyPanel = (
    <div className="border-border bg-surface flex flex-col rounded-2xl border p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-foreground text-sm font-medium">History</h2>
        {calc.history.length > 0 && (
          <button
            type="button"
            onClick={calc.clearHistory}
            className="text-muted hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Clear History
          </button>
        )}
      </div>
      {calc.history.length === 0 ? (
        <p className="text-muted text-sm">Nothing calculated yet this session.</p>
      ) : (
        <ul className="flex max-h-32 flex-col gap-1.5 overflow-y-auto text-sm">
          {calc.history.map((entry) => (
            <li
              key={entry.id}
              className="border-border flex items-center justify-between gap-2 border-b pb-2 last:border-0"
            >
              <button
                type="button"
                onClick={() => calc.setExpression(entry.expression)}
                className="text-muted hover:text-foreground min-w-0 flex-1 truncate text-left text-xs"
              >
                {entry.expression}
              </button>
              <span className="text-foreground shrink-0 font-medium">{entry.result}</span>
              <CopyButton text={entry.result} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const resultPanel = (
    <div
      className={cn(
        'flex items-start gap-2 rounded-2xl border p-3',
        calc.evalState.status === 'success' && 'border-success/30 bg-success/10',
        calc.evalState.status === 'error' && 'border-danger/30 bg-danger/10',
        calc.evalState.status === 'idle' && 'border-border bg-surface',
      )}
    >
      {calc.evalState.status === 'success' && (
        <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
      )}
      {calc.evalState.status === 'error' && (
        <AlertCircle className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="text-foreground text-sm font-semibold">
          {calc.evalState.status === 'success'
            ? 'Success'
            : calc.evalState.status === 'error'
              ? 'Error'
              : 'Results Summary'}
        </p>
        <p className="text-muted text-xs break-words">
          {calc.evalState.status === 'idle'
            ? 'Press equals to evaluate the expression.'
            : calc.evalState.message}
        </p>
      </div>
    </div>
  );

  const conversionCards = (
    <div className="flex flex-col gap-1.5">
      {conversions.map(({ key, label }) => {
        const text =
          key === 'BIN' || key === 'HEX' || key === 'OCT'
            ? groupAndPad(displayValue, key, width)
            : formatValue(displayValue, key, width, calc.signed);
        return (
          <div key={key} className="border-border bg-surface rounded-xl border p-2">
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-muted text-[0.6rem] font-semibold tracking-wide uppercase">
                {label}
              </span>
              <CopyButton
                text={formatValue(displayValue, key, width, calc.signed).replace(/\s/g, '')}
              />
            </div>
            <p
              className={cn(
                'text-foreground font-mono font-semibold break-words whitespace-normal',
                key === 'BIN' ? 'text-xs sm:text-sm' : 'text-base',
              )}
            >
              {text}
            </p>
          </div>
        );
      })}
    </div>
  );

  const bitVisualization = (
    <div className="border-border bg-surface rounded-2xl border p-3">
      <p className="text-foreground mb-2 text-sm font-medium">Bit Visualization ({width} bit)</p>
      <div className="flex flex-col gap-1.5">
        {bitRows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-muted w-12 shrink-0 font-mono text-[0.65rem]">{row.label}</span>
            <div
              className="grid flex-1 gap-1"
              style={{
                gridTemplateColumns: `repeat(${row.bits.length}, minmax(0, 1fr))`,
                // Cap columns to a compact fixed budget per bit so rows stay small and dense
                // rather than stretching to fill the left column's full width.
                maxWidth: `${row.bits.length * 1.75}rem`,
              }}
            >
              {row.bits.map((bit) => {
                const isSet = ((displayValue >> BigInt(bit)) & 1n) === 1n;
                return (
                  <button
                    key={bit}
                    type="button"
                    onClick={() => toggleBit(bit)}
                    aria-label={`Bit ${bit}, ${isSet ? 'set' : 'clear'}, click to toggle`}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded font-mono text-[0.6rem] font-semibold transition-colors',
                      isSet
                        ? 'bg-[var(--accent-math)] text-[var(--on-accent-math)]'
                        : 'bg-surface-muted text-muted hover:text-foreground',
                    )}
                  >
                    {isSet ? 1 : 0}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex w-full justify-center',
        isFullscreen && 'bg-background h-full items-center overflow-y-auto p-6',
      )}
    >
      <div className="grid w-full max-w-[92rem] grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-2">
          <div className="border-border bg-surface rounded-2xl border p-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <span className="text-muted text-[0.65rem] font-semibold tracking-wide uppercase">
                Expression
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                spellCheck={false}
                value={calc.expression}
                onChange={(event) => {
                  calc.setExpression(
                    event.target.value,
                    event.target.selectionStart ?? event.target.value.length,
                  );
                }}
                onSelect={(event) => calc.setCursor(event.currentTarget.selectionStart ?? 0)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    calc.evaluate();
                  }
                }}
                placeholder="0"
                aria-label="Expression"
                className="text-foreground min-w-0 flex-1 bg-transparent font-mono text-base font-medium outline-none"
              />
              {calc.expression.length > 0 && (
                <button
                  type="button"
                  onClick={calc.clearAll}
                  aria-label="Clear expression"
                  className="text-muted hover:text-foreground shrink-0 rounded-full p-1"
                >
                  <Delete className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {resultPanel}
          {conversionCards}
          {historyPanel}
          {bitVisualization}
        </div>

        <aside className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <p className="text-foreground text-sm font-medium">Keypad</p>
            <button
              type="button"
              onClick={toggle}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
              className="border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground flex size-9 items-center justify-center rounded-full border transition-colors"
            >
              {isFullscreen ? (
                <Minimize2 className="size-4" aria-hidden />
              ) : (
                <Expand className="size-4" aria-hidden />
              )}
            </button>
          </div>

          <div className="border-border bg-surface flex flex-wrap items-start gap-x-4 gap-y-2 rounded-2xl border p-3">
            <SegmentedControl
              label="Number system"
              value={calc.numberSystem}
              onChange={calc.setNumberSystem}
              options={NUMBER_SYSTEMS.map((system) => ({ value: system, label: system }))}
            />
            <SegmentedControl
              label="Bit width"
              value={calc.bitWidth}
              onChange={calc.setBitWidth}
              options={BIT_WIDTHS.map((bw) => ({ value: bw, label: `${bw}` }))}
            />
            <SegmentedControl
              label="Signedness"
              value={calc.signed ? 'signed' : 'unsigned'}
              onChange={(value) => calc.setSigned(value === 'signed')}
              options={[
                { value: 'unsigned', label: 'Unsigned' },
                { value: 'signed', label: 'Signed' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-4 gap-1.5">
              {editKeys.map((keyDef) =>
                keyDef.id === 'backspace' ? (
                  <button
                    key={keyDef.id}
                    type="button"
                    onClick={keyDef.onPress}
                    aria-label={keyDef.ariaLabel}
                    className={cn(
                      'calc-key calc-key--control flex h-8 items-center justify-center rounded-lg sm:h-9',
                      pressedKey === keyDef.id && 'is-pressed',
                    )}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                  </button>
                ) : (
                  <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
                ),
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {bitwiseKeys.map((keyDef) => (
                <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {shiftKeys.map((keyDef) => (
                <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
              ))}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {hexKeys.map((keyDef) => (
                <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_4fr]">
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-1">
                {transformKeys.map((keyDef) => (
                  <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  {padKeys.map((keyDef) => (
                    <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flash('cursor-left');
                      calc.moveCursor(-1);
                      setFocusRequest((value) => value + 1);
                    }}
                    aria-label="Move cursor left"
                    className={cn(
                      'calc-key calc-key--control flex h-8 flex-1 items-center justify-center rounded-lg sm:h-9',
                      pressedKey === 'cursor-left' && 'is-pressed',
                    )}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flash('cursor-right');
                      calc.moveCursor(1);
                      setFocusRequest((value) => value + 1);
                    }}
                    aria-label="Move cursor right"
                    className={cn(
                      'calc-key calc-key--control flex h-8 flex-1 items-center justify-center rounded-lg sm:h-9',
                      pressedKey === 'cursor-right' && 'is-pressed',
                    )}
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flash('equals');
                      calc.evaluate();
                    }}
                    aria-label="Equals"
                    className={cn(
                      'calc-key calc-key--equals flex h-8 flex-[2] items-center justify-center rounded-lg text-base font-medium select-none sm:h-9',
                      pressedKey === 'equals' && 'is-pressed',
                    )}
                  >
                    =
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
