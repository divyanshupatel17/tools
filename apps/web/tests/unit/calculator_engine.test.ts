import { describe, expect, it } from 'vitest';
import {
  calculatorReducer,
  evaluateTokens,
  expressionDisplay,
  formatNumberToken,
  formatResultForStorage,
  getMainDisplay,
  INITIAL_CALCULATOR_STATE,
  type CalculatorState,
} from '@/features/math/calculator/calculator_engine';

function press(state: CalculatorState, ...actions: Parameters<typeof calculatorReducer>[1][]) {
  return actions.reduce((current, action) => calculatorReducer(current, action), state);
}

describe('evaluateTokens', () => {
  it('gives multiply and divide precedence over add and subtract', () => {
    expect(evaluateTokens(['2', '+', '3', '×', '4'])).toBe(14);
    expect(evaluateTokens(['10', '-', '4', '÷', '2'])).toBe(8);
  });

  it('runs same-precedence operators left to right', () => {
    expect(evaluateTokens(['10', '-', '2', '-', '3'])).toBe(5);
    expect(evaluateTokens(['8', '÷', '2', '×', '2'])).toBe(8);
  });

  it('returns 0 for an empty token list', () => {
    expect(evaluateTokens([])).toBe(0);
  });
});

describe('formatNumberToken', () => {
  it('adds thousands separators to the integer part only', () => {
    expect(formatNumberToken('1234567')).toBe('1,234,567');
    expect(formatNumberToken('1234.5')).toBe('1,234.5');
  });

  it('keeps a trailing decimal point while typing', () => {
    expect(formatNumberToken('12.')).toBe('12.');
  });

  it('preserves a leading negative sign', () => {
    expect(formatNumberToken('-1500')).toBe('-1,500');
  });
});

describe('formatResultForStorage', () => {
  it('rounds off floating point noise', () => {
    expect(formatResultForStorage(0.1 + 0.2)).toBe('0.3');
  });

  it('reports Error for a non finite result', () => {
    expect(formatResultForStorage(Infinity)).toBe('Error');
    expect(formatResultForStorage(NaN)).toBe('Error');
  });
});

describe('calculatorReducer', () => {
  it('builds an expression and evaluates it on equals', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(
      state,
      { type: 'digit', digit: '2' },
      { type: 'operator', operator: '+' },
      { type: 'digit', digit: '3' },
      { type: 'operator', operator: '×' },
      { type: 'digit', digit: '4' },
      { type: 'equals' },
    );
    expect(getMainDisplay(state)).toBe('14');
    expect(state.history[0]).toMatchObject({ expression: '2 + 3 × 4', result: '14' });
  });

  it('starts a fresh number after equals instead of appending', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'digit', digit: '5' }, { type: 'equals' }, { type: 'digit', digit: '7' });
    expect(getMainDisplay(state)).toBe('7');
  });

  it('replaces a trailing operator instead of stacking them', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(
      state,
      { type: 'digit', digit: '9' },
      { type: 'operator', operator: '+' },
      { type: 'operator', operator: '×' },
      { type: 'digit', digit: '2' },
      { type: 'equals' },
    );
    expect(getMainDisplay(state)).toBe('18');
  });

  it('backspaces a digit at a time, then the operator', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'digit', digit: '1' }, { type: 'digit', digit: '2' }, { type: 'operator', operator: '+' });
    state = press(state, { type: 'backspace' });
    expect(expressionDisplay(state.tokens)).toBe('12');
    state = press(state, { type: 'backspace' });
    expect(expressionDisplay(state.tokens)).toBe('1');
  });

  it('toggles the sign and applies percent to the current entry', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'digit', digit: '5' }, { type: 'toggle-sign' });
    expect(expressionDisplay(state.tokens)).toBe('-5');
    state = press(state, { type: 'toggle-sign' }, { type: 'percent' });
    expect(expressionDisplay(state.tokens)).toBe('0.05');
  });

  it('shows Error on divide by zero and recovers on the next digit', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'digit', digit: '5' }, { type: 'operator', operator: '÷' }, { type: 'digit', digit: '0' }, { type: 'equals' });
    expect(getMainDisplay(state)).toBe('Error');
    state = press(state, { type: 'digit', digit: '3' });
    expect(getMainDisplay(state)).toBe('3');
  });

  it('clears everything on clear', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'digit', digit: '9' }, { type: 'clear' });
    expect(getMainDisplay(state)).toBe('0');
  });
});
