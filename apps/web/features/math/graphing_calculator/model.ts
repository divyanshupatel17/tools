import { compileFormula, RESERVED_NAMES, type Scope } from './parser';

/** Desmos-like hues, picked to read clearly against both true black and paper backgrounds. */
export const PALETTE = [
  '#c74440',
  '#2d70b3',
  '#388c46',
  '#6042a6',
  '#fa7e19',
  '#0d8a8a',
  '#e0559c',
  '#b09a1e',
] as const;

export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length] as string;
}

export type Comparator = '<' | '<=' | '>' | '>=';

export interface FunctionYRow {
  type: 'function-y';
  evaluate: (x: number, params: Scope) => number;
}
export interface FunctionXRow {
  type: 'function-x';
  evaluate: (y: number, params: Scope) => number;
}
export interface ImplicitRow {
  type: 'implicit';
  evaluate: (x: number, y: number, params: Scope) => number;
}
export interface InequalityRow {
  type: 'inequality';
  comparator: Comparator;
  evaluate: (x: number, y: number, params: Scope) => number;
}
export interface PointRow {
  type: 'point';
  x: number;
  y: number;
}
export interface SliderRow {
  type: 'slider';
  paramName: string;
  value: number;
  declaredDefault: number;
}
export interface EmptyRow {
  type: 'empty';
}
export interface ErrorRow {
  type: 'error';
  message: string;
}

export type ClassifiedRow = FunctionYRow | FunctionXRow | ImplicitRow | InequalityRow | PointRow | SliderRow | EmptyRow | ErrorRow;

export interface RowInput {
  id: string;
  raw: string;
}

export interface RowResult {
  id: string;
  raw: string;
  row: ClassifiedRow;
}

/** Finds the first top-level (paren-depth 0) relational operator, longest match first. */
export function splitRelation(text: string): { left: string; op: '=' | Comparator; right: string } | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth !== 0) continue;
    const two = text.slice(i, i + 2);
    if (two === '<=' || two === '>=') {
      return { left: text.slice(0, i), op: two, right: text.slice(i + 2) };
    }
    if (ch === '=' || ch === '<' || ch === '>') {
      return { left: text.slice(0, i), op: ch, right: text.slice(i + 1) };
    }
  }
  return null;
}

/** Splits `(a, b)` into its two top-level comma separated parts, honouring nested parens. */
function splitPoint(inner: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      const rest = inner.slice(i + 1);
      if (rest.includes(',')) return null; // more than one top-level comma: not a 2D point
      return [inner.slice(0, i), rest];
    }
  }
  return null;
}

function variablesOutsideParams(variables: ReadonlySet<string>, paramNames: ReadonlySet<string>, extra: string[]): string[] {
  return [...variables].filter((name) => !paramNames.has(name) && !extra.includes(name));
}

/**
 * Classifies one raw input row given the parameter values every earlier slider row has already
 * defined. Order matters: a row can only reference a slider declared above it, matching Desmos.
 */
export function classifyRow(raw: string, params: Scope): ClassifiedRow {
  const trimmed = raw.trim();
  if (trimmed === '') return { type: 'empty' };

  try {
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      const point = splitPoint(trimmed.slice(1, -1));
      if (point) {
        const [xSrc, ySrc] = point;
        const xFormula = compileFormula(xSrc);
        const yFormula = compileFormula(ySrc);
        const paramNames = new Set(Object.keys(params));
        const badX = variablesOutsideParams(xFormula.variables, paramNames, []);
        const badY = variablesOutsideParams(yFormula.variables, paramNames, []);
        if (badX.length === 0 && badY.length === 0) {
          return { type: 'point', x: xFormula.evaluate(params), y: yFormula.evaluate(params) };
        }
      }
    }

    const relation = splitRelation(trimmed);
    if (!relation) {
      const formula = compileFormula(trimmed);
      return { type: 'function-y', evaluate: (x, extraParams) => formula.evaluate({ ...extraParams, x }) };
    }

    const leftTrim = relation.left.trim();
    const paramNames = new Set(Object.keys(params));

    if (relation.op === '=') {
      const isBareIdentifier = /^[A-Za-z][A-Za-z0-9]*$/.test(leftTrim) && !RESERVED_NAMES.has(leftTrim);
      if (isBareIdentifier && leftTrim !== 'x' && leftTrim !== 'y') {
        const rightFormula = compileFormula(relation.right);
        const stray = variablesOutsideParams(rightFormula.variables, paramNames, [leftTrim]);
        if (stray.length === 0) {
          return { type: 'slider', paramName: leftTrim, value: rightFormula.evaluate(params), declaredDefault: rightFormula.evaluate(params) };
        }
      }
      if (leftTrim === 'y') {
        const rightFormula = compileFormula(relation.right);
        return { type: 'function-y', evaluate: (x, extraParams) => rightFormula.evaluate({ ...extraParams, x }) };
      }
      if (leftTrim === 'x') {
        const rightFormula = compileFormula(relation.right);
        return { type: 'function-x', evaluate: (y, extraParams) => rightFormula.evaluate({ ...extraParams, y }) };
      }
      const leftFormula = compileFormula(relation.left);
      const rightFormula = compileFormula(relation.right);
      return {
        type: 'implicit',
        evaluate: (x, y, extraParams) => leftFormula.evaluate({ ...extraParams, x, y }) - rightFormula.evaluate({ ...extraParams, x, y }),
      };
    }

    const leftFormula = compileFormula(relation.left);
    const rightFormula = compileFormula(relation.right);
    return {
      type: 'inequality',
      comparator: relation.op,
      evaluate: (x, y, extraParams) => leftFormula.evaluate({ ...extraParams, x, y }) - rightFormula.evaluate({ ...extraParams, x, y }),
    };
  } catch (error) {
    return { type: 'error', message: error instanceof Error ? error.message : 'Could not parse this expression' };
  }
}

/**
 * Classifies every row in order, threading each slider's live value (falling back to its
 * declared default the first time it appears) into `params` for the rows below it to use.
 */
export function buildGraphModel(rows: RowInput[], sliderValues: Readonly<Record<string, number>>): RowResult[] {
  const params: Record<string, number> = {};
  const results: RowResult[] = [];
  for (const row of rows) {
    const classified = classifyRow(row.raw, params);
    if (classified.type === 'slider') {
      const value = sliderValues[row.id] ?? classified.value;
      params[classified.paramName] = value;
      results.push({ id: row.id, raw: row.raw, row: { ...classified, value } });
    } else {
      results.push({ id: row.id, raw: row.raw, row: classified });
    }
  }
  return results;
}

export function defaultSliderRange(value: number): { min: number; max: number; step: number } {
  const magnitude = Math.max(Math.abs(value), 1);
  const bound = magnitude <= 10 ? 10 : Math.ceil(magnitude * 2);
  return { min: -bound, max: bound, step: bound >= 100 ? 1 : 0.1 };
}
