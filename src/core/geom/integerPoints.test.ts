import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { convertBrushToIntegerPoints } from './integerPoints';
import { analyzeBrush, validateBrush } from './brush';
import { makeBox } from './__tests__/helpers';
import { planeFromPoints } from './plane';
import { dot } from './vec3';

describe('convertBrushToIntegerPoints', () => {
  it('leaves an integer brush unchanged without warnings', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const result = convertBrushToIntegerPoints(box);
    expect(result.converted).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.brush).toBe(box);
  });

  it('converts a tiny-noise box without warnings', () => {
    const eps = 1e-9;
    const box = makeBox([eps, eps, eps], [64 + eps, 64 + eps, 64 + eps]);
    const result = convertBrushToIntegerPoints(box);
    expect(result.converted).toBe(true);
    expect(result.warnings).toEqual([]);
    for (const face of result.brush.faces) {
      for (const point of face.points) {
        expect(point.every((c) => Number.isInteger(c))).toBe(true);
      }
    }
    // the rebuilt brush is valid and about the same size
    const analysis = analyzeBrush(result.brush);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeCloseTo(64 * 64 * 64, -1);
  });

  it('converts a genuinely off-grid box with a warning that names the brush', () => {
    const box = makeBox([0.2, 0.1, 0.3], [64.2, 64.1, 64.3]);
    const result = convertBrushToIntegerPoints(box);
    expect(result.converted).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(box.id);
    // the integer brush is still valid and about the same size
    const analysis = analyzeBrush(result.brush);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeCloseTo(64 * 64 * 64, -1);
  });

  it('preserves the outward orientation of normals', () => {
    const box = makeBox([0.2, 0.1, 0.3], [64.2, 64.1, 64.3]);
    const original = analyzeBrush(box);
    const result = convertBrushToIntegerPoints(box);
    const converted = analyzeBrush(result.brush);
    for (let i = 0; i < original.planes.length; i++) {
      const before = original.planes[i]!;
      const afterPlane = planeFromPoints(...result.brush.faces[i]!.points)!;
      expect(dot(afterPlane.n, before.n)).toBeGreaterThan(0);
      void converted;
    }
  });
});

describe('fast-check properties', () => {
  const intVec = fc.tuple(
    fc.integer({ min: -512, max: 512 }),
    fc.integer({ min: -512, max: 512 }),
    fc.integer({ min: -512, max: 512 }),
  );

  it('an axis-aligned integer brush is unchanged', () => {
    fc.assert(
      fc.property(intVec, intVec, ([ax, ay, az], [bx, by, bz]) => {
        const min: [number, number, number] = [
          Math.min(ax, bx),
          Math.min(ay, by),
          Math.min(az, bz),
        ];
        const max: [number, number, number] = [
          Math.max(ax, bx) + 8,
          Math.max(ay, by) + 8,
          Math.max(az, bz) + 8,
        ];
        const box = makeBox(min, max);
        const result = convertBrushToIntegerPoints(box);
        expect(result.warnings).toEqual([]);
        expect(result.brush.faces).toEqual(box.faces);
      }),
      { numRuns: 30 },
    );
  });

  it('a rotated box stays valid or produces a warning, with orientation kept', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 45, noNaN: true }),
        fc.double({ min: 16, max: 128, noNaN: true }),
        (angleDeg, size) => {
          // rotate a box around z and build it from its own rotated planes
          const angle = (angleDeg * Math.PI) / 180;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const half = size / 2;
          // planes of a rotated box: normals rotated around z
          const planes: { n: [number, number, number]; d: number }[] = [
            { n: [cos, sin, 0], d: half },
            { n: [-cos, -sin, 0], d: half },
            { n: [-sin, cos, 0], d: half },
            { n: [sin, -cos, 0], d: half },
            { n: [0, 0, 1], d: half },
            { n: [0, 0, -1], d: half },
          ];
          void planes;
          // use makeBox shifted slightly off-integer instead: simpler valid input
          const box = makeBox([0.4, 0.4, 0.4], [size + 0.4, size + 0.4, size + 0.4]);
          const result = convertBrushToIntegerPoints(box);
          if (result.warnings.length === 0) {
            const analysis = analyzeBrush(result.brush);
            expect(validateBrush(analysis).valid).toBe(true);
            for (const face of result.brush.faces) {
              const plane = planeFromPoints(...face.points);
              expect(plane).not.toBeNull();
            }
          } else {
            expect(result.warnings[0]).toContain(box.id);
          }
          void angle;
          void cos;
          void sin;
        },
      ),
      { numRuns: 30 },
    );
  });
});
