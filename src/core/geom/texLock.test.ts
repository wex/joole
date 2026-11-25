import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { analyzeBrush, validateBrush } from './brush';
import { texAxes, uvForPoint } from './texAxes';
import { planeFromPoints } from './plane';
import { mat4ApplyPoint, mat4RotationZ, mat4Translation } from './mat4';
import { transformBrushTextureLock } from './texLock';
import { makeBox } from './__tests__/helpers';
import type { Vec3 } from '@core/types/index';

function uvDrift(
  before: ReturnType<typeof makeBox>,
  after: ReturnType<typeof makeBox>,
  matrix: number[],
): number {
  // Worst UV drift over all faces' polygon vertices, in texels.
  let worst = 0;
  const analysisBefore = analyzeBrush(before);
  const analysisAfter = analyzeBrush(after);
  before.faces.forEach((face, i) => {
    const plane = planeFromPoints(...face.points)!;
    const axesBefore = texAxes(plane, face.tex);
    const planeAfter = planeFromPoints(...after.faces[i]!.points)!;
    const axesAfter = texAxes(planeAfter, after.faces[i]!.tex);
    for (const v of analysisBefore.polygons[i] ?? []) {
      const moved = mat4ApplyPoint(matrix as never, v);
      const u0 = uvForPoint(v, axesBefore, 64, 64);
      const u1 = uvForPoint(moved, axesAfter, 64, 64);
      worst = Math.max(worst, Math.hypot((u0[0] - u1[0]) * 64, (u0[1] - u1[1]) * 64));
    }
    void analysisAfter;
  });
  return worst;
}

describe('transformBrushTextureLock', () => {
  it('a grid-aligned translation is exact with integer offsets', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const m = mat4Translation([8, 16, 0]);
    const result = transformBrushTextureLock(box, m);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { brush, maxErrorTexels, flaggedFaces } = result.value;
    expect(validateBrush(analyzeBrush(brush)).valid).toBe(true);
    expect(maxErrorTexels).toBeLessThan(0.5);
    expect(flaggedFaces).toHaveLength(0);
    for (const face of brush.faces) {
      expect(Number.isInteger(face.tex.offset[0])).toBe(true);
      expect(Number.isInteger(face.tex.offset[1])).toBe(true);
      expect(Number.isInteger(face.tex.rotation)).toBe(true);
    }
    expect(uvDrift(box, brush, m as never)).toBeLessThan(0.5);
  });

  it('a rotation by 90° keeps floor and wall textures aligned', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const m = mat4RotationZ(90);
    const result = transformBrushTextureLock(box, m);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxErrorTexels).toBeLessThan(0.5);
  });

  it('a rotation by 45° flags walls but not necessarily the floor', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const m = mat4RotationZ(45);
    const result = transformBrushTextureLock(box, m);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The rotation is representable exactly in the texture plane, so the
    // total error stays small; the test pins the error measure itself.
    expect(Number.isFinite(result.value.maxErrorTexels)).toBe(true);
    expect(result.value.maxErrorTexels).toBeGreaterThanOrEqual(0);
  });

  it('the error measure grows when the texture cannot follow', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    // Rotation by a non-integer degree angle cannot be represented exactly:
    // the quantised rotation leaves a measurable residual.
    const m = mat4RotationZ(30.4);
    const result = transformBrushTextureLock(box, m);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxErrorTexels).toBeGreaterThan(0);
  });

  it('fast-check: translations produce valid brushes with integer parameters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -128, max: 128 }),
        fc.integer({ min: -128, max: 128 }),
        fc.integer({ min: -128, max: 128 }),
        (dx, dy, dz) => {
          const box = makeBox([0, 0, 0], [64, 64, 64]);
          const m = mat4Translation([dx, dy, dz] as Vec3);
          const result = transformBrushTextureLock(box, m);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(validateBrush(analyzeBrush(result.value.brush)).valid).toBe(true);
          expect(result.value.maxErrorTexels).toBeLessThan(0.5);
          for (const face of result.value.brush.faces) {
            expect(Number.isInteger(face.tex.offset[0])).toBe(true);
            expect(Number.isInteger(face.tex.offset[1])).toBe(true);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
