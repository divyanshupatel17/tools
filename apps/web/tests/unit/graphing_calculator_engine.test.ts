import { describe, expect, it } from 'vitest';
import { compileFormula } from '@/features/math/graphing_calculator/parser';
import { buildGraphModel, classifyRow } from '@/features/math/graphing_calculator/model';

describe('compileFormula', () => {
  it('respects operator precedence and parentheses', () => {
    expect(compileFormula('2+3*4').evaluate({})).toBe(14);
    expect(compileFormula('(2+3)*4').evaluate({})).toBe(20);
  });

  it('supports implicit multiplication between numbers, variables and parentheses', () => {
    expect(compileFormula('2x').evaluate({ x: 3 })).toBe(6);
    expect(compileFormula('xy').evaluate({ x: 2, y: 5 })).toBe(10);
    expect(compileFormula('2(x+1)').evaluate({ x: 4 })).toBe(10);
    expect(compileFormula('(x+1)(x-1)').evaluate({ x: 3 })).toBe(8);
  });

  it('evaluates trig, inverse trig and hyperbolic functions', () => {
    expect(compileFormula('sin(pi/2)').evaluate({})).toBeCloseTo(1, 10);
    expect(compileFormula('arcsin(1)').evaluate({})).toBeCloseTo(Math.PI / 2, 10);
    expect(compileFormula('cosh(0)').evaluate({})).toBeCloseTo(1, 10);
  });

  it('evaluates log, exponent and root functions', () => {
    expect(compileFormula('log(100)').evaluate({})).toBeCloseTo(2, 10);
    expect(compileFormula('log(2,8)').evaluate({})).toBeCloseTo(3, 10);
    expect(compileFormula('sqrt(16)').evaluate({})).toBe(4);
    expect(compileFormula('nthroot(3,27)').evaluate({})).toBeCloseTo(3, 10);
  });

  it('evaluates number theory functions', () => {
    expect(compileFormula('gcd(12,18)').evaluate({})).toBe(6);
    expect(compileFormula('lcm(4,6)').evaluate({})).toBe(12);
    expect(compileFormula('ncr(5,2)').evaluate({})).toBe(10);
    expect(compileFormula('npr(5,2)').evaluate({})).toBe(20);
    expect(compileFormula('5!').evaluate({})).toBe(120);
    expect(compileFormula('floor(2.7)').evaluate({})).toBe(2);
  });

  it('produces NaN for domain errors instead of throwing', () => {
    expect(compileFormula('sqrt(x)').evaluate({ x: -4 })).toBeNaN();
    expect(compileFormula('ln(x)').evaluate({ x: -1 })).toBeNaN();
  });

  it('throws on malformed input', () => {
    expect(() => compileFormula('sin(')).toThrow();
    expect(() => compileFormula('')).toThrow();
  });
});

describe('classifyRow', () => {
  it('treats a bare expression as a function of x', () => {
    const row = classifyRow('sin(x)', {});
    expect(row.type).toBe('function-y');
  });

  it('treats y=... as a function of x', () => {
    const row = classifyRow('y=x^2+1', {});
    if (row.type !== 'function-y') throw new Error('expected function-y');
    expect(row.evaluate(2, {})).toBe(5);
  });

  it('treats x=... as a function of y', () => {
    const row = classifyRow('x=3', {});
    if (row.type !== 'function-x') throw new Error('expected function-x');
    expect(row.evaluate(0, {})).toBe(3);
  });

  it('treats a bare letter assignment with no free variables as a slider', () => {
    const row = classifyRow('a=3', {});
    if (row.type !== 'slider') throw new Error('expected slider');
    expect(row.paramName).toBe('a');
    expect(row.value).toBe(3);
  });

  it('treats a two variable equality as an implicit curve', () => {
    const row = classifyRow('x^2+y^2=4', {});
    if (row.type !== 'implicit') throw new Error('expected implicit');
    expect(row.evaluate(2, 0, {})).toBeCloseTo(0, 10);
    expect(row.evaluate(0, 0, {})).toBeCloseTo(-4, 10);
  });

  it('treats an inequality as a shaded region', () => {
    const row = classifyRow('y>x', {});
    if (row.type !== 'inequality') throw new Error('expected inequality');
    expect(row.comparator).toBe('>');
    expect(row.evaluate(0, 1, {})).toBeGreaterThan(0);
  });

  it('treats a parenthesised pair as a literal point', () => {
    const row = classifyRow('(2,3)', {});
    if (row.type !== 'point') throw new Error('expected point');
    expect(row.x).toBe(2);
    expect(row.y).toBe(3);
  });

  it('reports a parse error without throwing', () => {
    const row = classifyRow('sin(', {});
    expect(row.type).toBe('error');
  });

  it('lets a later row reference an earlier slider, in order', () => {
    const results = buildGraphModel(
      [
        { id: 'r1', raw: 'a=2' },
        { id: 'r2', raw: 'y=a*x' },
      ],
      {},
    );
    const [sliderResult, functionResult] = results;
    expect(sliderResult?.row.type).toBe('slider');
    if (functionResult?.row.type !== 'function-y') throw new Error('expected function-y');
    expect(functionResult.row.evaluate(3, { a: 2 })).toBe(6);
  });

  it('uses a live slider value over its declared default', () => {
    const results = buildGraphModel([{ id: 'r1', raw: 'a=2' }], { r1: 7 });
    const [sliderResult] = results;
    if (sliderResult?.row.type !== 'slider') throw new Error('expected slider');
    expect(sliderResult.row.value).toBe(7);
  });
});
