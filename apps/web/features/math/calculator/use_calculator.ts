'use client';

import { useCallback, useEffect, useReducer } from 'react';
import {
  calculatorReducer,
  INITIAL_CALCULATOR_STATE,
  getMainDisplay,
  type CalculatorOperator,
} from './calculator_engine';

const KEY_TO_OPERATOR: Record<string, CalculatorOperator> = {
  '+': '+',
  '-': '-',
  '*': '×',
  '/': '÷',
};

interface UseCalculatorOptions {
  /** Fired with a key id (matching the on screen keypad) on every action, mouse or keyboard. */
  onActivity?: (keyId: string) => void;
}

export function useCalculator({ onActivity }: UseCalculatorOptions = {}) {
  const [state, dispatch] = useReducer(calculatorReducer, INITIAL_CALCULATOR_STATE);

  const pressDigit = useCallback(
    (digit: string) => {
      onActivity?.(`digit-${digit}`);
      dispatch({ type: 'digit', digit });
    },
    [onActivity],
  );
  const pressDecimal = useCallback(() => {
    onActivity?.('decimal');
    dispatch({ type: 'decimal' });
  }, [onActivity]);
  const pressOperator = useCallback(
    (operator: CalculatorOperator) => {
      onActivity?.(`op-${operator}`);
      dispatch({ type: 'operator', operator });
    },
    [onActivity],
  );
  const pressEquals = useCallback(() => {
    onActivity?.('equals');
    dispatch({ type: 'equals' });
  }, [onActivity]);
  const pressClear = useCallback(() => {
    onActivity?.('clear');
    dispatch({ type: 'clear' });
  }, [onActivity]);
  const pressBackspace = useCallback(() => {
    onActivity?.('backspace');
    dispatch({ type: 'backspace' });
  }, [onActivity]);
  const pressToggleSign = useCallback(() => {
    onActivity?.('sign');
    dispatch({ type: 'toggle-sign' });
  }, [onActivity]);
  const pressPercent = useCallback(() => {
    onActivity?.('percent');
    dispatch({ type: 'percent' });
  }, [onActivity]);
  const clearHistory = useCallback(() => dispatch({ type: 'clear-history' }), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (event.key >= '0' && event.key <= '9') {
        pressDigit(event.key);
        return;
      }
      if (event.key === '.') {
        pressDecimal();
        return;
      }
      const operator = KEY_TO_OPERATOR[event.key];
      if (operator) {
        pressOperator(operator);
        return;
      }
      if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault();
        pressEquals();
        return;
      }
      if (event.key === 'Backspace') {
        pressBackspace();
        return;
      }
      if (event.key === 'Escape') {
        pressClear();
        return;
      }
      if (event.key === '%') {
        pressPercent();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pressDigit, pressDecimal, pressOperator, pressEquals, pressBackspace, pressClear, pressPercent]);

  return {
    display: getMainDisplay(state),
    preview: state.preview,
    history: state.history,
    pressDigit,
    pressDecimal,
    pressOperator,
    pressEquals,
    pressClear,
    pressBackspace,
    pressToggleSign,
    pressPercent,
    clearHistory,
  };
}
