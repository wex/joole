import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeBrush, insideConvexPlanes, subtractBrush, validateBrush } from './index';
import { makeBox } from './__tests__/helpers';
import { planeFromPoints } from './plane';

function volumeSum(brushes: ReturnType<typeof makeBox>[]): number {
  return brushes.reduce((sum, brush) => sum + analyzeBrush(brush).volume, 0);
}

describe('subtractBrush', () => {
  it('subtracting an overlapping corner produces valid fragments with the expected volume', () => {
    const target = makeBox([0, 0, 0], [64, 64, 64]);
    const cutter = makeBox([32, 32, 32], [96, 96, 96]);
    const result = subtractBrush(target, cutter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(1);
    for (const brush of result.value) {
      expect(validateBrush(analyzeBrush(brush)).valid).toBe(true);
    }
    expect(volumeSum(result.value)).toBeCloseTo(64 ** 3 - 32 ** 3, 3);

    const cutterPlanes = cutter.faces.map((face) => planeFromPoints(...face.points)!);
    for (const brush of result.value) {
      for (const polygon of analyzeBrush(brush).polygons) {
        for (const point of polygon ?? []) {
          expect(insideConvexPlanes(point, cutterPlanes)).toBe(false);
        }
      }
    }
  });

  it('fast-check: axis-aligned subtraction fragments are valid and preserve subtracted volume', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -32, max: 48 }),
        fc.integer({ min: -32, max: 48 }),
        fc.integer({ min: -32, max: 48 }),
        fc.integer({ min: 8, max: 48 }),
        (x, y, z, size) => {
          const target = makeBox([0, 0, 0], [64, 64, 64]);
          const cutter = makeBox([x, y, z], [x + size, y + size, z + size]);
          const result = subtractBrush(target, cutter);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const cutterPlanes = cutter.faces.map((face) => planeFromPoints(...face.points)!);
          for (const brush of result.value) {
            const analysis = analyzeBrush(brush);
            expect(validateBrush(analysis).valid).toBe(true);
            for (const polygon of analysis.polygons) {
              for (const point of polygon ?? []) {
                expect(insideConvexPlanes(point, cutterPlanes)).toBe(false);
              }
            }
          }
          const overlap = [0, 1, 2].reduce(
            (product, axis) =>
              product *
              Math.max(0, Math.min(64, [x, y, z][axis]! + size) - Math.max(0, [x, y, z][axis]!)),
            1,
          );
          expect(volumeSum(result.value)).toBeCloseTo(64 ** 3 - overlap, 3);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('returns the target when the brushes do not overlap', () => {
    const target = makeBox([0, 0, 0], [64, 64, 64]);
    const cutter = makeBox([128, 0, 0], [192, 64, 64]);
    const result = subtractBrush(target, cutter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(volumeSum(result.value)).toBeCloseTo(analyzeBrush(target).volume, 6);
  });

  it('returns no brushes when the cutter contains the target', () => {
    const result = subtractBrush(
      makeBox([8, 8, 8], [16, 16, 16]),
      makeBox([0, 0, 0], [64, 64, 64]),
    );
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('rejects invalid inputs', () => {
    const bad = makeBox([0, 0, 0], [0, 64, 64]);
    expect(subtractBrush(bad, makeBox([0, 0, 0], [64, 64, 64]))).toEqual({
      ok: false,
      error: 'invalid-target',
    });
    expect(subtractBrush(makeBox([0, 0, 0], [64, 64, 64]), bad)).toEqual({
      ok: false,
      error: 'invalid-cutter',
    });
  });

  it('new cut faces inherit the cutter texture', () => {
    const cutter = makeBox([32, 32, 32], [96, 96, 96]);
    for (const face of cutter.faces) face.tex = { ...face.tex, name: 'e1u1/cutter' };
    const result = subtractBrush(makeBox([0, 0, 0], [64, 64, 64]), cutter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.some((brush) => brush.faces.some((face) => face.tex.name === 'e1u1/cutter')),
    ).toBe(true);
  });
});
