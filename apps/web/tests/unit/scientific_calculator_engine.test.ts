import { describe, expect, it } from 'vitest';
import { linearize } from '@/features/math/scientific_calculator/expression_tree';
import {
  calculatorReducer,
  evaluateExpression,
  formatExpressionForDisplay,
  formatResult,
  INITIAL_CALCULATOR_STATE,
  type CalculatorState,
} from '@/features/math/scientific_calculator/calculator_engine';

function press(state: CalculatorState, ...actions: Parameters<typeof calculatorReducer>[1][]) {
  return actions.reduce((current, action) => calculatorReducer(current, action), state);
}

function type(state: CalculatorState, text: string) {
  return calculatorReducer(state, { type: 'insert-text', text });
}

describe('evaluateExpression', () => {
  it('respects standard operator precedence and parentheses', () => {
    expect(evaluateExpression('2+3×4', 'DEG', 0)).toBe(14);
    expect(evaluateExpression('(2+3)×4', 'DEG', 0)).toBe(20);
  });

  it('evaluates trig functions in degree mode', () => {
    expect(evaluateExpression('sin(90)', 'DEG', 0)).toBeCloseTo(1, 10);
    expect(evaluateExpression('cos(0)', 'DEG', 0)).toBeCloseTo(1, 10);
  });

  it('evaluates trig functions in radian mode', () => {
    expect(evaluateExpression('sin(π÷2)', 'RAD', 0)).toBeCloseTo(1, 10);
  });

  it('evaluates the reciprocal trig functions', () => {
    expect(evaluateExpression('csc(90)', 'DEG', 0)).toBeCloseTo(1, 10);
    expect(evaluateExpression('sec(0)', 'DEG', 0)).toBeCloseTo(1, 10);
    expect(evaluateExpression('cot(45)', 'DEG', 0)).toBeCloseTo(1, 10);
  });

  it('forces a value to degrees with the ° suffix regardless of angle mode', () => {
    expect(evaluateExpression('sin(90°)', 'RAD', 0)).toBeCloseTo(1, 10);
  });

  it('evaluates logs, roots and powers', () => {
    expect(evaluateExpression('log(1000)', 'DEG', 0)).toBeCloseTo(3, 10);
    expect(evaluateExpression('ln(1)', 'DEG', 0)).toBe(0);
    expect(evaluateExpression('sqrt(144)', 'DEG', 0)).toBe(12);
    expect(evaluateExpression('2^3+4^2', 'DEG', 0)).toBe(24);
  });

  it('evaluates a log with a custom base via change of base', () => {
    expect(evaluateExpression('logbase(2,8)', 'DEG', 0)).toBeCloseTo(3, 10);
  });

  it('evaluates the nth root, exp, round and Euler constant', () => {
    expect(evaluateExpression('nthroot(3,27)', 'DEG', 0)).toBeCloseTo(3, 10);
    expect(evaluateExpression('exp(1)', 'DEG', 0)).toBeCloseTo(Math.E, 10);
    expect(evaluateExpression('round(4.6)', 'DEG', 0)).toBe(5);
    expect(evaluateExpression('e', 'DEG', 0)).toBeCloseTo(Math.E, 10);
    expect(evaluateExpression('e+1', 'DEG', 0)).toBeCloseTo(Math.E + 1, 10);
  });

  it('evaluates floor, ceil and modulo', () => {
    expect(evaluateExpression('floor(4.9)', 'DEG', 0)).toBe(4);
    expect(evaluateExpression('ceil(4.1)', 'DEG', 0)).toBe(5);
    expect(evaluateExpression('7 mod 3', 'DEG', 0)).toBe(1);
  });

  it('evaluates the infinity constant and a base ten power', () => {
    expect(evaluateExpression('∞', 'DEG', 0)).toBe(Infinity);
    expect(evaluateExpression('-∞', 'DEG', 0)).toBe(-Infinity);
    expect(evaluateExpression('(10)^(3)', 'DEG', 0)).toBe(1000);
  });

  it('evaluates rand as a number between 0 and 1', () => {
    const value = evaluateExpression('rand', 'DEG', 0);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it('recognizes the pretty inverse trig and eˣ glyphs typed by the keypad', () => {
    expect(evaluateExpression('sin⁻¹(1)', 'RAD', 0)).toBeCloseTo(Math.PI / 2, 10);
    expect(evaluateExpression('cos⁻¹(1)', 'RAD', 0)).toBe(0);
    expect(evaluateExpression('tan⁻¹(0)', 'RAD', 0)).toBe(0);
    expect(evaluateExpression('eˣ(1)', 'DEG', 0)).toBeCloseTo(Math.E, 10);
  });

  it('evaluates factorial, nCr and nPr, both as typed infix and as a function call', () => {
    expect(evaluateExpression('5!', 'DEG', 0)).toBe(120);
    expect(evaluateExpression('5 nCr 2', 'DEG', 0)).toBe(10);
    expect(evaluateExpression('5 nPr 2', 'DEG', 0)).toBe(20);
    expect(evaluateExpression('ncr(5,2)', 'DEG', 0)).toBe(10);
    expect(evaluateExpression('npr(5,2)', 'DEG', 0)).toBe(20);
  });

  it('sums a numeric series over the bound variable n', () => {
    expect(evaluateExpression('sum(1,10,n)', 'DEG', 0)).toBe(55);
    expect(evaluateExpression('sum(1,5,n^2)', 'DEG', 0)).toBe(55);
  });

  it('numerically integrates over the bound variable x', () => {
    expect(evaluateExpression('integral(0,1,x^2)', 'DEG', 0)).toBeCloseTo(1 / 3, 6);
    expect(evaluateExpression('integral(0,1,x)', 'DEG', 0)).toBeCloseTo(0.5, 6);
  });

  it('rejects a sum with an unreasonably large range instead of hanging', () => {
    expect(() => evaluateExpression('sum(1,999999,n)', 'DEG', 0)).toThrow();
  });

  it('treats an unbound single letter as an error rather than silently as zero', () => {
    expect(() => evaluateExpression('n+1', 'DEG', 0)).toThrow();
  });

  it('gives unary minus lower precedence than power, matching -2^2 = -4', () => {
    expect(evaluateExpression('-2^2', 'DEG', 0)).toBe(-4);
  });

  it('auto closes unmatched parentheses for a live preview', () => {
    expect(evaluateExpression('sin(0', 'DEG', 0)).toBe(0);
  });

  it('resolves Ans from the running answer', () => {
    expect(evaluateExpression('Ans+1', 'DEG', 41)).toBe(42);
  });

  it('throws on a malformed expression', () => {
    expect(() => evaluateExpression('5+', 'DEG', 0)).toThrow();
  });
});

describe('formatExpressionForDisplay', () => {
  it('renders constants with their proper glyphs', () => {
    expect(formatExpressionForDisplay('π+φ')).toBe('π+φ');
  });

  it('renders abs as matching pipes', () => {
    expect(formatExpressionForDisplay('abs(5)+abs(3)')).toBe('|5|+|3|');
  });

  it('spaces out the word operators', () => {
    expect(formatExpressionForDisplay('5mod2')).toBe('5 mod 2');
  });

  it('falls back to the raw text when it cannot be tokenized', () => {
    expect(formatExpressionForDisplay('5@2')).toBe('5@2');
  });
});

describe('formatResult', () => {
  it('rounds off floating point noise', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
  });

  it('reports Error for NaN but renders infinity as the infinity symbol', () => {
    expect(formatResult(NaN)).toBe('Error');
    expect(formatResult(Infinity)).toBe('∞');
    expect(formatResult(-Infinity)).toBe('-∞');
  });
});

describe('calculatorReducer', () => {
  it('builds an expression by inserting at the cursor and commits history on equals', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '5');
    state = type(state, '+');
    state = type(state, '3');
    state = press(state, { type: 'equals' });
    expect(linearize(state.history[0]!.expression)).toBe('5+3');
    expect(state.history[0]).toMatchObject({ result: '8' });
    expect(state.root).toEqual([]);
    expect(state.ans).toBe(8);
  });

  it('inserts text at the cursor position, not just at the end', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '15');
    state = press(state, { type: 'move-cursor', direction: -1 });
    state = type(state, '+');
    expect(linearize(state.root)).toBe('1+5');
  });

  it('opens a clickable x^y template with an editable base and exponent', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '2');
    state = press(state, { type: 'insert-template', kind: 'power' });
    expect(state.focus).toEqual([{ itemIndex: 0, key: 'exponent' }]);
    state = type(state, '5');
    expect(linearize(state.root)).toBe('(2)^(5)');
    expect(evaluateExpression(linearize(state.root), 'DEG', 0)).toBe(32);
  });

  it('opens a base ten power template with a fixed base and editable exponent', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'insert-template', kind: 'power', baseText: '10' });
    expect(state.focus).toEqual([{ itemIndex: 0, key: 'exponent' }]);
    state = type(state, '3');
    expect(linearize(state.root)).toBe('(10)^(3)');
    expect(evaluateExpression(linearize(state.root), 'DEG', 0)).toBe(1000);
  });

  it('lets a click focus directly into a specific slot', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '2');
    state = press(state, { type: 'insert-template', kind: 'power' });
    state = press(state, { type: 'focus-slot', path: [{ itemIndex: 0, key: 'base' }], cursor: 0 });
    state = type(state, '9');
    expect(linearize(state.root)).toBe('(92)^(0)');
  });

  it('opens an nth root template and evaluates once both boxes are filled', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'insert-template', kind: 'nthroot' });
    expect(state.focus).toEqual([{ itemIndex: 0, key: 'index' }]);
    state = type(state, '3');
    state = press(state, { type: 'focus-slot', path: [{ itemIndex: 0, key: 'radicand' }], cursor: 0 });
    state = type(state, '27');
    expect(linearize(state.root)).toBe('nthroot(3,27)');
    expect(evaluateExpression(linearize(state.root), 'DEG', 0)).toBeCloseTo(3, 10);
  });

  it('opens a clickable nCr template with separate n and r boxes', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'insert-template', kind: 'ncr' });
    expect(state.focus).toEqual([{ itemIndex: 0, key: 'n' }]);
    state = type(state, '5');
    state = press(state, { type: 'focus-slot', path: [{ itemIndex: 0, key: 'r' }], cursor: 0 });
    state = type(state, '2');
    expect(linearize(state.root)).toBe('ncr(5,2)');
    expect(evaluateExpression(linearize(state.root), 'DEG', 0)).toBe(10);
  });

  it('opens a fraction template and evaluates once both boxes are filled', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'insert-template', kind: 'fraction' });
    state = type(state, '3');
    state = press(state, { type: 'focus-slot', path: [{ itemIndex: 0, key: 'denominator' }], cursor: 0 });
    state = type(state, '4');
    expect(evaluateExpression(linearize(state.root), 'DEG', 0)).toBe(0.75);
  });

  it('opens a summation template and evaluates the numeric series', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'insert-template', kind: 'sum' });
    state = type(state, '1');
    state = press(state, { type: 'focus-slot', path: [{ itemIndex: 0, key: 'to' }], cursor: 0 });
    state = type(state, '10');
    state = press(state, { type: 'focus-slot', path: [{ itemIndex: 0, key: 'body' }], cursor: 0 });
    state = press(state, { type: 'insert-text', text: 'n' });
    expect(evaluateExpression(linearize(state.root), 'DEG', 0)).toBe(55);
  });

  it('backspaces a whole function token in one step', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, 'sin(');
    state = press(state, { type: 'backspace' });
    expect(state.root).toEqual([]);
  });

  it('shows an error on equals for a malformed expression and recovers on clear', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '5+');
    state = press(state, { type: 'equals' });
    expect(state.errorMessage).toBe('Error');
    state = press(state, { type: 'clear-all' });
    expect(state.errorMessage).toBeNull();
    expect(state.root).toEqual([]);
  });

  it('supports undo and redo of edits', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '1');
    state = type(state, '2');
    state = press(state, { type: 'undo' });
    expect(linearize(state.root)).toBe('1');
    state = press(state, { type: 'redo' });
    expect(linearize(state.root)).toBe('12');
  });

  it('toggles angle mode', () => {
    let state = INITIAL_CALCULATOR_STATE;
    expect(state.angleMode).toBe('DEG');
    state = press(state, { type: 'toggle-angle-mode' });
    expect(state.angleMode).toBe('RAD');
  });

  it('toggles the sign of only the number nearest the cursor, not the whole expression', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = type(state, '5+3');
    state = press(state, { type: 'toggle-sign' });
    expect(linearize(state.root)).toBe('5+-3');
    state = press(state, { type: 'toggle-sign' });
    expect(linearize(state.root)).toBe('5+3');
  });

  it('inserts a leading minus when toggling sign with nothing before the cursor', () => {
    let state = INITIAL_CALCULATOR_STATE;
    state = press(state, { type: 'toggle-sign' });
    expect(linearize(state.root)).toBe('-');
    state = press(state, { type: 'toggle-sign' });
    expect(linearize(state.root)).toBe('');
  });
});
