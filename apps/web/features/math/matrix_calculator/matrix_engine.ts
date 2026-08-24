export type Matrix = number[][];

export const MIN_DIM = 1;
export const MAX_DIM = 10;
export const DEFAULT_DIM = 3;

const EPSILON = 1e-9;
/**
 * Cofactor expansion is exact for integer input but factorial time, so it only backs the
 * "real" determinant/inverse value up to this size. Bigger matrices fall back to Gaussian
 * elimination (cubic time) so a 10×10 never risks freezing the tab.
 */
const EXACT_METHOD_MAX_DIM = 6;

/** Matrices above this element count skip per element steps; the result is still exact. */
const STEP_ELEMENT_BUDGET = 16;
/** Determinant and inverse cofactor expansion only narrates itself up to this size. */
const STEP_SQUARE_BUDGET = 4;
/** Eigenvalues and diagonalization use closed form solutions available up to this size. */
const EIGEN_MAX_DIM = 3;

export type MatrixOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'multiplyTransposeAxB'
  | 'multiplyAxTransposeB'
  | 'powerA'
  | 'solveAB'
  | 'transposeA'
  | 'transposeB'
  | 'determinantA'
  | 'determinantB'
  | 'inverseA'
  | 'inverseB'
  | 'rankA'
  | 'rankB'
  | 'rrefA'
  | 'rrefB'
  | 'luA'
  | 'luB'
  | 'choleskyA'
  | 'choleskyB'
  | 'eigenA'
  | 'eigenB'
  | 'diagonalizeA'
  | 'diagonalizeB';

export interface OperationInfo {
  id: MatrixOperation;
  label: string;
  needsB: boolean;
  needsPower?: boolean;
  /** Shown as one of the compact quick access buttons; every operation still lives in the dropdown. */
  quick?: boolean;
  group: string;
}

export const OPERATIONS: OperationInfo[] = [
  { id: 'add', label: 'A + B', needsB: true, quick: true, group: 'Combine A and B' },
  { id: 'subtract', label: 'A − B', needsB: true, quick: true, group: 'Combine A and B' },
  { id: 'multiply', label: 'A × B', needsB: true, quick: true, group: 'Combine A and B' },
  { id: 'multiplyTransposeAxB', label: 'Aᵀ × B', needsB: true, quick: true, group: 'Combine A and B' },
  { id: 'multiplyAxTransposeB', label: 'A × Bᵀ', needsB: true, quick: true, group: 'Combine A and B' },
  { id: 'powerA', label: 'Aⁿ', needsB: false, needsPower: true, quick: true, group: 'Matrix A' },
  { id: 'solveAB', label: 'Solve A·x = B', needsB: true, group: 'Combine A and B' },
  { id: 'transposeA', label: 'Transpose (Aᵀ)', needsB: false, group: 'Matrix A' },
  { id: 'determinantA', label: 'Determinant det(A)', needsB: false, group: 'Matrix A' },
  { id: 'inverseA', label: 'Inverse (A⁻¹)', needsB: false, group: 'Matrix A' },
  { id: 'rankA', label: 'Rank', needsB: false, group: 'Matrix A' },
  { id: 'rrefA', label: 'Row reduce (RREF)', needsB: false, group: 'Matrix A' },
  { id: 'luA', label: 'LU decomposition', needsB: false, group: 'Matrix A' },
  { id: 'choleskyA', label: 'Cholesky decomposition', needsB: false, group: 'Matrix A' },
  { id: 'eigenA', label: 'Eigenvalues', needsB: false, group: 'Matrix A' },
  { id: 'diagonalizeA', label: 'Diagonalize', needsB: false, group: 'Matrix A' },
  { id: 'transposeB', label: 'Transpose (Bᵀ)', needsB: false, group: 'Matrix B' },
  { id: 'determinantB', label: 'Determinant det(B)', needsB: false, group: 'Matrix B' },
  { id: 'inverseB', label: 'Inverse (B⁻¹)', needsB: false, group: 'Matrix B' },
  { id: 'rankB', label: 'Rank', needsB: false, group: 'Matrix B' },
  { id: 'rrefB', label: 'Row reduce (RREF)', needsB: false, group: 'Matrix B' },
  { id: 'luB', label: 'LU decomposition', needsB: false, group: 'Matrix B' },
  { id: 'choleskyB', label: 'Cholesky decomposition', needsB: false, group: 'Matrix B' },
  { id: 'eigenB', label: 'Eigenvalues', needsB: false, group: 'Matrix B' },
  { id: 'diagonalizeB', label: 'Diagonalize', needsB: false, group: 'Matrix B' },
];

export const QUICK_OPERATIONS = OPERATIONS.filter((op) => op.quick);

export interface CalcStep {
  id: string;
  title: string;
  matrix?: Matrix;
  formula?: string;
  detail?: string;
}

export interface OperationResult {
  ok: boolean;
  error?: string;
  matrix?: Matrix;
  extraMatrices?: { label: string; matrix: Matrix }[];
  scalar?: number;
  /** Formatted scalar-like results that come as a list, e.g. eigenvalues (which may be complex). */
  values?: string[];
  steps: CalcStep[];
  /** A genuine count of the scalar arithmetic operations the algorithm performed, not a decoration. */
  opsCount?: number;
}

export function dims(matrix: Matrix): { rows: number; cols: number } {
  return { rows: matrix.length, cols: matrix[0]?.length ?? 0 };
}

export function createMatrix(rows: number, cols: number, fill: 'zero' | 'identity' | 'random'): Matrix {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (fill === 'identity') return r === c ? 1 : 0;
      if (fill === 'random') return Math.floor(Math.random() * 19) - 9;
      return 0;
    }),
  );
}

/** Preserves overlapping cell values when a matrix is resized, padding new cells with zero. */
export function resizeMatrix(matrix: Matrix, rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => matrix[r]?.[c] ?? 0),
  );
}

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function isSquare(matrix: Matrix): boolean {
  const { rows, cols } = dims(matrix);
  return rows === cols;
}

/**
 * Trims float noise so 0.1 + 0.2 style results read as "0.3", not "0.30000000000000004".
 */
export function formatNumber(value: number, decimalPlaces?: number): string {
  if (!Number.isFinite(value)) return 'undefined';
  if (decimalPlaces !== undefined) return value.toFixed(decimalPlaces);
  const rounded = Math.round(value * 1e9) / 1e9;
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

function matrixLabel(prefix: string, matrix: Matrix): string {
  const { rows, cols } = dims(matrix);
  return `${prefix} (${rows}×${cols})`;
}

function sameDims(a: Matrix, b: Matrix): boolean {
  const da = dims(a);
  const db = dims(b);
  return da.rows === db.rows && da.cols === db.cols;
}

function addOrSubtract(a: Matrix, b: Matrix, sign: 1 | -1): OperationResult {
  if (!sameDims(a, b)) {
    return {
      ok: false,
      error: 'Matrix A and Matrix B must be the same size to add or subtract them.',
      steps: [],
    };
  }
  const { rows, cols } = dims(a);
  const result = a.map((row, r) => row.map((value, c) => value + sign * b[r]![c]!));
  const steps: CalcStep[] = [
    { id: 'a', title: matrixLabel('Matrix A', a), matrix: a },
    { id: 'b', title: matrixLabel('Matrix B', b), matrix: b },
    {
      id: 'rule',
      title: sign === 1 ? 'Addition rule' : 'Subtraction rule',
      formula: sign === 1 ? 'C[i,j] = A[i,j] + B[i,j]' : 'C[i,j] = A[i,j] − B[i,j]',
    },
  ];
  if (rows * cols <= STEP_ELEMENT_BUDGET) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const op = sign === 1 ? '+' : '−';
        steps.push({
          id: `el-${r}-${c}`,
          title: `Element [${r + 1},${c + 1}]`,
          detail: `${formatNumber(a[r]![c]!)} ${op} ${formatNumber(b[r]![c]!)} = ${formatNumber(result[r]![c]!)}`,
        });
      }
    }
  }
  return { ok: true, matrix: result, opsCount: rows * cols, steps };
}

function multiply(a: Matrix, b: Matrix, labelA = 'Matrix A', labelB = 'Matrix B'): OperationResult {
  const da = dims(a);
  const db = dims(b);
  if (da.cols !== db.rows) {
    return {
      ok: false,
      error: `${labelA} columns (${da.cols}) must match ${labelB} rows (${db.rows}) to multiply them.`,
      steps: [],
    };
  }
  const result: Matrix = Array.from({ length: da.rows }, (_, r) =>
    Array.from({ length: db.cols }, (_, c) => {
      let sum = 0;
      for (let k = 0; k < da.cols; k += 1) sum += a[r]![k]! * b[k]![c]!;
      return sum;
    }),
  );
  const steps: CalcStep[] = [
    { id: 'a', title: matrixLabel(labelA, a), matrix: a },
    { id: 'b', title: matrixLabel(labelB, b), matrix: b },
    { id: 'rule', title: 'Multiplication rule', formula: 'C[i,j] = Σₖ A[i,k] × B[k,j]' },
  ];
  if (da.rows * db.cols <= STEP_ELEMENT_BUDGET) {
    for (let r = 0; r < da.rows; r += 1) {
      for (let c = 0; c < db.cols; c += 1) {
        const terms = Array.from({ length: da.cols }, (_, k) => `(${formatNumber(a[r]![k]!)}×${formatNumber(b[k]![c]!)})`);
        const sums = Array.from({ length: da.cols }, (_, k) => formatNumber(a[r]![k]! * b[k]![c]!));
        steps.push({
          id: `el-${r}-${c}`,
          title: `Element [${r + 1},${c + 1}]`,
          detail: `${terms.join(' + ')} = ${sums.join(' + ')} = ${formatNumber(result[r]![c]!)}`,
        });
      }
    }
  }
  return { ok: true, matrix: result, opsCount: da.rows * db.cols * da.cols, steps };
}

export function transpose(matrix: Matrix): Matrix {
  const { rows, cols } = dims(matrix);
  return Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => matrix[r]![c]!));
}

function transposeWithSteps(matrix: Matrix, label: string): OperationResult {
  const result = transpose(matrix);
  const { rows, cols } = dims(matrix);
  return {
    ok: true,
    matrix: result,
    opsCount: rows * cols,
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      { id: 'rule', title: 'Transpose rule', formula: `${label}ᵀ[i,j] = ${label}[j,i]` },
      { id: 'result', title: `${label}ᵀ (${dims(result).rows}×${dims(result).cols})`, matrix: result },
    ],
  };
}

function minor(matrix: Matrix, skipRow: number, skipCol: number): Matrix {
  return matrix
    .filter((_, r) => r !== skipRow)
    .map((row) => row.filter((_, c) => c !== skipCol));
}

/** Exact for integer input, but factorial time — only used up to EXACT_METHOD_MAX_DIM. */
function determinantCofactor(matrix: Matrix): number {
  const n = matrix.length;
  if (n === 1) return matrix[0]![0]!;
  if (n === 2) return matrix[0]![0]! * matrix[1]![1]! - matrix[0]![1]! * matrix[1]![0]!;
  let det = 0;
  for (let col = 0; col < n; col += 1) {
    const sign = col % 2 === 0 ? 1 : -1;
    det += sign * matrix[0]![col]! * determinantCofactor(minor(matrix, 0, col));
  }
  return det;
}

/** Multiplication count of the cofactor expansion above, purely a function of size. */
function determinantCofactorOpsCount(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 2;
  return n * (1 + determinantCofactorOpsCount(n - 1));
}

/** Gaussian elimination with partial pivoting: cubic time, safe for larger matrices. */
function determinantElimination(matrix: Matrix): { value: number; ops: number } {
  const n = matrix.length;
  const m = cloneMatrix(matrix);
  let det = 1;
  let ops = 0;
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let maxVal = Math.abs(m[col]![col]!);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(m[r]![col]!);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = r;
      }
    }
    if (maxVal < EPSILON) return { value: 0, ops };
    if (pivotRow !== col) {
      const tmp = m[pivotRow]!;
      m[pivotRow] = m[col]!;
      m[col] = tmp;
      det = -det;
    }
    det *= m[col]![col]!;
    ops += 1;
    for (let r = col + 1; r < n; r += 1) {
      const factor = m[r]![col]! / m[col]![col]!;
      ops += 1;
      for (let c = col; c < n; c += 1) {
        m[r]![c] = m[r]![c]! - factor * m[col]![c]!;
        ops += 1;
      }
    }
  }
  return { value: det, ops };
}

function determinantWithCount(matrix: Matrix): { value: number; ops: number } {
  const n = matrix.length;
  if (n <= EXACT_METHOD_MAX_DIM) {
    return { value: determinantCofactor(matrix), ops: determinantCofactorOpsCount(n) };
  }
  return determinantElimination(matrix);
}

export function determinant(matrix: Matrix): number {
  return determinantWithCount(matrix).value;
}

function determinantWithSteps(matrix: Matrix, label: string): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: `${label} must be square to have a determinant.`, steps: [] };
  }
  const n = matrix.length;
  const { value, ops } = determinantWithCount(matrix);
  const steps: CalcStep[] = [{ id: 'src', title: matrixLabel(label, matrix), matrix }];
  if (n <= 2) {
    steps.push({
      id: 'rule',
      title: n === 1 ? 'Determinant of a 1×1 matrix' : 'Determinant rule (2×2)',
      formula: n === 1 ? `det(${label}) = ${label}[1,1]` : `det(${label}) = ad − bc`,
    });
  } else if (n <= STEP_SQUARE_BUDGET) {
    steps.push({
      id: 'rule',
      title: 'Cofactor expansion along row 1',
      formula: `det(${label}) = Σⱼ (−1)ʲ × ${label}[1,j] × det(minor 1,j)`,
    });
    for (let col = 0; col < n; col += 1) {
      const sign = col % 2 === 0 ? 1 : -1;
      const m = minor(matrix, 0, col);
      const mDet = determinant(m);
      steps.push({
        id: `term-${col}`,
        title: `Term for column ${col + 1}`,
        detail: `${sign > 0 ? '+' : '−'} ${formatNumber(matrix[0]![col]!)} × det(minor 1,${col + 1}) = ${sign > 0 ? '' : '−'}${formatNumber(matrix[0]![col]!)} × ${formatNumber(mDet)} = ${formatNumber(sign * matrix[0]![col]! * mDet)}`,
      });
    }
  } else {
    steps.push({
      id: 'note',
      title: 'Note',
      detail:
        n <= EXACT_METHOD_MAX_DIM
          ? `Step by step cofactor expansion is only shown up to ${STEP_SQUARE_BUDGET}×${STEP_SQUARE_BUDGET}; the result below is still exact.`
          : `Matrices above ${EXACT_METHOD_MAX_DIM}×${EXACT_METHOD_MAX_DIM} are computed via Gaussian elimination instead of cofactor expansion, so the result may carry tiny floating point rounding.`,
    });
  }
  steps.push({ id: 'result', title: `det(${label})`, detail: formatNumber(value) });
  return { ok: true, scalar: value, opsCount: ops, steps };
}

function cofactorMatrix(matrix: Matrix): Matrix {
  const n = matrix.length;
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => {
      const sign = (r + c) % 2 === 0 ? 1 : -1;
      return sign * determinantCofactor(minor(matrix, r, c));
    }),
  );
}

/** Gauss-Jordan elimination on [A | I], safe for larger matrices. */
function inverseEliminationRaw(matrix: Matrix): { result: Matrix | null; ops: number } {
  const n = matrix.length;
  const identity = createMatrix(n, n, 'identity');
  const augmented = matrix.map((row, r) => [...row, ...identity[r]!]);
  const { matrix: reduced, pivotCols, opsCount } = rref(augmented);
  if (pivotCols.length < n) return { result: null, ops: opsCount };
  return { result: reduced.map((row) => row.slice(n)), ops: opsCount };
}

/** Adjugate/determinant inverse with no step narration, shared by the diagonalizer. */
function inverseRaw(matrix: Matrix): Matrix | null {
  const n = matrix.length;
  if (n > EXACT_METHOD_MAX_DIM) return inverseEliminationRaw(matrix).result;
  const det = determinantCofactor(matrix);
  if (Math.abs(det) < EPSILON) return null;
  if (n === 1) return [[1 / matrix[0]![0]!]];
  const adjugate = transpose(cofactorMatrix(matrix));
  return adjugate.map((row) => row.map((value) => value / det));
}

function inverseWithSteps(matrix: Matrix, label: string): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: `${label} must be square to have an inverse.`, steps: [] };
  }
  const n = matrix.length;
  const steps: CalcStep[] = [{ id: 'src', title: matrixLabel(label, matrix), matrix }];

  if (n > EXACT_METHOD_MAX_DIM) {
    const { result, ops } = inverseEliminationRaw(matrix);
    if (!result) {
      steps.push({
        id: 'note',
        title: 'Note',
        detail: `${label} is singular, so it has no inverse.`,
      });
      return { ok: false, error: `${label} is singular, so it has no inverse.`, steps };
    }
    steps.push({
      id: 'rule',
      title: 'Inverse via Gauss-Jordan elimination',
      formula: `Row reduce [${label} | I] until the left block becomes the identity matrix.`,
    });
    steps.push({ id: 'result', title: `${label}⁻¹`, matrix: result });
    return { ok: true, matrix: result, opsCount: ops, steps };
  }

  const det = determinantCofactor(matrix);
  if (Math.abs(det) < EPSILON) {
    steps.push({
      id: 'det',
      title: `det(${label})`,
      detail: `${formatNumber(det)} — the determinant is zero, so ${label} is singular and has no inverse.`,
    });
    return { ok: false, error: `${label} is singular (determinant is 0), so it has no inverse.`, steps };
  }
  steps.push({ id: 'det', title: `det(${label})`, detail: formatNumber(det) });
  if (n === 1) {
    const result = [[1 / matrix[0]![0]!]];
    steps.push({ id: 'result', title: `${label}⁻¹`, matrix: result });
    return { ok: true, matrix: result, opsCount: 1, steps };
  }
  const cofactors = cofactorMatrix(matrix);
  if (n <= STEP_SQUARE_BUDGET) {
    steps.push({ id: 'cofactor', title: 'Cofactor matrix', matrix: cofactors });
  }
  const adjugate = transpose(cofactors);
  if (n <= STEP_SQUARE_BUDGET) {
    steps.push({ id: 'adjugate', title: `Adjugate (transpose of the cofactor matrix)`, matrix: adjugate });
  } else {
    steps.push({
      id: 'note',
      title: 'Note',
      detail: `Cofactor and adjugate steps are only shown up to ${STEP_SQUARE_BUDGET}×${STEP_SQUARE_BUDGET}; the result below is still exact.`,
    });
  }
  const result = adjugate.map((row) => row.map((value) => value / det));
  steps.push({
    id: 'rule',
    title: 'Inverse rule',
    formula: `${label}⁻¹ = adj(${label}) / det(${label})`,
  });
  steps.push({ id: 'result', title: `${label}⁻¹`, matrix: result });
  const opsCount = determinantCofactorOpsCount(n) + n * n * determinantCofactorOpsCount(n - 1) + n * n;
  return { ok: true, matrix: result, opsCount, steps };
}

function powerA(matrix: Matrix, power: number): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: 'Matrix A must be square to raise it to a power.', steps: [] };
  }
  if (!Number.isInteger(power) || power < 0) {
    return { ok: false, error: 'The power must be a whole number of 0 or more.', steps: [] };
  }
  const n = matrix.length;
  if (power === 0) {
    const result = createMatrix(n, n, 'identity');
    return {
      ok: true,
      matrix: result,
      opsCount: 0,
      steps: [
        { id: 'src', title: matrixLabel('Matrix A', matrix), matrix },
        { id: 'rule', title: 'Zero power rule', formula: 'A⁰ = I (the identity matrix)' },
        { id: 'result', title: 'A⁰', matrix: result },
      ],
    };
  }
  let result = cloneMatrix(matrix);
  const steps: CalcStep[] = [{ id: 'src', title: matrixLabel('Matrix A', matrix), matrix }];
  for (let step = 2; step <= power; step += 1) {
    const next = multiply(result, matrix, `Aⁿ`, 'A').matrix!;
    if (step <= 5) {
      steps.push({ id: `step-${step}`, title: `Aʲ for j = ${step}`, matrix: next });
    }
    result = next;
  }
  if (power > 5) {
    steps.push({
      id: 'note',
      title: 'Note',
      detail: 'Intermediate powers are only shown up to the 5th; the result below is still exact.',
    });
  }
  steps.push({ id: 'result', title: `Aⁿ (n = ${power})`, matrix: result });
  const opsCount = power >= 2 ? (power - 1) * n * n * n : 0;
  return { ok: true, matrix: result, opsCount, steps };
}

/** Gauss-Jordan elimination to reduced row echelon form, with partial pivoting for stability. */
function rref(matrix: Matrix): { matrix: Matrix; pivotCols: number[]; opsCount: number } {
  const m = cloneMatrix(matrix);
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  const pivotCols: number[] = [];
  let ops = 0;
  let lead = 0;
  for (let r = 0; r < rows && lead < cols; r += 1) {
    let pivotRow = r;
    let maxVal = Math.abs(m[r]![lead]!);
    for (let i = r + 1; i < rows; i += 1) {
      const v = Math.abs(m[i]![lead]!);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = i;
      }
    }
    if (maxVal < EPSILON) {
      lead += 1;
      r -= 1;
      continue;
    }
    if (pivotRow !== r) {
      const tmp = m[pivotRow]!;
      m[pivotRow] = m[r]!;
      m[r] = tmp;
    }
    const pivotVal = m[r]![lead]!;
    for (let c = 0; c < cols; c += 1) {
      m[r]![c] = m[r]![c]! / pivotVal;
      ops += 1;
    }
    for (let i = 0; i < rows; i += 1) {
      if (i === r) continue;
      const factor = m[i]![lead]!;
      if (Math.abs(factor) < EPSILON) continue;
      for (let c = 0; c < cols; c += 1) {
        m[i]![c] = m[i]![c]! - factor * m[r]![c]!;
        ops += 1;
      }
    }
    pivotCols.push(lead);
    lead += 1;
  }
  return { matrix: m, pivotCols, opsCount: ops };
}

function rrefWithSteps(matrix: Matrix, label: string): OperationResult {
  const { matrix: result, pivotCols, opsCount } = rref(matrix);
  return {
    ok: true,
    matrix: result,
    opsCount,
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      {
        id: 'rule',
        title: 'Gauss-Jordan elimination',
        formula: 'Row reduce with partial pivoting until the matrix is in reduced row echelon form.',
      },
      { id: 'result', title: `RREF(${label})`, matrix: result },
      {
        id: 'rank',
        title: `rank(${label})`,
        detail: `${pivotCols.length} pivot column${pivotCols.length === 1 ? '' : 's'} found.`,
      },
    ],
  };
}

function rankWithSteps(matrix: Matrix, label: string): OperationResult {
  const { pivotCols, opsCount } = rref(matrix);
  return {
    ok: true,
    scalar: pivotCols.length,
    opsCount,
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      {
        id: 'rule',
        title: 'Rank via Gauss-Jordan elimination',
        formula: 'rank = number of nonzero (pivot) rows in the reduced row echelon form',
      },
      { id: 'rank', title: `rank(${label})`, detail: formatNumber(pivotCols.length) },
    ],
  };
}

function luWithSteps(matrix: Matrix, label: string): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: `${label} must be square for an LU decomposition.`, steps: [] };
  }
  const n = matrix.length;
  const U = cloneMatrix(matrix);
  const L = createMatrix(n, n, 'identity');
  let ops = 0;
  for (let k = 0; k < n; k += 1) {
    const pivot = U[k]![k]!;
    if (Math.abs(pivot) < EPSILON) {
      return {
        ok: false,
        error: `${label} needs row pivoting to decompose (a zero pivot appeared at row ${k + 1}); try Row reduce (RREF) instead.`,
        steps: [{ id: 'src', title: matrixLabel(label, matrix), matrix }],
      };
    }
    for (let i = k + 1; i < n; i += 1) {
      const factor = U[i]![k]! / pivot;
      L[i]![k] = factor;
      ops += 1;
      for (let j = k; j < n; j += 1) {
        U[i]![j] = U[i]![j]! - factor * U[k]![j]!;
        ops += 1;
      }
    }
  }
  return {
    ok: true,
    matrix: U,
    extraMatrices: [{ label: 'L', matrix: L }],
    opsCount: ops,
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      { id: 'rule', title: 'LU rule', formula: `${label} = L × U (L lower triangular, U upper triangular)` },
      { id: 'L', title: 'L', matrix: L },
      { id: 'U', title: 'U', matrix: U },
    ],
  };
}

function choleskyWithSteps(matrix: Matrix, label: string): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: `${label} must be square for a Cholesky decomposition.`, steps: [] };
  }
  const n = matrix.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (Math.abs(matrix[i]![j]! - matrix[j]![i]!) > EPSILON) {
        return {
          ok: false,
          error: `${label} must be symmetric for a Cholesky decomposition.`,
          steps: [{ id: 'src', title: matrixLabel(label, matrix), matrix }],
        };
      }
    }
  }
  const L = createMatrix(n, n, 'zero');
  let ops = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = 0;
      for (let k = 0; k < j; k += 1) {
        sum += L[i]![k]! * L[j]![k]!;
        ops += 1;
      }
      if (i === j) {
        const value = matrix[i]![i]! - sum;
        if (value <= EPSILON) {
          return {
            ok: false,
            error: `${label} is not positive definite, so it has no Cholesky decomposition.`,
            steps: [{ id: 'src', title: matrixLabel(label, matrix), matrix }],
          };
        }
        L[i]![j] = Math.sqrt(value);
      } else {
        L[i]![j] = (matrix[i]![j]! - sum) / L[j]![j]!;
        ops += 1;
      }
    }
  }
  return {
    ok: true,
    matrix: L,
    extraMatrices: [{ label: 'Lᵀ', matrix: transpose(L) }],
    opsCount: ops,
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      { id: 'rule', title: 'Cholesky rule', formula: `${label} = L × Lᵀ (L lower triangular)` },
      { id: 'L', title: 'L', matrix: L },
    ],
  };
}

function solveWithSteps(a: Matrix, b: Matrix): OperationResult {
  const da = dims(a);
  const db = dims(b);
  if (!isSquare(a)) {
    return { ok: false, error: 'Matrix A must be square to solve A·x = B.', steps: [] };
  }
  if (da.rows !== db.rows) {
    return {
      ok: false,
      error: `Matrix B must have the same number of rows as Matrix A (${da.rows}) to solve A·x = B.`,
      steps: [],
    };
  }
  const n = da.rows;
  const augmented = a.map((row, r) => [...row, ...b[r]!]);
  const { matrix: reduced, pivotCols, opsCount } = rref(augmented);
  const rank = pivotCols.length;
  const augSteps: CalcStep[] = [
    { id: 'aug', title: 'Augmented matrix [A | B]', matrix: augmented },
    {
      id: 'rule',
      title: 'Gauss-Jordan elimination',
      formula: 'Row reduce [A | B] until the left block becomes the identity matrix.',
    },
    { id: 'reduced', title: 'RREF of the augmented matrix', matrix: reduced },
  ];
  for (const row of reduced) {
    const leftAllZero = row.slice(0, n).every((v) => Math.abs(v) < EPSILON);
    const rightNonZero = row.slice(n).some((v) => Math.abs(v) > EPSILON);
    if (leftAllZero && rightNonZero) {
      return { ok: false, error: 'This system has no solution (the equations are inconsistent).', steps: augSteps };
    }
  }
  if (rank < n) {
    return {
      ok: false,
      error: `This system does not have a unique solution (rank ${rank} is less than the ${n} unknowns); it has infinitely many solutions.`,
      steps: augSteps,
    };
  }
  const solution: Matrix = Array.from({ length: n }, (_, i) => reduced[i]!.slice(n));
  augSteps.push({ id: 'result', title: 'Solution x (A·x = B)', matrix: solution });
  return { ok: true, matrix: solution, opsCount, steps: augSteps };
}

function nullSpaceBasis(matrix: Matrix): number[][] {
  const { matrix: reduced, pivotCols } = rref(matrix);
  const cols = dims(matrix).cols;
  const pivotSet = new Set(pivotCols);
  const freeCols = Array.from({ length: cols }, (_, c) => c).filter((c) => !pivotSet.has(c));
  return freeCols.map((freeCol) => {
    const vec = new Array<number>(cols).fill(0);
    vec[freeCol] = 1;
    pivotCols.forEach((pivotCol, rowIndex) => {
      vec[pivotCol] = -(reduced[rowIndex]?.[freeCol] ?? 0);
    });
    return vec;
  });
}

interface Complex {
  re: number;
  im: number;
}

/** Closed form eigenvalues for 1×1 to 3×3 matrices via the characteristic polynomial. */
function eigenvaluesRaw(matrix: Matrix): Complex[] | null {
  const n = matrix.length;
  if (n > EIGEN_MAX_DIM) return null;
  if (n === 1) return [{ re: matrix[0]![0]!, im: 0 }];
  if (n === 2) {
    const a = matrix[0]![0]!;
    const b = matrix[0]![1]!;
    const c = matrix[1]![0]!;
    const d = matrix[1]![1]!;
    const tr = a + d;
    const det = a * d - b * c;
    const disc = tr * tr - 4 * det;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      return [
        { re: (tr + s) / 2, im: 0 },
        { re: (tr - s) / 2, im: 0 },
      ];
    }
    const s = Math.sqrt(-disc);
    return [
      { re: tr / 2, im: s / 2 },
      { re: tr / 2, im: -s / 2 },
    ];
  }
  // n === 3: characteristic polynomial λ³ − tr·λ² + c1·λ − det(A) = 0.
  const tr = matrix[0]![0]! + matrix[1]![1]! + matrix[2]![2]!;
  const det = determinant(matrix);
  const c1 =
    (matrix[0]![0]! * matrix[1]![1]! - matrix[0]![1]! * matrix[1]![0]!) +
    (matrix[0]![0]! * matrix[2]![2]! - matrix[0]![2]! * matrix[2]![0]!) +
    (matrix[1]![1]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![1]!);
  const B = -tr;
  const C = c1;
  const D = -det;
  const p = C - (B * B) / 3;
  const q = (2 * B * B * B) / 27 - (B * C) / 3 + D;
  const discCubic = (q * q) / 4 + (p * p * p) / 27;

  if (Math.abs(p) < 1e-10 && Math.abs(q) < 1e-10) {
    const t = -B / 3;
    return [
      { re: t, im: 0 },
      { re: t, im: 0 },
      { re: t, im: 0 },
    ];
  }

  if (discCubic > 1e-10) {
    const sqrtDisc = Math.sqrt(discCubic);
    const u = Math.cbrt(-q / 2 + sqrtDisc);
    const v = Math.cbrt(-q / 2 - sqrtDisc);
    const t1 = u + v;
    const lambda1 = t1 - B / 3;
    // Deflate: λ³+Bλ²+Cλ+D = (λ−λ1)(λ²+b1λ+b2)
    const b1 = B + lambda1;
    const b2 = C + b1 * lambda1;
    const discQuad = b1 * b1 - 4 * b2;
    if (discQuad >= 0) {
      const s = Math.sqrt(discQuad);
      return [
        { re: lambda1, im: 0 },
        { re: (-b1 + s) / 2, im: 0 },
        { re: (-b1 - s) / 2, im: 0 },
      ];
    }
    const s = Math.sqrt(-discQuad);
    return [
      { re: lambda1, im: 0 },
      { re: -b1 / 2, im: s / 2 },
      { re: -b1 / 2, im: -s / 2 },
    ];
  }

  // Three real roots (trigonometric method), including the discCubic ≈ 0 repeated root case.
  const m = 2 * Math.sqrt(-p / 3);
  const argRaw = (3 * q) / (p * m);
  const arg = Math.max(-1, Math.min(1, argRaw));
  const theta = Math.acos(arg) / 3;
  const roots = [0, 1, 2].map((k) => m * Math.cos(theta - (2 * Math.PI * k) / 3) - B / 3);
  return roots.map((re) => ({ re, im: 0 }));
}

function subscriptDigit(n: number): string {
  const digits: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
  };
  return String(n)
    .split('')
    .map((d) => digits[d] ?? d)
    .join('');
}

function formatComplex(value: Complex): string {
  if (Math.abs(value.im) < 1e-7) return formatNumber(value.re);
  return `${formatNumber(value.re)} ${value.im >= 0 ? '+' : '−'} ${formatNumber(Math.abs(value.im))}i`;
}

function eigenvaluesWithSteps(matrix: Matrix, label: string): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: `${label} must be square to have eigenvalues.`, steps: [] };
  }
  const n = matrix.length;
  if (n > EIGEN_MAX_DIM) {
    return {
      ok: false,
      error: `Eigenvalues are only computed here up to ${EIGEN_MAX_DIM}×${EIGEN_MAX_DIM} matrices (this is ${n}×${n}).`,
      steps: [],
    };
  }
  const values = eigenvaluesRaw(matrix)!;
  const formatted = values.map(formatComplex);
  const polynomial =
    n === 1
      ? `${label} − λ = 0`
      : n === 2
        ? `λ² − tr(${label})λ + det(${label}) = 0`
        : `λ³ − tr(${label})λ² + c₁λ − det(${label}) = 0`;
  return {
    ok: true,
    values: formatted,
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      { id: 'rule', title: 'Characteristic polynomial', formula: `det(${label} − λI) = 0  ⇒  ${polynomial}` },
      ...formatted.map((value, index) => ({
        id: `lambda-${index}`,
        title: `λ${subscriptDigit(index + 1)}`,
        detail: value,
      })),
    ],
  };
}

function groupClose(values: number[], epsilon: number): { value: number; multiplicity: number }[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: { value: number; multiplicity: number }[] = [];
  for (const v of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.value - v) < epsilon) {
      last.multiplicity += 1;
    } else {
      groups.push({ value: v, multiplicity: 1 });
    }
  }
  return groups;
}

function diagonalizeWithSteps(matrix: Matrix, label: string): OperationResult {
  if (!isSquare(matrix)) {
    return { ok: false, error: `${label} must be square to diagonalize.`, steps: [] };
  }
  const n = matrix.length;
  if (n > EIGEN_MAX_DIM) {
    return {
      ok: false,
      error: `Diagonalization is only computed here up to ${EIGEN_MAX_DIM}×${EIGEN_MAX_DIM} matrices (this is ${n}×${n}).`,
      steps: [],
    };
  }
  const eig = eigenvaluesRaw(matrix)!;
  if (eig.some((v) => Math.abs(v.im) > 1e-6)) {
    return {
      ok: false,
      error: `${label} is not diagonalizable over the real numbers: it has complex eigenvalues.`,
      steps: [{ id: 'src', title: matrixLabel(label, matrix), matrix }],
    };
  }
  const groups = groupClose(
    eig.map((v) => v.re),
    1e-6,
  );
  const columns: number[][] = [];
  const diagValues: number[] = [];
  for (const { value, multiplicity } of groups) {
    const shifted = matrix.map((row, i) => row.map((v, j) => v - (i === j ? value : 0)));
    const basis = nullSpaceBasis(shifted);
    if (basis.length < multiplicity) {
      return {
        ok: false,
        error: `${label} is not diagonalizable: eigenvalue ${formatNumber(value)} needs ${multiplicity} independent eigenvector${multiplicity === 1 ? '' : 's'} but only ${basis.length} ${basis.length === 1 ? 'exists' : 'exist'}.`,
        steps: [{ id: 'src', title: matrixLabel(label, matrix), matrix }],
      };
    }
    for (let k = 0; k < multiplicity; k += 1) {
      columns.push(basis[k]!);
      diagValues.push(value);
    }
  }
  const P: Matrix = Array.from({ length: n }, (_, r) => columns.map((col) => col[r]!));
  const pInv = inverseRaw(P);
  if (!pInv) {
    return {
      ok: false,
      error: `${label} is not diagonalizable: the eigenvector matrix is singular.`,
      steps: [{ id: 'src', title: matrixLabel(label, matrix), matrix }],
    };
  }
  const D = createMatrix(n, n, 'zero');
  for (let i = 0; i < n; i += 1) D[i]![i] = diagValues[i]!;
  return {
    ok: true,
    matrix: D,
    extraMatrices: [
      { label: 'P', matrix: P },
      { label: 'P⁻¹', matrix: pInv },
    ],
    steps: [
      { id: 'src', title: matrixLabel(label, matrix), matrix },
      { id: 'rule', title: 'Diagonalization rule', formula: `${label} = P × D × P⁻¹` },
      { id: 'P', title: 'P (eigenvectors as columns)', matrix: P },
      { id: 'D', title: 'D (eigenvalues on the diagonal)', matrix: D },
    ],
  };
}

/** The mathematical name for what an operation's primary result represents, e.g. "A⁻¹" or "U". */
export function resultLabel(operation: MatrixOperation, power: number): string {
  switch (operation) {
    case 'add':
      return 'A + B';
    case 'subtract':
      return 'A − B';
    case 'multiply':
      return 'A × B';
    case 'multiplyTransposeAxB':
      return 'Aᵀ × B';
    case 'multiplyAxTransposeB':
      return 'A × Bᵀ';
    case 'powerA':
      return `Aⁿ (n = ${power})`;
    case 'solveAB':
      return 'x';
    case 'transposeA':
      return 'Aᵀ';
    case 'transposeB':
      return 'Bᵀ';
    case 'determinantA':
      return 'det(A)';
    case 'determinantB':
      return 'det(B)';
    case 'inverseA':
      return 'A⁻¹';
    case 'inverseB':
      return 'B⁻¹';
    case 'rankA':
      return 'rank(A)';
    case 'rankB':
      return 'rank(B)';
    case 'rrefA':
      return 'RREF(A)';
    case 'rrefB':
      return 'RREF(B)';
    case 'luA':
    case 'luB':
      return 'U';
    case 'choleskyA':
    case 'choleskyB':
      return 'L';
    case 'eigenA':
      return 'Eigenvalues of A';
    case 'eigenB':
      return 'Eigenvalues of B';
    case 'diagonalizeA':
    case 'diagonalizeB':
      return 'D';
    default:
      return '';
  }
}

export function compute(operation: MatrixOperation, a: Matrix, b: Matrix, power: number): OperationResult {
  switch (operation) {
    case 'add':
      return addOrSubtract(a, b, 1);
    case 'subtract':
      return addOrSubtract(a, b, -1);
    case 'multiply':
      return multiply(a, b);
    case 'multiplyTransposeAxB':
      return multiply(transpose(a), b, 'Aᵀ', 'B');
    case 'multiplyAxTransposeB':
      return multiply(a, transpose(b), 'A', 'Bᵀ');
    case 'powerA':
      return powerA(a, power);
    case 'solveAB':
      return solveWithSteps(a, b);
    case 'transposeA':
      return transposeWithSteps(a, 'A');
    case 'transposeB':
      return transposeWithSteps(b, 'B');
    case 'determinantA':
      return determinantWithSteps(a, 'A');
    case 'determinantB':
      return determinantWithSteps(b, 'B');
    case 'inverseA':
      return inverseWithSteps(a, 'A');
    case 'inverseB':
      return inverseWithSteps(b, 'B');
    case 'rankA':
      return rankWithSteps(a, 'A');
    case 'rankB':
      return rankWithSteps(b, 'B');
    case 'rrefA':
      return rrefWithSteps(a, 'A');
    case 'rrefB':
      return rrefWithSteps(b, 'B');
    case 'luA':
      return luWithSteps(a, 'A');
    case 'luB':
      return luWithSteps(b, 'B');
    case 'choleskyA':
      return choleskyWithSteps(a, 'A');
    case 'choleskyB':
      return choleskyWithSteps(b, 'B');
    case 'eigenA':
      return eigenvaluesWithSteps(a, 'A');
    case 'eigenB':
      return eigenvaluesWithSteps(b, 'B');
    case 'diagonalizeA':
      return diagonalizeWithSteps(a, 'A');
    case 'diagonalizeB':
      return diagonalizeWithSteps(b, 'B');
    default:
      return { ok: false, error: 'Unknown operation.', steps: [] };
  }
}
