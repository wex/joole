import { describe, expect, it } from 'vitest';
import { analyzeBrush, extractWireframe, validateBrush } from './brush';
import { dot } from './vec3';
import { brushFromPlanes, makeBox } from './__tests__/helpers';
import type { BrushNode } from '@core/types/index';
import { testTex, expectVec } from './__tests__/helpers';

describe('analyzeBrush on a cube', () => {
  const cube = makeBox([0, 0, 0], [64, 64, 64]);
  const analysis = analyzeBrush(cube);

  it('builds six non-empty polygons', () => {
    expect(analysis.polygons.filter(Boolean)).toHaveLength(6);
    expect(analysis.planes.every((p) => p !== null)).toBe(true);
  });

  it('each polygon is a square with side 64 on its plane', () => {
    for (const [i, polygon] of analysis.polygons.entries()) {
      expect(polygon).not.toBeNull();
      expect(polygon).toHaveLength(4);
      const plane = analysis.planes[i]!;
      for (const p of polygon!) {
        expect(Math.abs(dot(p, plane.n) - plane.d)).toBeLessThan(1e-6);
      }
    }
    // the z = 64 face is exactly the unit square at the top
    const topIndex = analysis.planes.findIndex((p) => p!.n[2] === 1);
    const zs = analysis.polygons[topIndex]!.map((p) => p[2]);
    expect(zs.every((z) => Math.abs(z - 64) < 1e-6)).toBe(true);
  });

  it('has the volume of the cube', () => {
    expect(analysis.volume).toBeCloseTo(64 * 64 * 64, 3);
  });

  it('has the aabb of the cube', () => {
    expect(analysis.aabb).not.toBeNull();
    expectVec(analysis.aabb!.min, [0, 0, 0]);
    expectVec(analysis.aabb!.max, [64, 64, 64]);
  });

  it('is valid', () => {
    expect(validateBrush(analysis)).toEqual({ valid: true, reasons: [] });
  });
});

describe('analyzeBrush on a wedge', () => {
  // x in [0,64], y in [0,64], 0 <= z <= x: a 45-degree ramp, half the box
  const sqrt2 = Math.sqrt(2);
  const wedge = brushFromPlanes([
    { n: [0, 0, -1], d: 0 }, // bottom
    { n: [-1 / sqrt2, 0, 1 / sqrt2], d: 0 }, // slope z = x
    { n: [0, -1, 0], d: 0 }, // y = 0
    { n: [0, 1, 0], d: 64 }, // y = 64
    { n: [1, 0, 0], d: 64 }, // x = 64
  ]);
  const analysis = analyzeBrush(wedge);

  it('builds five non-empty polygons', () => {
    expect(analysis.polygons.filter(Boolean)).toHaveLength(5);
  });

  it('has half the volume of the box', () => {
    expect(analysis.volume).toBeCloseTo((64 * 64 * 64) / 2, 2);
  });

  it('is valid with five faces', () => {
    expect(validateBrush(analysis).valid).toBe(true);
  });

  it('slope polygon vertices lie on the slope plane', () => {
    const slopeIndex = 1;
    for (const p of analysis.polygons[slopeIndex]!) {
      expect(Math.abs(p[2] - p[0])).toBeLessThan(1e-4);
    }
  });
});

describe('degenerate inputs', () => {
  it('mirrored planes have no volume and are invalid', () => {
    // all normals point inwards
    const insideOut = makeBox([0, 0, 0], [64, 64, 64]);
    for (const face of insideOut.faces) {
      face.points = [face.points[2], face.points[1], face.points[0]];
    }
    const analysis = analyzeBrush(insideOut);
    const validation = validateBrush(analysis);
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('no-volume');
  });

  it('fewer than four planes are invalid', () => {
    const open = brushFromPlanes([
      { n: [1, 0, 0], d: 64 },
      { n: [0, 1, 0], d: 64 },
      { n: [0, 0, 1], d: 64 },
    ]);
    const validation = validateBrush(analyzeBrush(open));
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('too-few-faces');
  });

  it('a plane outside the brush is redundant and invalid', () => {
    const brush = makeBox([0, 0, 0], [64, 64, 64]);
    brush.faces.push({
      points: [
        [0, 0, 1000],
        [0, 64, 1000],
        [64, 64, 1000],
      ],
      tex: testTex(),
    });
    const analysis = analyzeBrush(brush);
    const validation = validateBrush(analysis);
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('redundant-face');
    // the redundant face itself has an empty polygon
    expect(analysis.polygons[6]).toBeNull();
  });

  it('collinear face points are degenerate and invalid', () => {
    const brush = makeBox([0, 0, 0], [64, 64, 64]);
    brush.faces[0]!.points = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ];
    const analysis = analyzeBrush(brush);
    expect(analysis.planes[0]).toBeNull();
    const validation = validateBrush(analysis);
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('degenerate-face-points');
  });

  it('duplicate planes corrupt the surface and are caught', () => {
    const brush: BrushNode = makeBox([0, 0, 0], [64, 64, 64]);
    brush.faces.push({ ...brush.faces[0]!, tex: testTex() });
    const analysis = analyzeBrush(brush);
    const validation = validateBrush(analysis);
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('duplicate-plane');
  });
});

describe('extractWireframe', () => {
  it('a cube has 8 vertices and 18 edges', () => {
    const analysis = analyzeBrush(makeBox([0, 0, 0], [64, 64, 64]));
    const wire = extractWireframe(analysis.polygons);
    expect(wire.vertices).toHaveLength(8);
    expect(wire.edges).toHaveLength(12);
    for (const [a, b] of wire.edges) {
      expect(a).not.toBe(b);
    }
  });

  it('deduplicates shared corners within POINT_EPS', () => {
    const analysis = analyzeBrush(makeBox([0, 0, 0], [64, 64, 64]));
    const wire = extractWireframe(analysis.polygons);
    for (const v of wire.vertices) {
      expect(v.every((c) => Math.abs(c % 64) < 1e-3)).toBe(true);
    }
  });
});
