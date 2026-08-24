import { describe, expect, it } from 'vitest';
import {
  backspaceAt,
  charsOf,
  insertTemplate,
  insertText,
  linearize,
  moveCursorAt,
  type Slot,
} from '@/features/math/scientific_calculator/expression_tree';

describe('insertText', () => {
  it('inserts characters at the cursor and advances it', () => {
    const first = insertText([], [], 0, '12');
    expect(linearize(first.root)).toBe('12');
    expect(first.cursor).toBe(2);

    const second = insertText(first.root, [], 1, '.');
    expect(linearize(second.root)).toBe('1.2');
    expect(second.cursor).toBe(2);
  });
});

describe('insertTemplate power', () => {
  it('wraps the preceding number as the base and focuses the empty exponent', () => {
    const typed = insertText([], [], 0, '5');
    const powered = insertTemplate(typed.root, [], typed.cursor, 'power');
    expect(linearize(powered.root)).toBe('(5)^(0)');
    expect(powered.focus).toEqual([{ itemIndex: 0, key: 'exponent' }]);
    expect(powered.cursor).toBe(0);
  });

  it('leaves an empty, clickable base when nothing precedes the cursor', () => {
    const powered = insertTemplate([], [], 0, 'power');
    expect(linearize(powered.root)).toBe('(0)^(0)');
    expect(powered.focus).toEqual([{ itemIndex: 0, key: 'base' }]);
  });

  it('prefills a fixed exponent (square) and does not steal focus', () => {
    const typed = insertText([], [], 0, '9');
    const squared = insertTemplate(typed.root, [], typed.cursor, 'power', { exponentText: '2' });
    expect(linearize(squared.root)).toBe('(9)^(2)');
    expect(squared.focus).toEqual([]);
    expect(squared.cursor).toBe(1);
  });

  it('wraps a parenthesized group as the base, including a leading function name', () => {
    const typed = insertText([], [], 0, 'sin(30)');
    const powered = insertTemplate(typed.root, [], typed.cursor, 'power');
    expect(linearize(powered.root)).toBe('(sin(30))^(0)');
  });
});

describe('insertTemplate root', () => {
  it('inserts a plain root with a single empty radicand', () => {
    const root = insertTemplate([], [], 0, 'root');
    expect(linearize(root.root)).toBe('sqrt(0)');
    expect(root.focus).toEqual([{ itemIndex: 0, key: 'radicand' }]);
  });

  it('inserts an nth root with both an empty index and radicand, focusing the index first', () => {
    const root = insertTemplate([], [], 0, 'nthroot');
    expect(linearize(root.root)).toBe('nthroot(2,0)');
    expect(root.focus).toEqual([{ itemIndex: 0, key: 'index' }]);
  });

  it('is directly fillable by typing into the focused index and radicand slots', () => {
    const templated = insertTemplate([], [], 0, 'nthroot');
    const indexFilled = insertText(templated.root, templated.focus, templated.cursor, '3');
    const radicandFocus = [{ itemIndex: 0, key: 'radicand' as const }];
    const radicandFilled = insertText(indexFilled.root, radicandFocus, 0, '27');
    expect(linearize(radicandFilled.root)).toBe('nthroot(3,27)');
  });
});

describe('insertTemplate fraction, logbase, sum and integral', () => {
  it('inserts an empty fraction focusing the numerator first', () => {
    const result = insertTemplate([], [], 0, 'fraction');
    expect(linearize(result.root)).toBe('(0)÷(1)');
    expect(result.focus).toEqual([{ itemIndex: 0, key: 'numerator' }]);
  });

  it('inserts a log with a custom base, focusing the base first', () => {
    const result = insertTemplate([], [], 0, 'logbase');
    expect(linearize(result.root)).toBe('logbase(10,0)');
    expect(result.focus).toEqual([{ itemIndex: 0, key: 'base' }]);
  });

  it('inserts a summation focusing the lower bound first', () => {
    const result = insertTemplate([], [], 0, 'sum');
    expect(linearize(result.root)).toBe('sum(0,0,0)');
    expect(result.focus).toEqual([{ itemIndex: 0, key: 'from' }]);
  });

  it('inserts an integral focusing the lower bound first', () => {
    const result = insertTemplate([], [], 0, 'integral');
    expect(linearize(result.root)).toBe('integral(0,0,0)');
    expect(result.focus).toEqual([{ itemIndex: 0, key: 'from' }]);
  });

  it('inserts nCr and nPr with separate clickable n and r boxes, focusing n first', () => {
    const ncr = insertTemplate([], [], 0, 'ncr');
    expect(linearize(ncr.root)).toBe('ncr(0,0)');
    expect(ncr.focus).toEqual([{ itemIndex: 0, key: 'n' }]);

    const npr = insertTemplate([], [], 0, 'npr');
    expect(linearize(npr.root)).toBe('npr(0,0)');
    expect(npr.focus).toEqual([{ itemIndex: 0, key: 'n' }]);
  });
});

describe('backspaceAt', () => {
  it('removes one character at a time within a slot', () => {
    const typed = insertText([], [], 0, '12');
    const result = backspaceAt(typed.root, [], typed.cursor);
    expect(linearize(result.root)).toBe('1');
    expect(result.cursor).toBe(1);
  });

  it('removes a whole function opener in one step', () => {
    const typed = insertText([], [], 0, 'sin(');
    const result = backspaceAt(typed.root, [], typed.cursor);
    expect(linearize(result.root)).toBe('');
  });

  it('deletes an entirely empty power template in one step from either child slot', () => {
    const powered = insertTemplate([], [], 0, 'power');
    const result = backspaceAt(powered.root, powered.focus, powered.cursor);
    expect(linearize(result.root)).toBe('');
    expect(result.focus).toEqual([]);
  });

  it('steps back from an empty exponent into a filled base instead of deleting it', () => {
    const typed = insertText([], [], 0, '5');
    const powered = insertTemplate(typed.root, [], typed.cursor, 'power');
    const result = backspaceAt(powered.root, powered.focus, powered.cursor);
    expect(linearize(result.root)).toBe('(5)^(0)');
    expect(result.focus).toEqual([{ itemIndex: 0, key: 'base' }]);
    expect(result.cursor).toBe(1);
  });

  it('steps back through a three slot sum template from body to to to from', () => {
    const sum = insertTemplate([], [], 0, 'sum');
    const filledFrom = insertText(sum.root, sum.focus, sum.cursor, '1');
    const toFocus = [{ itemIndex: 0, key: 'body' as const }];
    const result = backspaceAt(filledFrom.root, toFocus, 0);
    expect(result.focus).toEqual([{ itemIndex: 0, key: 'from' }]);
    expect(result.cursor).toBe(1);
  });
});

describe('moveCursorAt', () => {
  it('enters a power item on the way in and exits on the way out', () => {
    const typed = insertText([], [], 0, '2');
    const powered = insertTemplate(typed.root, [], typed.cursor, 'power', { exponentText: '3' });
    const intoExponent = moveCursorAt(powered.root, [], 1, -1);
    expect(intoExponent.focus).toEqual([{ itemIndex: 0, key: 'exponent' }]);
    expect(intoExponent.cursor).toBe(1);

    const backOut = moveCursorAt(powered.root, intoExponent.focus, intoExponent.cursor, 1);
    expect(backOut.focus).toEqual([]);
    expect(backOut.cursor).toBe(1);
  });

  it('moves from a filled index into the radicand sibling instead of skipping past the whole item', () => {
    const templated = insertTemplate([], [], 0, 'nthroot');
    const indexFilled = insertText(templated.root, templated.focus, templated.cursor, '3');
    const moved = moveCursorAt(indexFilled.root, templated.focus, indexFilled.cursor, 1);
    expect(moved.focus).toEqual([{ itemIndex: 0, key: 'radicand' }]);
    expect(moved.cursor).toBe(0);
  });

  it('moves back from an empty radicand into the end of the index sibling', () => {
    const templated = insertTemplate([], [], 0, 'nthroot');
    const indexFilled = insertText(templated.root, templated.focus, templated.cursor, '3');
    const radicandFocus = [{ itemIndex: 0, key: 'radicand' as const }];
    const moved = moveCursorAt(indexFilled.root, radicandFocus, 0, -1);
    expect(moved.focus).toEqual([{ itemIndex: 0, key: 'index' }]);
    expect(moved.cursor).toBe(1);
  });

  it('walks a three slot sum template from, to, body with the right arrow, only exiting after the last', () => {
    const sum = insertTemplate([], [], 0, 'sum');
    const filledFrom = insertText(sum.root, sum.focus, sum.cursor, '0');
    const toFrom = moveCursorAt(filledFrom.root, sum.focus, filledFrom.cursor, 1);
    expect(toFrom.focus).toEqual([{ itemIndex: 0, key: 'to' }]);
    expect(toFrom.cursor).toBe(0);

    const toBody = moveCursorAt(filledFrom.root, toFrom.focus, toFrom.cursor, 1);
    expect(toBody.focus).toEqual([{ itemIndex: 0, key: 'body' }]);
    expect(toBody.cursor).toBe(0);

    const exited = moveCursorAt(filledFrom.root, toBody.focus, toBody.cursor, 1);
    expect(exited.focus).toEqual([]);
    expect(exited.cursor).toBe(1);
  });
});

describe('linearize', () => {
  it('serializes plain characters unchanged', () => {
    const slot: Slot = charsOf('2+3');
    expect(linearize(slot)).toBe('2+3');
  });

  it('only wraps the trailing number as the base, matching standard operator precedence', () => {
    const typed = insertText([], [], 0, '2+3');
    const powered = insertTemplate(typed.root, [], typed.cursor, 'power', { exponentText: '2' });
    expect(linearize(powered.root)).toBe('2+(3)^(2)');
  });
});
