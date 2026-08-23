import type { Scope } from '../graphing_calculator/parser';
import type { Bounds3, MarchingCubesResult } from './marching_cubes';
import type { SurfaceAxis } from './model';

type Vec3 = [number, number, number];

function placePoint(axis: SurfaceAxis, a: number, b: number, height: number): Vec3 {
  switch (axis) {
    case 'z':
      return [a, b, height];
    case 'y':
      return [a, height, b];
    case 'x':
      return [height, a, b];
  }
}

function finiteVec3(p: Vec3): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
}

/**
 * Builds a heightfield mesh for a `surface` row: samples `evaluate(a, b, params)` on a
 * `resolution`-by-`resolution` grid over the box and triangulates each quad, placing the
 * sampled height on whichever axis the row solves for. Non finite samples (domain errors,
 * asymptotes) simply drop their quad rather than producing a stray triangle.
 */
export function buildSurfaceMesh(
  evaluate: (a: number, b: number, params: Scope) => number,
  axis: SurfaceAxis,
  bounds: Bounds3,
  resolution: number,
  params: Scope,
): MarchingCubesResult {
  const { min, max } = bounds;
  const step = (max - min) / resolution;
  const n = resolution + 1;

  const heights = new Float32Array(n * n);
  const index = (i: number, j: number) => i * n + j;
  for (let i = 0; i < n; i++) {
    const a = min + i * step;
    for (let j = 0; j < n; j++) {
      const b = min + j * step;
      heights[index(i, j)] = evaluate(a, b, params);
    }
  }

  function point(i: number, j: number): Vec3 {
    const a = min + i * step;
    const b = min + j * step;
    return placePoint(axis, a, b, heights[index(i, j)] as number);
  }

  const positions: number[] = [];
  const normals: number[] = [];

  function pushTri(p0: Vec3, p1: Vec3, p2: Vec3) {
    if (!finiteVec3(p0) || !finiteVec3(p1) || !finiteVec3(p2)) return;
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const p of [p0, p1, p2]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const p00 = point(i, j);
      const p10 = point(i + 1, j);
      const p11 = point(i + 1, j + 1);
      const p01 = point(i, j + 1);
      pushTri(p00, p10, p11);
      pushTri(p00, p11, p01);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}
