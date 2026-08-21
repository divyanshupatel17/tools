'use client';

import { useRef, useState } from 'react';
import { Expand, History as HistoryIcon, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCalculator } from './use_calculator';
import { useCalculatorFullscreen } from './use_calculator_fullscreen';

type KeyVariant = 'digit' | 'function' | 'operator' | 'equals';

interface KeyDef {
  id: string;
  label: string;
  ariaLabel?: string;
  variant: KeyVariant;
  onPress: () => void;
}

function CalcKey({ keyDef, pressed }: { keyDef: KeyDef; pressed: boolean }) {
  return (
    <button
      type="button"
      onClick={keyDef.onPress}
      aria-label={keyDef.ariaLabel ?? keyDef.label}
      className={cn(
        'calc-key',
        `calc-key--${keyDef.variant}`,
        pressed && 'is-pressed',
        'flex h-16 items-center justify-center rounded-2xl text-2xl font-medium select-none sm:h-20 sm:text-3xl',
      )}
    >
      {keyDef.label}
    </button>
  );
}

/** Shrinks the main display's type size once the expression gets long enough to wrap. */
function mainDisplayClass(display: string): string {
  if (display.length > 28) return 'text-xl sm:text-2xl';
  if (display.length > 18) return 'text-2xl sm:text-3xl';
  if (display.length > 11) return 'text-3xl sm:text-4xl';
  return 'text-4xl sm:text-5xl';
}

export function CalculatorWorkspace() {
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

  const keys: KeyDef[] = [
    { id: 'clear', label: 'AC', ariaLabel: 'All clear', variant: 'function', onPress: calc.pressClear },
    {
      id: 'backspace',
      label: '⌫',
      ariaLabel: 'Backspace',
      variant: 'function',
      onPress: calc.pressBackspace,
    },
    { id: 'percent', label: '%', ariaLabel: 'Percent', variant: 'function', onPress: calc.pressPercent },
    {
      id: 'op-÷',
      label: '÷',
      ariaLabel: 'Divide',
      variant: 'operator',
      onPress: () => calc.pressOperator('÷'),
    },

    { id: 'digit-7', label: '7', variant: 'digit', onPress: () => calc.pressDigit('7') },
    { id: 'digit-8', label: '8', variant: 'digit', onPress: () => calc.pressDigit('8') },
    { id: 'digit-9', label: '9', variant: 'digit', onPress: () => calc.pressDigit('9') },
    {
      id: 'op-×',
      label: '×',
      ariaLabel: 'Multiply',
      variant: 'operator',
      onPress: () => calc.pressOperator('×'),
    },

    { id: 'digit-4', label: '4', variant: 'digit', onPress: () => calc.pressDigit('4') },
    { id: 'digit-5', label: '5', variant: 'digit', onPress: () => calc.pressDigit('5') },
    { id: 'digit-6', label: '6', variant: 'digit', onPress: () => calc.pressDigit('6') },
    {
      id: 'op--',
      label: '-',
      ariaLabel: 'Subtract',
      variant: 'operator',
      onPress: () => calc.pressOperator('-'),
    },

    { id: 'digit-1', label: '1', variant: 'digit', onPress: () => calc.pressDigit('1') },
    { id: 'digit-2', label: '2', variant: 'digit', onPress: () => calc.pressDigit('2') },
    { id: 'digit-3', label: '3', variant: 'digit', onPress: () => calc.pressDigit('3') },
    {
      id: 'op-+',
      label: '+',
      ariaLabel: 'Add',
      variant: 'operator',
      onPress: () => calc.pressOperator('+'),
    },

    { id: 'sign', label: '±', ariaLabel: 'Toggle sign', variant: 'function', onPress: calc.pressToggleSign },
    { id: 'digit-0', label: '0', variant: 'digit', onPress: () => calc.pressDigit('0') },
    {
      id: 'decimal',
      label: '.',
      ariaLabel: 'Decimal point',
      variant: 'digit',
      onPress: calc.pressDecimal,
    },
    { id: 'equals', label: '=', ariaLabel: 'Equals', variant: 'equals', onPress: calc.pressEquals },
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
              <p className="text-right text-xs break-words whitespace-normal text-muted">{entry.expression} =</p>
              <p className="text-right text-lg font-medium break-words whitespace-normal text-foreground">
                {entry.result}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex w-full justify-center',
        isFullscreen && 'h-full items-center bg-background p-6',
      )}
    >
      <div
        className={cn(
          'flex w-full max-w-md flex-col gap-4',
          showHistory && 'lg:grid lg:max-w-4xl lg:grid-cols-2 lg:items-stretch lg:gap-6',
        )}
      >
        {showHistory && <div className="order-2 lg:order-1">{historyPanel}</div>}

        <div className="order-1 flex w-full flex-col gap-4 lg:order-2">
          <div className="flex items-center justify-between">
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
              {isFullscreen ? (
                <Minimize2 className="size-4" aria-hidden />
              ) : (
                <Expand className="size-4" aria-hidden />
              )}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 text-right shadow-[var(--shadow-card)]">
            <p className="h-5 truncate text-sm text-muted">{calc.preview ?? ' '}</p>
            <p
              className={cn(
                'mt-1 break-words whitespace-normal font-semibold tracking-tight text-foreground',
                mainDisplayClass(calc.display),
              )}
            >
              {calc.display}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 sm:gap-4">
            {keys.map((keyDef) => (
              <CalcKey key={keyDef.id} keyDef={keyDef} pressed={pressedKey === keyDef.id} />
            ))}
          </div>

          <p className="text-center text-xs text-muted">
            Type numbers and operators, Enter for equals, Escape to clear.
          </p>
        </div>
      </div>
    </div>
  );
}
