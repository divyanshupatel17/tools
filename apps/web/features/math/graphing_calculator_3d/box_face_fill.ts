import type { Scope } from '../graphing_calculator/parser';
import type { Bounds3, MarchingCubesResult } from './marching_cubes';
import type { Comparator } from './model';

type Vec3 = [number, number, number];
type FaceAxis = 'x' | 'y' | 'z';

function satisfies(comparator: Comparator, value: number): boolean {
  switch (comparator) {
    case '<':
      return value < 0;
    case '<=':
      return value <= 0;
    case '>':
      return value > 0;
    case '>=':
      return value >= 0;
  }
}

function toPoint(fixedAxis: FaceAxis, fixedValue: number, a: number, b: number): Vec3 {
  switch (fixedAxis) {
    case 'x':
      return [fixedValue, a, b];
    case 'y':
      return [a, fixedValue, b];
    case 'z':
      return [a, b, fixedValue];
  }
}

/**
 * For an `inequality3` row, rasterises a coarse quad fill across each of the 6 box faces
 * wherever the inequality holds at that face's coordinate — the same "coarse grid raster"
 * strategy `canvas_renderer.ts`'s `drawInequality` uses in the 2D tool, just emitted as 3D
 * quads. Combined with the row's marching-cubes boundary isosurface, this reads as a bounded
 * shaded region the way Desmos 3D renders a half space.
 */
export function buildInequalityFaceFill(
  evaluate: (x: number, y: number, z: number, params: Scope) => number,
  comparator: Comparator,
  bounds: Bounds3,
  resolution: number,
  params: Scope,
): MarchingCubesResult {
  const { min, max } = bounds;
  const step = (max - min) / resolution;
  const positions: number[] = [];
  const normals: number[] = [];

  const faces: { axis: FaceAxis; value: number; normal: Vec3 }[] = [
    { axis: 'x', value: min, normal: [-1, 0, 0] },
    { axis: 'x', value: max, normal: [1, 0, 0] },
    { axis: 'y', value: min, normal: [0, -1, 0] },
    { axis: 'y', value: max, normal: [0, 1, 0] },
    { axis: 'z', value: min, normal: [0, 0, -1] },
    { axis: 'z', value: max, normal: [0, 0, 1] },
  ];

  for (const face of faces) {
    for (let i = 0; i < resolution; i++) {
      const a0 = min + i * step;
      const a1 = a0 + step;
      const aMid = (a0 + a1) / 2;
      for (let j = 0; j < resolution; j++) {
        const b0 = min + j * step;
        const b1 = b0 + step;
        const bMid = (b0 + b1) / 2;
        const mid = toPoint(face.axis, face.value, aMid, bMid);
        const value = evaluate(mid[0], mid[1], mid[2], params);
        if (!Number.isFinite(value) || !satisfies(comparator, value)) continue;

        const p00 = toPoint(face.axis, face.value, a0, b0);
        const p10 = toPoint(face.axis, face.value, a1, b0);
        const p11 = toPoint(face.axis, face.value, a1, b1);
        const p01 = toPoint(face.axis, face.value, a0, b1);
        for (const tri of [
          [p00, p10, p11],
          [p00, p11, p01],
        ]) {
          for (const p of tri) {
            positions.push(p[0], p[1], p[2]);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
          }
        }
      }
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}
