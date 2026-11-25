import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Vec3 } from '@core/types/index';
import {
  mat4ApplyPoint,
  mat4Invert,
  mat4Multiply,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4Scaling,
  mat4Translation,
} from './mat4';
import { analyzeBrush, validateBrush } from './brush';
import { snapBrushToGrid, transformBrush } from './transform';
import { makeBox } from './__tests__/helpers';

function expectVecClose(actual: Vec3, expected: Vec3, precision = 8): void {
  for (let i = 0; i < 3; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, precision);
  }
}

describe('mat4Invert', () => {
  it('inverts affine translate/rotate/scale chains', () => {
    const m = mat4Multiply(
      mat4Translation([10, -4, 7]),
      mat4Multiply(mat4RotationZ(30), mat4Multiply(mat4RotationY(15), mat4Scaling([2, 3, 4]))),
    );
    const inv = mat4Invert(m);
    expect(inv).not.toBeNull();
    expectVecClose(mat4ApplyPoint(inv!, mat4ApplyPoint(m, [3, 5, 7])), [3, 5, 7]);
  });

  it('returns null for a singular matrix', () => {
    expect(mat4Invert(mat4Scaling([1, 0, 1]))).toBeNull();
  });

  it('fast-check: inverse transforms round-trip points', () => {
    const arb = fc.record({
      tx: fc.double({ min: -100, max: 100, noNaN: true }),
      ty: fc.double({ min: -100, max: 100, noNaN: true }),
      tz: fc.double({ min: -100, max: 100, noNaN: true }),
      angle: fc.double({ min: -180, max: 180, noNaN: true }),
      scale: fc.double({ min: 0.25, max: 4, noNaN: true }),
    });
    fc.assert(
      fc.property(arb, ({ tx, ty, tz, angle, scale }) => {
        const m = mat4Multiply(
          mat4Translation([tx, ty, tz]),
          mat4Multiply(mat4RotationZ(angle), mat4Scaling([scale, scale, scale])),
        );
        const inv = mat4Invert(m)!;
        const p: Vec3 = [tx / 3 + 1, ty / 4 - 2, tz / 5 + 3];
        expectVecClose(mat4ApplyPoint(inv, mat4ApplyPoint(m, p)), p, 7);
      }),
      { numRuns: 50 },
    );
  });
});

describe('transformBrush and snapping', () => {
  it('moves all face points and leaves texture parameters unchanged', () => {
    const source = makeBox([0, 0, 0], [64, 64, 64]);
    const result = transformBrush(source, mat4Translation([8, 16, 32]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeBrush(result.value);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.aabb!.min).toEqual([8, 16, 32]);
    expect(result.value.faces[0]!.tex).toBe(source.faces[0]!.tex);
  });

  it('rejects transforms that produce invalid brushes', () => {
    const source = makeBox([0, 0, 0], [64, 64, 64]);
    const result = transformBrush(source, mat4Scaling([1, 0, 1]));
    expect(result.ok).toBe(false);
  });

  it('fast-check: positive affine transforms keep boxes valid', () => {
    const arb = fc.record({
      tx: fc.integer({ min: -64, max: 64 }),
      ty: fc.integer({ min: -64, max: 64 }),
      tz: fc.integer({ min: -64, max: 64 }),
      rx: fc.double({ min: -180, max: 180, noNaN: true }),
      ry: fc.double({ min: -180, max: 180, noNaN: true }),
      rz: fc.double({ min: -180, max: 180, noNaN: true }),
      scale: fc.double({ min: 0.5, max: 3, noNaN: true }),
    });
    fc.assert(
      fc.property(arb, ({ tx, ty, tz, rx, ry, rz, scale }) => {
        const m = mat4Multiply(
          mat4Translation([tx, ty, tz]),
          mat4Multiply(
            mat4RotationZ(rz),
            mat4Multiply(
              mat4RotationY(ry),
              mat4Multiply(mat4RotationX(rx), mat4Scaling([scale, scale, scale])),
            ),
          ),
        );
        const result = transformBrush(makeBox([0, 0, 0], [64, 64, 64]), m);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(validateBrush(analyzeBrush(result.value)).valid).toBe(true);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('snaps face points to the grid only when asked', () => {
    const source = makeBox([1.2, 2.1, 0], [63.8, 65.2, 64]);
    const result = snapBrushToGrid(source, 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const face of result.value.faces) {
      for (const point of face.points) {
        for (const component of point) {
          expect(component % 8).toBeCloseTo(0, 8);
        }
      }
    }
  });
});

describe('flipBrush', () => {
  it('mirrors a box across an axis plane through its center exactly', async () => {
    const { flipBrush } = await import('./transform');
    const box = makeBox([0, 0, 0], [64, 32, 16]);
    const result = flipBrush(box, 0, 32);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeBrush(result.value);
    expect(validateBrush(analysis).valid).toBe(true);
    expectVecClose(analysis.aabb!.min, [0, 0, 0]);
    expectVecClose(analysis.aabb!.max, [64, 32, 16]);
    expect(analysis.volume).toBeCloseTo(64 * 32 * 16, 6);
  });

  it('fast-check: flipping twice is the identity and the volume is preserved', async () => {
    const { flipBrush } = await import('./transform');
    const arb = fc.record({
      min: fc.tuple(
        fc.integer({ min: -256, max: 0 }),
        fc.integer({ min: -256, max: 0 }),
        fc.integer({ min: -256, max: 0 }),
      ),
      size: fc.tuple(
        fc.integer({ min: 4, max: 256 }),
        fc.integer({ min: 4, max: 256 }),
        fc.integer({ min: 4, max: 256 }),
      ),
      axis: fc.constantFrom(0, 1, 2) as fc.Arbitrary<0 | 1 | 2>,
    });
    fc.assert(
      fc.property(arb, ({ min, size, axis }) => {
        const box = makeBox(min as [number, number, number], [
          min[0] + size[0],
          min[1] + size[1],
          min[2] + size[2],
        ]);
        const once = flipBrush(box, axis);
        expect(once.ok).toBe(true);
        if (!once.ok) return;
        expect(validateBrush(analyzeBrush(once.value)).valid).toBe(true);
        expect(analyzeBrush(once.value).volume).toBeCloseTo(analyzeBrush(box).volume, 5);
        const twice = flipBrush(once.value, axis);
        expect(twice.ok).toBe(true);
        if (!twice.ok) return;
        expect(twice.value.faces).toEqual(box.faces);
      }),
      { numRuns: 50 },
    );
  });
});

describe('rotate90Brush', () => {
  it('rotates exactly, keeping integer coordinates integral', async () => {
    const { rotate90Brush } = await import('./transform');
    const box = makeBox([16, 8, 0], [48, 24, 32]);
    const result = rotate90Brush(box, [0, 0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeBrush(result.value);
    expect(validateBrush(analysis).valid).toBe(true);
    expectVecClose(analysis.aabb!.min, [-24, 16, 0]);
    expectVecClose(analysis.aabb!.max, [-8, 48, 32]);
    for (const face of result.value.faces) {
      for (const point of face.points) {
        for (const c of point) expect(Number.isInteger(c)).toBe(true);
      }
    }
  });

  it('fast-check: four quarter turns are the identity', async () => {
    const { rotate90Brush } = await import('./transform');
    fc.assert(
      fc.property(
        fc.integer({ min: -128, max: 0 }),
        fc.integer({ min: -128, max: 0 }),
        fc.integer({ min: 4, max: 128 }),
        (x, y, size) => {
          let brush = makeBox([x, y, 0], [x + size, y + size, 64]);
          const original = brush.faces;
          for (let i = 0; i < 4; i++) {
            const result = rotate90Brush(brush, [0, 0]);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            brush = result.value;
          }
          expect(brush.faces).toEqual(original);
        },
      ),
      { numRuns: 50 },
    );
  });
});
