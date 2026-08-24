import { describe, expect, it } from 'vitest';
import { compute, determinant, type Matrix } from '@/features/math/matrix_calculator/matrix_engine';

describe('multiply', () => {
  it('multiplies matching matrices and reports the standard rule', () => {
    const a: Matrix = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const b: Matrix = [
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ];
    const result = compute('multiply', a, b, 0);
    expect(result.ok).toBe(true);
    expect(result.matrix).toEqual([
      [30, 24, 18],
      [84, 69, 54],
      [138, 114, 90],
    ]);
    expect(result.opsCount).toBe(27);
  });

  it('rejects mismatched inner dimensions', () => {
    const a: Matrix = [[1, 2]];
    const b: Matrix = [[1, 2]];
    const result = compute('multiply', a, b, 0);
    expect(result.ok).toBe(false);
  });
});

describe('determinant', () => {
  it('matches manual cofactor expansion for a 3x3', () => {
    const a: Matrix = [
      [2, 0, 1],
      [1, 3, 2],
      [0, 1, 1],
    ];
    expect(determinant(a)).toBe(3);
  });
});

describe('inverse', () => {
  it('produces a true inverse (A × A⁻¹ = I)', () => {
    const a: Matrix = [
      [2, 0, 1],
      [1, 3, 2],
      [0, 1, 1],
    ];
    const inv = compute('inverseA', a, a, 0);
    expect(inv.ok).toBe(true);
    const product = compute('multiply', a, inv.matrix!, 0);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        expect(product.matrix![i]![j]!).toBeCloseTo(i === j ? 1 : 0, 9);
      }
    }
  });

  it('reports singular matrices instead of dividing by zero', () => {
    const singular: Matrix = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const result = compute('inverseA', singular, singular, 0);
    expect(result.ok).toBe(false);
  });
});

describe('rank', () => {
  it('finds full rank for an identity matrix', () => {
    const identity: Matrix = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result = compute('rankA', identity, identity, 0);
    expect(result.scalar).toBe(3);
  });

  it('finds a rank deficient matrix', () => {
    const rank2: Matrix = [
      [1, 2, 3],
      [2, 4, 6],
      [1, 1, 1],
    ];
    const result = compute('rankA', rank2, rank2, 0);
    expect(result.scalar).toBe(2);
  });
});

describe('LU decomposition', () => {
  it('factors A into L × U', () => {
    const a: Matrix = [
      [4, 3],
      [6, 3],
    ];
    const result = compute('luA', a, a, 0);
    expect(result.ok).toBe(true);
    const l = result.extraMatrices!.find((m) => m.label === 'L')!.matrix;
    const u = result.matrix!;
    const product = compute('multiply', l, u, 0).matrix!;
    expect(product).toEqual(a);
  });
});

describe('Cholesky decomposition', () => {
  it('factors a symmetric positive definite matrix into L × Lᵀ', () => {
    const a: Matrix = [
      [4, 12, -16],
      [12, 37, -43],
      [-16, -43, 98],
    ];
    const result = compute('choleskyA', a, a, 0);
    expect(result.ok).toBe(true);
    const l = result.matrix!;
    const lt = result.extraMatrices!.find((m) => m.label === 'Lᵀ')!.matrix;
    const product = compute('multiply', l, lt, 0).matrix!;
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        expect(product[i]![j]!).toBeCloseTo(a[i]![j]!, 9);
      }
    }
  });

  it('rejects a non symmetric matrix', () => {
    const a: Matrix = [
      [1, 2],
      [3, 4],
    ];
    const result = compute('choleskyA', a, a, 0);
    expect(result.ok).toBe(false);
  });
});

describe('eigenvalues', () => {
  it('finds real eigenvalues of a symmetric 2x2', () => {
    const a: Matrix = [
      [2, 1],
      [1, 2],
    ];
    const result = compute('eigenA', a, a, 0);
    expect(result.ok).toBe(true);
    expect(result.values).toEqual(['3', '1']);
  });

  it('finds the three real eigenvalues of a 3x3 (trigonometric branch)', () => {
    const a: Matrix = [
      [2, 0, 0],
      [0, 3, 4],
      [0, 4, 9],
    ];
    const result = compute('eigenA', a, a, 0);
    expect(result.ok).toBe(true);
    const values = result.values!.map(Number).sort((x, y) => x - y);
    expect(values[0]).toBeCloseTo(1, 6);
    expect(values[1]).toBeCloseTo(2, 6);
    expect(values[2]).toBeCloseTo(11, 6);
  });
});

describe('diagonalize', () => {
  it('produces P and D such that A = P × D × P⁻¹', () => {
    const a: Matrix = [
      [2, 0],
      [0, 3],
    ];
    const result = compute('diagonalizeA', a, a, 0);
    expect(result.ok).toBe(true);
    const p = result.extraMatrices!.find((m) => m.label === 'P')!.matrix;
    const pInv = result.extraMatrices!.find((m) => m.label === 'P⁻¹')!.matrix;
    const d = result.matrix!;
    const pd = compute('multiply', p, d, 0).matrix!;
    const reconstructed = compute('multiply', pd, pInv, 0).matrix!;
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        expect(reconstructed[i]![j]!).toBeCloseTo(a[i]![j]!, 9);
      }
    }
  });
});

describe('large matrices (elimination fallback)', () => {
  function identityWithDiagonal(n: number, diag: number[]): Matrix {
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r === c ? diag[r]! : 0)));
  }

  it('computes an 8x8 determinant quickly and correctly', () => {
    const diag = [2, 3, 4, 5, 6, 7, 8, 9];
    const a = identityWithDiagonal(8, diag);
    const start = performance.now();
    const result = compute('determinantA', a, a, 0);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(result.scalar).toBeCloseTo(diag.reduce((p, v) => p * v, 1), 6);
    expect(elapsed).toBeLessThan(1000);
  });

  it('inverts a 10x10 matrix quickly and correctly', () => {
    const diag = Array.from({ length: 10 }, (_, i) => i + 1);
    const a = identityWithDiagonal(10, diag);
    const start = performance.now();
    const result = compute('inverseA', a, a, 0);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    for (let i = 0; i < 10; i += 1) {
      expect(result.matrix![i]![i]!).toBeCloseTo(1 / diag[i]!, 6);
    }
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('solve A·x = B', () => {
  it('solves a well determined system', () => {
    const a: Matrix = [
      [2, 1],
      [1, 3],
    ];
    const b: Matrix = [[3], [5]];
    const result = compute('solveAB', a, b, 0);
    expect(result.ok).toBe(true);
    expect(result.matrix![0]![0]).toBeCloseTo(0.8, 9);
    expect(result.matrix![1]![0]).toBeCloseTo(1.4, 9);
  });

  it('reports an inconsistent system', () => {
    const a: Matrix = [
      [1, 1],
      [1, 1],
    ];
    const b: Matrix = [[1], [2]];
    const result = compute('solveAB', a, b, 0);
    expect(result.ok).toBe(false);
  });
});
