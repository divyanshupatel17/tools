import { describe, expect, it } from 'vitest';
import { buildGraphModel3d, classifyRow3d } from '@/features/math/graphing_calculator_3d/model';
import { marchingCubes } from '@/features/math/graphing_calculator_3d/marching_cubes';

describe('classifyRow3d', () => {
  it('treats a bare expression as a surface z = f(x, y)', () => {
    const row = classifyRow3d('sin(x)*cos(y)', {});
    expect(row.type).toBe('surface');
  });

  it('treats z=... as a surface solving for z', () => {
    const row = classifyRow3d('z=x^2+y^2', {});
    if (row.type !== 'surface') throw new Error('expected surface');
    expect(row.axis).toBe('z');
    expect(row.evaluate(2, 3, {})).toBe(13);
  });

  it('treats y=... as a surface solving for y', () => {
    const row = classifyRow3d('y=x+z', {});
    if (row.type !== 'surface') throw new Error('expected surface');
    expect(row.axis).toBe('y');
    expect(row.evaluate(2, 3, {})).toBe(5);
  });

  it('treats x=... as a surface solving for x', () => {
    const row = classifyRow3d('x=4', {});
    if (row.type !== 'surface') throw new Error('expected surface');
    expect(row.axis).toBe('x');
    expect(row.evaluate(0, 0, {})).toBe(4);
  });

  it('treats a bare letter assignment with no free variables as a slider', () => {
    const row = classifyRow3d('a=3', {});
    if (row.type !== 'slider') throw new Error('expected slider');
    expect(row.paramName).toBe('a');
    expect(row.value).toBe(3);
  });

  it('treats a three variable equality as an implicit surface, and only depends on stray params', () => {
    const row = classifyRow3d('x^2+y^2+z^2=9', {});
    if (row.type !== 'implicit3') throw new Error('expected implicit3');
    expect(row.evaluate(3, 0, 0, {})).toBeCloseTo(0, 10);
    expect(row.evaluate(0, 0, 0, {})).toBeCloseTo(-9, 10);
    expect(row.dependsOn.size).toBe(0);
  });

  it('an implicit surface that references a slider records it in dependsOn', () => {
    const row = classifyRow3d('x^2+y^2=a', { a: 4 });
    if (row.type !== 'implicit3') throw new Error('expected implicit3');
    expect([...row.dependsOn]).toEqual(['a']);
  });

  it('treats an inequality as a shaded region', () => {
    const row = classifyRow3d('x+y+z<0', {});
    if (row.type !== 'inequality3') throw new Error('expected inequality3');
    expect(row.comparator).toBe('<');
    expect(row.evaluate(-1, -1, -1, {})).toBeLessThan(0);
  });

  it('treats a parenthesised triple as a literal point', () => {
    const row = classifyRow3d('(2,3,4)', {});
    if (row.type !== 'point3') throw new Error('expected point3');
    expect(row.x).toBe(2);
    expect(row.y).toBe(3);
    expect(row.z).toBe(4);
  });

  it('reports a parse error without throwing', () => {
    const row = classifyRow3d('sin(', {});
    expect(row.type).toBe('error');
  });

  it('lets a later row reference an earlier slider, in order', () => {
    const results = buildGraphModel3d(
      [
        { id: 'r1', raw: 'a=2' },
        { id: 'r2', raw: 'z=a*x' },
      ],
      {},
    );
    const [sliderResult, surfaceResult] = results;
    expect(sliderResult?.row.type).toBe('slider');
    if (surfaceResult?.row.type !== 'surface') throw new Error('expected surface');
    expect(surfaceResult.row.evaluate(3, 0, { a: 2 })).toBe(6);
  });

  it('uses a live slider value over its declared default', () => {
    const results = buildGraphModel3d([{ id: 'r1', raw: 'a=2' }], { r1: 7 });
    const [sliderResult] = results;
    if (sliderResult?.row.type !== 'slider') throw new Error('expected slider');
    expect(sliderResult.row.value).toBe(7);
  });
});

describe('marchingCubes', () => {
  it('produces a closed, radius-accurate mesh for a sphere', () => {
    const radius = 2;
    const field = (x: number, y: number, z: number) => x * x + y * y + z * z - radius * radius;
    const result = marchingCubes(field, { min: -5, max: 5 }, 32);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.positions.length % 9).toBe(0); // whole triangles, 3 verts * 3 coords

    let maxError = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      const x = result.positions[i] as number;
      const y = result.positions[i + 1] as number;
      const z = result.positions[i + 2] as number;
      maxError = Math.max(maxError, Math.abs(Math.hypot(x, y, z) - radius));
    }
    expect(maxError).toBeLessThan(0.3);

    expect(result.normals.length).toBe(result.positions.length);
    const nx = result.normals[0] as number;
    const ny = result.normals[1] as number;
    const nz = result.normals[2] as number;
    const px = result.positions[0] as number;
    const py = result.positions[1] as number;
    const pz = result.positions[2] as number;
    const dot = (nx * px + ny * py + nz * pz) / (Math.hypot(nx, ny, nz) * Math.hypot(px, py, pz));
    expect(dot).toBeGreaterThan(0.9); // outward-pointing normal
  });

  it('returns nothing when the field never crosses zero in the box', () => {
    const field = (x: number, y: number, z: number) => x * x + y * y + z * z + 100;
    const result = marchingCubes(field, { min: -5, max: 5 }, 16);
    expect(result.positions.length).toBe(0);
  });

  it('produces an open cylinder when the field ignores z entirely', () => {
    const field = (x: number, y: number) => x * x + y * y - 4;
    const result = marchingCubes(field, { min: -5, max: 5 }, 24);
    expect(result.positions.length).toBeGreaterThan(0);
    let maxError = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      const x = result.positions[i] as number;
      const y = result.positions[i + 1] as number;
      maxError = Math.max(maxError, Math.abs(Math.hypot(x, y) - 2));
    }
    expect(maxError).toBeLessThan(0.3);
  });
});
