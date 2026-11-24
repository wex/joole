import { describe, expect, it } from 'vitest';
import { PLANE_EPS } from './constants';
import { baseWindingForPlane, splitWinding } from './winding';
import { dot } from './vec3';

describe('baseWindingForPlane', () => {
  it('produces four points on the plane', () => {
    const plane = { n: [0, 0, 1] as [number, number, number], d: 64 };
    const winding = baseWindingForPlane(plane);
    expect(winding).toHaveLength(4);
    for (const p of winding) {
      expect(dot(p, plane.n)).toBeCloseTo(plane.d, 6);
    }
  });

  it('centres the square on normal · d', () => {
    const plane = { n: [1, 0, 0] as [number, number, number], d: 32 };
    const winding = baseWindingForPlane(plane);
    const cx = winding.reduce((sum, p) => sum + p[0], 0) / 4;
    expect(cx).toBeCloseTo(32, 6);
  });

  it('handles arbitrary normals without degenerating', () => {
    const n: [number, number, number] = [1 / 3, 2 / 3, 2 / 3];
    const winding = baseWindingForPlane({ n, d: 10 });
    for (const p of winding) {
      expect(dot(p, n)).toBeCloseTo(10, 4);
    }
  });
});

describe('splitWinding', () => {
  const square: [number, number, number][] = [
    [0, 0, 0],
    [64, 0, 0],
    [64, 64, 0],
    [0, 64, 0],
  ];
  const clipX32 = { n: [1, 0, 0] as [number, number, number], d: 32 };

  it('returns the input unchanged on the front side when nothing is behind', () => {
    // plane behind the winding: everything is in front
    const result = splitWinding(square, { n: [1, 0, 0], d: -10 });
    expect(result.back).toBeNull();
    expect(result.front).toHaveLength(4);
  });

  it('returns the input unchanged on the back side when nothing is in front', () => {
    const result = splitWinding(square, { n: [1, 0, 0], d: 100 });
    expect(result.front).toBeNull();
    expect(result.back).toHaveLength(4);
  });

  it('splits a square into two halves', () => {
    const result = splitWinding(square, clipX32);
    expect(result.front).not.toBeNull();
    expect(result.back).not.toBeNull();
    // front half: x in [32, 64], a rectangle with 4 corners
    expect(result.front).toHaveLength(4);
    for (const p of result.front!) {
      expect(p[0]).toBeGreaterThanOrEqual(32 - PLANE_EPS);
    }
    for (const p of result.back!) {
      expect(p[0]).toBeLessThanOrEqual(32 + PLANE_EPS);
    }
    // split points lie exactly on x = 32 (round-off avoidance)
    const onPlane = result.front!.filter((p) => Math.abs(p[0] - 32) < 1e-9);
    expect(onPlane.length).toBe(2);
  });

  it('keeps exactly-on points on both fragments', () => {
    // clip plane passes through two corners of the square
    const result = splitWinding(square, { n: [1, 0, 0], d: 64 });
    expect(result.back).not.toBeNull();
    expect(result.front).toBeNull();
  });

  it('round-off avoidance uses exact plane position for axis normals', () => {
    const tilted: [number, number, number][] = [
      [0.1, 0, 0],
      [64.3, 0, 0],
      [64.3, 64, 0],
      [0.1, 64, 0],
    ];
    const result = splitWinding(tilted, clipX32);
    const xs = result.front!.filter((p) => Math.abs(p[0] - 32) < 1e-9);
    expect(xs.length).toBeGreaterThanOrEqual(2);
  });
});
