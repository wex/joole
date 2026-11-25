import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { FaceTexture, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { createPrimitiveBrush, type PrimitiveKind } from './primitives';

const tex: FaceTexture = {
  name: 'e2u1/mine10_1',
  offset: [0, 0],
  rotation: 0,
  scale: [1, 1],
  contents: 0,
  flags: 0,
  value: 0,
  attribsInFile: false,
};

function primitive(kind: PrimitiveKind, min: Vec3, max: Vec3, sides = 8) {
  const result = createPrimitiveBrush(kind, { id: 'p', min, max, texture: tex, sides });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('createPrimitiveBrush', () => {
  it('creates a valid box with integer points', () => {
    const brush = primitive('box', [0, 0, 0], [64, 128, 32]);
    const analysis = analyzeBrush(brush);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeCloseTo(64 * 128 * 32, 6);
    expect(brush.faces).toHaveLength(6);
  });

  it('creates a valid wedge with half the box volume', () => {
    const brush = primitive('wedge', [0, 0, 0], [64, 64, 64]);
    const analysis = analyzeBrush(brush);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeCloseTo((64 * 64 * 64) / 2, 5);
    expect(brush.faces).toHaveLength(5);
  });

  it('creates valid cylinder, cone and sphere approximations', () => {
    for (const kind of ['cylinder', 'cone', 'sphere'] as const) {
      const brush = primitive(kind, [-64, -64, 0], [64, 64, 128], 8);
      const analysis = analyzeBrush(brush);
      expect(validateBrush(analysis)).toEqual({ valid: true, reasons: [] });
      expect(analysis.volume).toBeGreaterThan(0);
      for (const face of brush.faces) {
        expect(face.tex.name).toBe('e2u1/mine10_1');
        for (const point of face.points) {
          expect(point.every((x) => Number.isInteger(x))).toBe(true);
        }
      }
    }
  });

  it('rejects degenerate dimensions and side counts', () => {
    expect(
      createPrimitiveBrush('box', {
        id: 'p',
        min: [0, 0, 0],
        max: [0, 8, 8],
        texture: tex,
        sides: 8,
      }).ok,
    ).toBe(false);
    expect(
      createPrimitiveBrush('cylinder', {
        id: 'p',
        min: [0, 0, 0],
        max: [64, 64, 64],
        texture: tex,
        sides: 2,
      }).ok,
    ).toBe(false);
  });

  it('fast-check: grid-aligned primitives are valid convex brushes', () => {
    const arb = fc.record({
      kind: fc.constantFrom<PrimitiveKind>('box', 'wedge', 'cylinder', 'cone', 'sphere'),
      x: fc.integer({ min: 16, max: 128 }),
      y: fc.integer({ min: 16, max: 128 }),
      z: fc.integer({ min: 16, max: 128 }),
      sides: fc.integer({ min: 3, max: 12 }),
    });
    fc.assert(
      fc.property(arb, ({ kind, x, y, z, sides }) => {
        const result = createPrimitiveBrush(kind, {
          id: 'p',
          min: [0, 0, 0],
          max: [x, y, z],
          texture: tex,
          sides: Math.max(8, sides),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(validateBrush(analyzeBrush(result.value)).valid).toBe(true);
        }
      }),
      { numRuns: 80 },
    );
  });
});
