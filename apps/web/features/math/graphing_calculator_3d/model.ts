import { compileFormula, RESERVED_NAMES, type Scope } from '../graphing_calculator/parser';
import { colorForIndex, PALETTE, splitRelation, type Comparator } from '../graphing_calculator/model';

export { colorForIndex, PALETTE };
export type { Comparator };

/** Which variable a surface row solves for; the other two are its evaluate() inputs, in that order. */
export type SurfaceAxis = 'z' | 'y' | 'x';

export interface SurfaceRow {
  type: 'surface';
  axis: SurfaceAxis;
  /** For axis 'z': (x, y) -> z. For 'y': (x, z) -> y. For 'x': (y, z) -> x. */
  evaluate: (a: number, b: number, params: Scope) => number;
}
export interface Implicit3Row {
  type: 'implicit3';
  evaluate: (x: number, y: number, z: number, params: Scope) => number;
  /** Param names (outside x/y/z) this formula reads, so the canvas can skip re-marching when none changed. */
  dependsOn: ReadonlySet<string>;
}
export interface Inequality3Row {
  type: 'inequality3';
  comparator: Comparator;
  evaluate: (x: number, y: number, z: number, params: Scope) => number;
  dependsOn: ReadonlySet<string>;
}
export interface Point3Row {
  type: 'point3';
  x: number;
  y: number;
  z: number;
}
export interface Slider3Row {
  type: 'slider';
  paramName: string;
  value: number;
  declaredDefault: number;
}
export interface Empty3Row {
  type: 'empty';
}
export interface Error3Row {
  type: 'error';
  message: string;
}

export type ClassifiedRow3d = SurfaceRow | Implicit3Row | Inequality3Row | Point3Row | Slider3Row | Empty3Row | Error3Row;

export interface RowInput3d {
  id: string;
  raw: string;
}

export interface RowResult3d {
  id: string;
  raw: string;
  row: ClassifiedRow3d;
}

/** Splits `(a, b, c)` into its three top-level comma separated parts, honouring nested parens. */
function splitTriple(inner: string): [string, string, string] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts.length === 3 ? [parts[0] as string, parts[1] as string, parts[2] as string] : null;
}

function variablesOutsideParams(variables: ReadonlySet<string>, paramNames: ReadonlySet<string>, extra: string[]): string[] {
  return [...variables].filter((name) => !paramNames.has(name) && !extra.includes(name));
}

/**
 * Classifies one raw input row given the parameter values every earlier slider row has already
 * defined. Order matters: a row can only reference a slider declared above it, matching the 2D
 * Graphing Calculator's convention (`../graphing_calculator/model.ts`).
 */
export function classifyRow3d(raw: string, params: Scope): ClassifiedRow3d {
  const trimmed = raw.trim();
  if (trimmed === '') return { type: 'empty' };

  try {
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      const triple = splitTriple(trimmed.slice(1, -1));
      if (triple) {
        const [xSrc, ySrc, zSrc] = triple;
        const xFormula = compileFormula(xSrc);
        const yFormula = compileFormula(ySrc);
        const zFormula = compileFormula(zSrc);
        const paramNames = new Set(Object.keys(params));
        const stray = [
          ...variablesOutsideParams(xFormula.variables, paramNames, []),
          ...variablesOutsideParams(yFormula.variables, paramNames, []),
          ...variablesOutsideParams(zFormula.variables, paramNames, []),
        ];
        if (stray.length === 0) {
          return { type: 'point3', x: xFormula.evaluate(params), y: yFormula.evaluate(params), z: zFormula.evaluate(params) };
        }
      }
    }

    const relation = splitRelation(trimmed);
    if (!relation) {
      const formula = compileFormula(trimmed);
      return { type: 'surface', axis: 'z', evaluate: (x, y, extraParams) => formula.evaluate({ ...extraParams, x, y }) };
    }

    const leftTrim = relation.left.trim();
    const paramNames = new Set(Object.keys(params));

    if (relation.op === '=') {
      const isBareIdentifier = /^[A-Za-z][A-Za-z0-9]*$/.test(leftTrim) && !RESERVED_NAMES.has(leftTrim);
      if (isBareIdentifier && leftTrim !== 'x' && leftTrim !== 'y' && leftTrim !== 'z') {
        const rightFormula = compileFormula(relation.right);
        const stray = variablesOutsideParams(rightFormula.variables, paramNames, [leftTrim]);
        if (stray.length === 0) {
          return { type: 'slider', paramName: leftTrim, value: rightFormula.evaluate(params), declaredDefault: rightFormula.evaluate(params) };
        }
      }
      if (leftTrim === 'z') {
        const rightFormula = compileFormula(relation.right);
        return { type: 'surface', axis: 'z', evaluate: (x, y, extraParams) => rightFormula.evaluate({ ...extraParams, x, y }) };
      }
      if (leftTrim === 'y') {
        const rightFormula = compileFormula(relation.right);
        return { type: 'surface', axis: 'y', evaluate: (x, z, extraParams) => rightFormula.evaluate({ ...extraParams, x, z }) };
      }
      if (leftTrim === 'x') {
        const rightFormula = compileFormula(relation.right);
        return { type: 'surface', axis: 'x', evaluate: (y, z, extraParams) => rightFormula.evaluate({ ...extraParams, y, z }) };
      }
      const leftFormula = compileFormula(relation.left);
      const rightFormula = compileFormula(relation.right);
      const dependsOn = new Set([...leftFormula.variables, ...rightFormula.variables].filter((name) => name !== 'x' && name !== 'y' && name !== 'z'));
      return {
        type: 'implicit3',
        evaluate: (x, y, z, extraParams) => leftFormula.evaluate({ ...extraParams, x, y, z }) - rightFormula.evaluate({ ...extraParams, x, y, z }),
        dependsOn,
      };
    }

    const leftFormula = compileFormula(relation.left);
    const rightFormula = compileFormula(relation.right);
    const dependsOn = new Set([...leftFormula.variables, ...rightFormula.variables].filter((name) => name !== 'x' && name !== 'y' && name !== 'z'));
    return {
      type: 'inequality3',
      comparator: relation.op,
      evaluate: (x, y, z, extraParams) => leftFormula.evaluate({ ...extraParams, x, y, z }) - rightFormula.evaluate({ ...extraParams, x, y, z }),
      dependsOn,
    };
  } catch (error) {
    return { type: 'error', message: error instanceof Error ? error.message : 'Could not parse this expression' };
  }
}

/**
 * Classifies every row in order, threading each slider's live value (falling back to its
 * declared default the first time it appears) into `params` for the rows below it to use.
 */
export function buildGraphModel3d(rows: RowInput3d[], sliderValues: Readonly<Record<string, number>>): RowResult3d[] {
  const params: Record<string, number> = {};
  const results: RowResult3d[] = [];
  for (const row of rows) {
    const classified = classifyRow3d(row.raw, params);
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
